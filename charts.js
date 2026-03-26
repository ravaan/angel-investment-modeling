"use strict";
const Charts = {
  colors: {
    base: "#4a9e5c",
    bull: "#6ba3d6",
    bear: "#c77da0",
    stages: ["#6ba3d6", "#4a9e5c", "#b8922a", "#c77da0"],
  },
  svg(tag, attrs, children) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (children)
      children.forEach((c) => {
        if (typeof c === "string") el.textContent = c;
        else if (c) el.appendChild(c);
      });
    return el;
  },
  fmtShort(n) {
    if (Math.abs(n) >= 1e7) return (n / 1e7).toFixed(1) + " Cr";
    if (Math.abs(n) >= 1e5) return (n / 1e5).toFixed(1) + " L";
    return Math.round(n).toLocaleString("en-IN");
  },

  donut(container, values, labels, colors) {
    container.innerHTML = "";
    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return;
    const W = 340,
      H = 220,
      cx = 95,
      cy = 110,
      R = 85,
      r = 52;
    const root = this.svg("svg", {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "Stage allocation",
    });
    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      const x1 = cx + R * Math.cos(angle),
        y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(angle + slice),
        y2 = cy + R * Math.sin(angle + slice);
      const ix1 = cx + r * Math.cos(angle + slice),
        iy1 = cy + r * Math.sin(angle + slice);
      const ix2 = cx + r * Math.cos(angle),
        iy2 = cy + r * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      const d = `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix1},${iy1} A${r},${r} 0 ${large},0 ${ix2},${iy2} Z`;
      const path = this.svg("path", { d, fill: colors[i], opacity: "0.85" });
      const title = this.svg("title");
      title.textContent = `${labels[i]}: ${(v * 100).toFixed(0)}%`;
      path.appendChild(title);
      root.appendChild(path);
      angle += slice;
    });
    labels.forEach((l, i) => {
      const y = 30 + i * 24;
      root.appendChild(
        this.svg("rect", {
          x: 200,
          y: y - 6,
          width: 14,
          height: 14,
          rx: 3,
          fill: colors[i],
        }),
      );
      const txt = this.svg("text", {
        x: 220,
        y: y + 5,
        fill: "currentColor",
        "font-size": "13",
      });
      txt.textContent = `${l} ${(values[i] * 100).toFixed(0)}%`;
      root.appendChild(txt);
    });
    container.appendChild(root);
  },

  line(container, series, labels, title) {
    container.innerHTML = "";
    const W = 440,
      H = 300,
      pad = { t: 24, r: 16, b: 30, l: 56 };
    const pw = W - pad.l - pad.r,
      ph = H - pad.t - pad.b;
    const root = this.svg("svg", {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": title,
    });
    let yMin = Infinity,
      yMax = -Infinity;
    series.forEach((s) =>
      s.data.forEach((v) => {
        yMin = Math.min(yMin, v);
        yMax = Math.max(yMax, v);
      }),
    );
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yRange = yMax - yMin;
    yMin -= yRange * 0.05;
    yMax += yRange * 0.05;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * ph;
      root.appendChild(
        this.svg("line", {
          x1: pad.l,
          y1: y,
          x2: W - pad.r,
          y2: y,
          stroke: "currentColor",
          "stroke-opacity": "0.1",
        }),
      );
      const val = yMax - (i / 4) * (yMax - yMin);
      const lbl = this.svg("text", {
        x: pad.l - 6,
        y: y + 4,
        fill: "currentColor",
        "font-size": "10",
        "text-anchor": "end",
      });
      lbl.textContent = this.fmtShort(val);
      root.appendChild(lbl);
    }
    labels.forEach((l, i) => {
      const x = pad.l + (i / (labels.length - 1)) * pw;
      const lbl = this.svg("text", {
        x,
        y: H - 8,
        fill: "currentColor",
        "font-size": "10",
        "text-anchor": "middle",
      });
      lbl.textContent = l;
      root.appendChild(lbl);
    });
    const colors = [this.colors.base, this.colors.bull, this.colors.bear];
    series.forEach((s, si) => {
      const pts = s.data
        .map((v, i) => {
          const x = pad.l + (i / (s.data.length - 1)) * pw;
          const y = pad.t + (1 - (v - yMin) / (yMax - yMin)) * ph;
          return `${x},${y}`;
        })
        .join(" ");
      root.appendChild(
        this.svg("polyline", {
          points: pts,
          fill: "none",
          stroke: colors[si],
          "stroke-width": "2.5",
          "stroke-linejoin": "round",
        }),
      );
      s.data.forEach((v, i) => {
        const x = pad.l + (i / (s.data.length - 1)) * pw;
        const y = pad.t + (1 - (v - yMin) / (yMax - yMin)) * ph;
        const dot = this.svg("circle", {
          cx: x,
          cy: y,
          r: 3,
          fill: colors[si],
        });
        const tip = this.svg("title");
        tip.textContent = `${s.name} Yr${i + 1}: ${this.fmtShort(v)}`;
        dot.appendChild(tip);
        root.appendChild(dot);
      });
    });
    series.forEach((s, i) => {
      const lx = pad.l + i * 90;
      root.appendChild(
        this.svg("line", {
          x1: lx,
          y1: 10,
          x2: lx + 16,
          y2: 10,
          stroke: colors[i],
          "stroke-width": "2.5",
        }),
      );
      const lt = this.svg("text", {
        x: lx + 20,
        y: 14,
        fill: "currentColor",
        "font-size": "10",
      });
      lt.textContent = s.name;
      root.appendChild(lt);
    });
    container.appendChild(root);
  },

  bar(container, categories, values, colors, title) {
    container.innerHTML = "";
    const n = categories.length;
    const W = n <= 3 ? 340 : 440,
      H = 260,
      pad = { t: 16, r: 16, b: 40, l: 50 };
    const pw = W - pad.l - pad.r,
      ph = H - pad.t - pad.b;
    const root = this.svg("svg", {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": title,
    });
    const yMax = Math.max(...values) * 1.15 || 1;
    const barW = (pw / n) * 0.6;
    const gap = pw / n;
    categories.forEach((cat, i) => {
      const x = pad.l + i * gap + (gap - barW) / 2;
      const barH = (values[i] / yMax) * ph;
      const y = pad.t + ph - barH;
      root.appendChild(
        this.svg("rect", {
          x,
          y,
          width: barW,
          height: barH,
          rx: 3,
          fill: colors[i % colors.length],
          opacity: "0.85",
        }),
      );
      const vt = this.svg("text", {
        x: x + barW / 2,
        y: y - 5,
        fill: "currentColor",
        "font-size": "11",
        "text-anchor": "middle",
      });
      vt.textContent = this.fmtShort(values[i]);
      root.appendChild(vt);
      const ct = this.svg("text", {
        x: x + barW / 2,
        y: H - 10,
        fill: "currentColor",
        "font-size": "10",
        "text-anchor": "middle",
      });
      ct.textContent = cat;
      root.appendChild(ct);
    });
    container.appendChild(root);
  },

  area(container, series, labels, title) {
    container.innerHTML = "";
    const W = 440,
      H = 300,
      pad = { t: 24, r: 16, b: 30, l: 56 };
    const pw = W - pad.l - pad.r,
      ph = H - pad.t - pad.b;
    const root = this.svg("svg", {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": title,
    });
    const stacked = series[0].data.map((_, i) =>
      series.reduce((a, s) => a + s.data[i], 0),
    );
    const yMax = Math.max(...stacked) * 1.1 || 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * ph;
      root.appendChild(
        this.svg("line", {
          x1: pad.l,
          y1: y,
          x2: W - pad.r,
          y2: y,
          stroke: "currentColor",
          "stroke-opacity": "0.1",
        }),
      );
      const val = yMax - (i / 4) * yMax;
      const lbl = this.svg("text", {
        x: pad.l - 6,
        y: y + 4,
        fill: "currentColor",
        "font-size": "10",
        "text-anchor": "end",
      });
      lbl.textContent = this.fmtShort(val);
      root.appendChild(lbl);
    }
    labels.forEach((l, i) => {
      const x = pad.l + (i / (labels.length - 1)) * pw;
      const lt = this.svg("text", {
        x,
        y: H - 8,
        fill: "currentColor",
        "font-size": "10",
        "text-anchor": "middle",
      });
      lt.textContent = l;
      root.appendChild(lt);
    });
    const areaColors = [this.colors.base, this.colors.bull];
    let baseline = series[0].data.map(() => 0);
    series.forEach((s, si) => {
      const topPts = s.data.map((v, i) => {
        const x = pad.l + (i / (s.data.length - 1)) * pw;
        const y = pad.t + (1 - (baseline[i] + v) / yMax) * ph;
        return `${x},${y}`;
      });
      const botPts = [...baseline].reverse().map((v, i) => {
        const idx = s.data.length - 1 - i;
        const x = pad.l + (idx / (s.data.length - 1)) * pw;
        const y = pad.t + (1 - v / yMax) * ph;
        return `${x},${y}`;
      });
      root.appendChild(
        this.svg("polygon", {
          points: topPts.join(" ") + " " + botPts.join(" "),
          fill: areaColors[si % areaColors.length],
          opacity: "0.4",
        }),
      );
      root.appendChild(
        this.svg("polyline", {
          points: topPts.join(" "),
          fill: "none",
          stroke: areaColors[si % areaColors.length],
          "stroke-width": "2",
        }),
      );
      baseline = baseline.map((v, i) => v + s.data[i]);
    });
    series.forEach((s, i) => {
      const lx = pad.l + i * 130;
      root.appendChild(
        this.svg("rect", {
          x: lx,
          y: 8,
          width: 12,
          height: 12,
          rx: 2,
          fill: areaColors[i % areaColors.length],
          opacity: "0.6",
        }),
      );
      const lt = this.svg("text", {
        x: lx + 17,
        y: 17,
        fill: "currentColor",
        "font-size": "10",
      });
      lt.textContent = s.name;
      root.appendChild(lt);
    });
    container.appendChild(root);
  },

  heatColor(val, min, max) {
    const t = max > min ? (val - min) / (max - min) : 0.5;
    const r = t < 0.5 ? 190 : Math.round(190 - (t - 0.5) * 2 * 110);
    const g = t < 0.5 ? Math.round(120 + t * 2 * 100) : 180;
    const b = t < 0.5 ? 100 : Math.round(100 - (t - 0.5) * 2 * 30);
    return `rgb(${r},${g},${b})`;
  },
};
