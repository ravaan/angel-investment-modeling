"use strict";
(function () {
  const state = JSON.parse(JSON.stringify(DEFAULTS));
  let computed = null;
  let rafPending = false;

  // Formatting
  const fmtINR = (n) => {
    if (n == null || isNaN(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e7)
      return (n < 0 ? "-" : "") + "₹" + (a / 1e7).toFixed(1) + " Cr";
    if (a >= 1e5) return (n < 0 ? "-" : "") + "₹" + (a / 1e5).toFixed(1) + " L";
    return (
      "₹" +
      new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)
    );
  };
  const fmtPct = (n) =>
    n == null || isNaN(n) ? "—" : (n * 100).toFixed(1) + "%";
  const fmtMult = (n) => (n == null || isNaN(n) ? "—" : n.toFixed(1) + "x");

  // State access
  function getVal(obj, path) {
    return path
      .split(".")
      .reduce((o, k) => (o != null ? o[k] : undefined), obj);
  }
  function setVal(obj, path, val) {
    const p = path.split(".");
    let c = obj;
    for (let i = 0; i < p.length - 1; i++) c = c[p[i]];
    c[p[p.length - 1]] = val;
  }

  // Input parsing
  function parseInput(el) {
    const raw = el.value.replace(/[₹,%x\s]/g, "").replace(/,/g, "");
    let val = parseFloat(raw);
    if (isNaN(val)) return null;
    if (el.dataset.fmt === "pct") val /= 100;
    return val;
  }
  function displayInput(el, val) {
    const f = el.dataset.fmt;
    if (f === "inr")
      el.value =
        val != null
          ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
              val,
            )
          : "";
    else if (f === "pct") el.value = val != null ? (val * 100).toFixed(1) : "";
    else if (f === "mult") el.value = val != null ? val.toFixed(1) : "";
    else el.value = val != null ? val : "";
  }

  // Aria labels for table inputs
  const SN = ["Pre-Seed", "Seed", "Series A", "Series B"];
  const ON = ["Failure", "Partial", "Moderate", "Winner", "Home Run"];
  const MN = ["Partial", "Moderate", "Winner", "Home Run"];
  function addAria(el, key) {
    if (!el.closest(".input-table")) return;
    const p = key.split(".");
    if (p[0] === "prob" && p.length === 3)
      el.setAttribute("aria-label", ON[p[2]] + " prob for " + SN[p[1]]);
    else if (p[0] === "mult" && p.length === 3)
      el.setAttribute("aria-label", MN[p[2]] + " mult for " + SN[p[1]]);
    else if (p[0] === "dilution_per_round")
      el.setAttribute("aria-label", "Dilution/round " + SN[p[1]]);
    else if (p[0] === "rounds_to_exit")
      el.setAttribute("aria-label", "Rounds to exit " + SN[p[1]]);
  }

  // Bind inputs
  function bindInputs() {
    document.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      addAria(el, key);
      displayInput(el, getVal(state, key));
      el.addEventListener("input", () => {
        const v = parseInput(el);
        if (v === null) return;
        setVal(state, key, v);
        scheduleRecompute();
      });
      el.addEventListener("blur", () => displayInput(el, getVal(state, key)));
      el.addEventListener("focus", () => {
        const v = getVal(state, key),
          f = el.dataset.fmt;
        if (f === "pct") el.value = v != null ? (v * 100).toFixed(1) : "";
        else if (f === "inr" || f === "mult")
          el.value = v != null ? (f === "mult" ? v.toFixed(1) : v) : "";
      });
    });
  }

  function scheduleRecompute() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      computed = recalcAll(state);
      render();
      rafPending = false;
    });
  }

  // Output helper
  function out(key, text) {
    const el = document.querySelector('[data-out="' + key + '"]');
    if (el) el.textContent = text;
    return el;
  }

  // Render
  function render() {
    if (!computed) return;
    renderConfig();
    renderCharts();
    renderFloater();
  }

  function renderConfig() {
    const c = computed.capital,
      t = computed.tiers;
    out("totalCapital", fmtINR(c.total));
    out("investable", fmtINR(c.investable));
    out("reserve", fmtINR(c.reserve));
    out("deals_t1", t.deals1);
    out("deals_t2", t.deals2);
    out("totalDeals", t.totalDeals);
    out("avgCheck", fmtINR(t.avgCheck));

    const mixSum = state.stage_mix.reduce((a, b) => a + b, 0);
    const el = out("stageMixSum", fmtPct(mixSum));
    if (el) {
      el.classList.toggle("invalid", Math.abs(mixSum - 1) > 0.01);
      el.classList.toggle("valid", Math.abs(mixSum - 1) <= 0.01);
    }

    for (let si = 0; si < 4; si++) {
      const sum = state.prob[si].reduce((a, b) => a + b, 0);
      const pel = out("probSum" + si, fmtPct(sum));
      if (pel) {
        pel.classList.toggle("invalid", Math.abs(sum - 1) > 0.01);
        pel.classList.toggle("valid", Math.abs(sum - 1) <= 0.01);
      }
    }
  }

  function renderCharts() {
    const jc = computed.jCurve,
      m = computed.moic,
      nw = computed.networth;
    const oc = computed.oppcost,
      s = computed.sensitivity;

    // 1. Stage donut
    Charts.donut(
      document.getElementById("chart-stage-alloc"),
      state.stage_mix,
      STAGES,
      Charts.colors.stages,
    );

    // 2. J-curve line
    Charts.line(
      document.getElementById("chart-jcurve"),
      [
        { name: "Base", data: jc.base },
        { name: "Bull", data: jc.bull },
        { name: "Bear", data: jc.bear },
      ],
      Array.from({ length: 10 }, (_, i) => "Yr " + (i + 1)),
      "Portfolio Value Over Time",
    );

    // 3. MOIC bar
    Charts.bar(
      document.getElementById("chart-moic"),
      ["Base", "Bull", "Bear"],
      [m.base.yr10, m.bull.yr10, m.bear.yr10],
      [Charts.colors.base, Charts.colors.bull, Charts.colors.bear],
      "MOIC at Year 10",
    );

    // 4. Net worth area
    Charts.area(
      document.getElementById("chart-networth"),
      [
        { name: "NW (ex-Angel)", data: nw.map((r) => r.nwExAngel) },
        { name: "Angel Portfolio", data: nw.map((r) => r.angelVal) },
      ],
      nw.map((r) => "Yr " + r.yr),
      "Net Worth Composition",
    );

    // 5. Opp cost bar
    const yr8 = oc[7];
    if (yr8) {
      Charts.bar(
        document.getElementById("chart-oppcost"),
        ["Nifty", "FD", "Balanced", "Angel Base", "Angel Bull"],
        [yr8.nifty, yr8.fd, yr8.balanced, jc.base[7], jc.bull[7]],
        [
          Charts.colors.bull,
          Charts.colors.bear,
          Charts.colors.stages[2],
          Charts.colors.base,
          Charts.colors.bull,
        ],
        "Value at Year 8",
      );
    }

    // 6. Sensitivity heatmap (Table 5)
    const t5 = s.t5,
      mm = s.multMods,
      fm = s.failMods;
    const allV = t5.flatMap((r) => r.values);
    const vMin = Math.min(...allV),
      vMax = Math.max(...allV);
    let h = '<table class="heatmap"><thead><tr><th>Fail \\ Mult</th>';
    mm.forEach((m) => (h += "<th>" + m.label + "</th>"));
    h += "</tr></thead><tbody>";
    t5.forEach((row) => {
      h += "<tr><td>" + row.label + "</td>";
      row.values.forEach(
        (v) =>
          (h +=
            '<td style="background:' +
            Charts.heatColor(v, vMin, vMax) +
            ';color:#000">' +
            fmtMult(v) +
            "</td>"),
      );
      h += "</tr>";
    });
    h += "</tbody></table>";
    document.getElementById("chart-sensitivity").innerHTML = h;
  }

  function renderFloater() {
    const f = computed.fees,
      m = computed.moic,
      irr = computed.irr;
    const nw10 = computed.networth[10],
      oc8 = computed.oppcost[7];
    const inv = computed.capital.total;
    const pt = computed.postTaxMOIC;
    const items = [
      ["Deals", "" + computed.tiers.totalDeals, false],
      ["Invested", fmtINR(inv), false],
      ["Gross MOIC", fmtMult(f.grossMOIC), false],
      ["Net MOIC", fmtMult(f.netMOIC), true],
      ["Base@10", fmtMult(m.base.yr10), false],
      ["Bull@10", fmtMult(m.bull.yr10), false],
      ["Bear@10", fmtMult(m.bear.yr10), false],
      ["IRR", isNaN(irr.base) ? "N/A" : fmtPct(irr.base), false],
      ["NW@10", fmtINR(nw10 ? nw10.totalNW : 0), false],
      ["Angel%", fmtPct(nw10 ? nw10.angelPct : 0), false],
      ["vs Nifty", inv > 0 && oc8 ? fmtMult(oc8.nifty / inv) : "—", false],
    ];
    let html = "";
    items.forEach(([l, v, accent]) => {
      html +=
        '<span class="metric-pill">' +
        l +
        " <strong" +
        (accent ? ' class="accent"' : "") +
        ">" +
        v +
        "</strong></span>";
    });
    document.getElementById("metrics-floater").innerHTML = html;
  }

  // Theme
  const themes = ["dark", "light", "amber"],
    themeIcons = ["◐", "☀", "◑"];
  let themeIdx = 0;
  function cycleTheme() {
    themeIdx = (themeIdx + 1) % themes.length;
    document.documentElement.dataset.theme = themes[themeIdx];
    document.querySelector("#theme-toggle .icon").textContent =
      themeIcons[themeIdx];
    localStorage.setItem("theme", themes[themeIdx]);
    Sound.play("theme");
    showToast("Theme: " + themes[themeIdx]);
  }
  function loadTheme() {
    const saved = localStorage.getItem("theme");
    if (saved && themes.includes(saved)) themeIdx = themes.indexOf(saved);
    else if (window.matchMedia("(prefers-color-scheme: light)").matches)
      themeIdx = 1;
    document.documentElement.dataset.theme = themes[themeIdx];
    document.querySelector("#theme-toggle .icon").textContent =
      themeIcons[themeIdx];
  }

  // Toast
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
  }

  // Keyboard
  let helpBuf = "";
  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (e.key === "t" || e.key === "T") {
        cycleTheme();
        return;
      }
      if (e.key === "s" || e.key === "S") {
        const on = Sound.toggle();
        document.querySelector("#sound-toggle .icon").textContent = on
          ? "♪"
          : "♩";
        showToast("Sound: " + (on ? "On" : "Off"));
        return;
      }
      if (e.key === "?") {
        document.getElementById("help-dialog").showModal();
        return;
      }
      helpBuf += e.key.toLowerCase();
      if (helpBuf.length > 10) helpBuf = helpBuf.slice(-10);
      if (helpBuf.endsWith("help")) {
        document.getElementById("help-dialog").showModal();
        helpBuf = "";
      }
    });
  }

  // Controls
  function bindControls() {
    document
      .getElementById("theme-toggle")
      .addEventListener("click", cycleTheme);
    document.getElementById("sound-toggle").addEventListener("click", () => {
      const on = Sound.toggle();
      document.querySelector("#sound-toggle .icon").textContent = on
        ? "♪"
        : "♩";
      showToast("Sound: " + (on ? "On" : "Off"));
    });
    document
      .getElementById("help-btn")
      .addEventListener("click", () =>
        document.getElementById("help-dialog").showModal(),
      );
    document
      .getElementById("help-close")
      .addEventListener("click", () =>
        document.getElementById("help-dialog").close(),
      );
  }

  // Grid toggle
  let gridCols = localStorage.getItem("gridCols") || "3";
  function initGrid() {
    const grid = document.getElementById("charts-grid");
    if (gridCols === "3") grid.classList.add("cols-3");
    document.getElementById("grid-icon").textContent =
      gridCols === "3" ? "▤" : "▦";
    document.getElementById("grid-toggle").addEventListener("click", () => {
      gridCols = gridCols === "2" ? "3" : "2";
      grid.classList.toggle("cols-3", gridCols === "3");
      document.getElementById("grid-icon").textContent =
        gridCols === "3" ? "▤" : "▦";
      localStorage.setItem("gridCols", gridCols);
      render();
      Sound.play("tab");
    });
  }

  // Drag and drop
  function initDnD() {
    const grid = document.getElementById("charts-grid");
    let dragEl = null;
    // Restore order
    const saved = localStorage.getItem("chartOrder");
    if (saved) {
      try {
        const order = JSON.parse(saved);
        const cells = Array.from(grid.children);
        const map = {};
        cells.forEach((c) => (map[c.dataset.chart] = c));
        order.forEach((id) => {
          if (map[id]) grid.appendChild(map[id]);
        });
      } catch (e) {}
    }
    grid.addEventListener("dragstart", (e) => {
      const cell = e.target.closest(".chart-cell");
      if (!cell) return;
      dragEl = cell;
      cell.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    grid.addEventListener("dragover", (e) => {
      e.preventDefault();
      const cell = e.target.closest(".chart-cell");
      if (cell && cell !== dragEl) cell.classList.add("drag-over");
    });
    grid.addEventListener("dragleave", (e) => {
      const cell = e.target.closest(".chart-cell");
      if (cell) cell.classList.remove("drag-over");
    });
    grid.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = e.target.closest(".chart-cell");
      if (!target || !dragEl || target === dragEl) return;
      target.classList.remove("drag-over");
      const tmp = document.createElement("div");
      grid.replaceChild(tmp, dragEl);
      grid.replaceChild(dragEl, target);
      grid.replaceChild(target, tmp);
      // Save order
      const newOrder = Array.from(grid.children).map((c) => c.dataset.chart);
      localStorage.setItem("chartOrder", JSON.stringify(newOrder));
      render();
    });
    grid.addEventListener("dragend", () => {
      if (dragEl) dragEl.classList.remove("dragging");
      grid
        .querySelectorAll(".drag-over")
        .forEach((c) => c.classList.remove("drag-over"));
      dragEl = null;
    });
  }

  // Init
  function init() {
    loadTheme();
    Sound.load();
    document.querySelector("#sound-toggle .icon").textContent = Sound.enabled
      ? "♪"
      : "♩";
    bindInputs();
    bindKeyboard();
    bindControls();
    initGrid();
    initDnD();
    computed = recalcAll(state);
    render();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
