/**
 * Angel Investment Model — Sound System (Web Audio API)
 */
"use strict";

const Sound = {
  ctx: null,
  enabled: false,

  init() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled && !this.ctx) this.init();
    localStorage.setItem("sound", this.enabled ? "1" : "0");
    return this.enabled;
  },

  load() {
    this.enabled = localStorage.getItem("sound") === "1";
  },

  play(type) {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      const presets = {
        click: { freq: 800, dur: 0.05, wave: "sine", vol: 0.08 },
        tab: { freq: 600, dur: 0.08, wave: "triangle", vol: 0.06 },
        error: { freq: 200, dur: 0.15, wave: "sawtooth", vol: 0.05 },
        success: { freq: 1000, dur: 0.1, wave: "sine", vol: 0.06 },
        theme: { freq: 440, dur: 0.12, wave: "sine", vol: 0.05 },
      };
      const p = presets[type] || presets.click;
      osc.type = p.wave;
      osc.frequency.value = p.freq;
      gain.gain.setValueAtTime(p.vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + p.dur,
      );
      osc.start();
      osc.stop(this.ctx.currentTime + p.dur);
    } catch (e) {
      /* silent fail */
    }
  },
};
