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

    // 7. Post-tax MOIC by horizon
    const pt = computed.postTaxMOIC;
    Charts.bar(
      document.getElementById("chart-posttax"),
      [
        "Base 5",
        "Bull 5",
        "Bear 5",
        "Base 7",
        "Bull 7",
        "Bear 7",
        "Base 10",
        "Bull 10",
        "Bear 10",
      ],
      [
        pt.base.yr5,
        pt.bull.yr5,
        pt.bear.yr5,
        pt.base.yr7,
        pt.bull.yr7,
        pt.bear.yr7,
        pt.base.yr10,
        pt.bull.yr10,
        pt.bear.yr10,
      ],
      [
        Charts.colors.base,
        Charts.colors.bull,
        Charts.colors.bear,
        Charts.colors.base,
        Charts.colors.bull,
        Charts.colors.bear,
        Charts.colors.base,
        Charts.colors.bull,
        Charts.colors.bear,
      ],
      "Post-Tax MOIC",
    );

    // 8. Angel % of net worth over time
    Charts.line(
      document.getElementById("chart-angelpct"),
      [
        { name: "Angel %", data: nw.map((r) => r.angelPct * 100) },
        { name: "Guardrail", data: nw.map(() => state.nw_guardrail * 100) },
      ],
      nw.map((r) => "Yr " + r.yr),
      "Angel % of Net Worth",
    );

    // 9. P(Winner) by portfolio size
    const t4 = s.t4;
    Charts.line(
      document.getElementById("chart-pwin"),
      [
        { name: "P(Winner)", data: t4.map((r) => r.pWin * 100) },
        { name: "P(Home Run)", data: t4.map((r) => r.pHR * 100) },
      ],
      t4.map((r) => "" + r.n),
      "Probability vs Portfolio Size",
    );
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

  // ── Scenario Management ──
  function flattenState(obj, prefix) {
    const out = [];
    for (const k in obj) {
      const key = prefix ? prefix + "." + k : k;
      const v = obj[k];
      if (Array.isArray(v)) {
        v.forEach((item, i) => {
          if (Array.isArray(item))
            item.forEach((x, j) => out.push([key + "." + i + "." + j, x]));
          else out.push([key + "." + i, item]);
        });
      } else if (typeof v === "object" && v !== null) {
        out.push(...flattenState(v, key));
      } else {
        out.push([key, v]);
      }
    }
    return out;
  }

  function refreshInputs() {
    document.querySelectorAll("[data-key]").forEach((el) => {
      displayInput(el, getVal(state, el.dataset.key));
    });
  }

  function loadStateFrom(src) {
    const copy = JSON.parse(JSON.stringify(src));
    for (const k in copy) state[k] = copy[k];
    refreshInputs();
    scheduleRecompute();
  }

  function getSavedScenarios() {
    try {
      return JSON.parse(localStorage.getItem("scenarios") || "{}");
    } catch (e) {
      return {};
    }
  }

  function updateDropdown() {
    const sel = document.getElementById("scenario-select");
    const active = localStorage.getItem("activeScenario") || "Default";
    const scenarios = getSavedScenarios();
    sel.innerHTML = '<option value="__default">Default</option>';
    Object.keys(scenarios).forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = active === "Default" ? "__default" : active;
  }

  function initScenarios() {
    updateDropdown();
    const sel = document.getElementById("scenario-select");
    // Load active scenario on startup
    const active = localStorage.getItem("activeScenario");
    if (active && active !== "Default") {
      const scenarios = getSavedScenarios();
      if (scenarios[active]) loadStateFrom(scenarios[active]);
    }
    // Switch scenario
    sel.addEventListener("change", () => {
      const name = sel.value;
      if (name === "__default") {
        loadStateFrom(DEFAULTS);
        localStorage.setItem("activeScenario", "Default");
      } else {
        const scenarios = getSavedScenarios();
        if (scenarios[name]) {
          loadStateFrom(scenarios[name]);
          localStorage.setItem("activeScenario", name);
        }
      }
      Sound.play("tab");
      showToast("Loaded: " + (name === "__default" ? "Default" : name));
    });
    // Save
    document.getElementById("scenario-save").addEventListener("click", () => {
      const current = sel.value === "__default" ? "" : sel.value;
      const name = prompt("Scenario name:", current);
      if (!name || !name.trim()) return;
      const scenarios = getSavedScenarios();
      scenarios[name.trim()] = JSON.parse(JSON.stringify(state));
      localStorage.setItem("scenarios", JSON.stringify(scenarios));
      localStorage.setItem("activeScenario", name.trim());
      updateDropdown();
      showToast("Saved: " + name.trim());
      Sound.play("success");
    });
    // Export CSV
    document.getElementById("scenario-export").addEventListener("click", () => {
      const pairs = flattenState(state, "");
      let csv = "Angel Investment Model - Scenario Export\nParameter,Value\n";
      pairs.forEach(([k, v]) => (csv += k + "," + v + "\n"));
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const name = sel.value === "__default" ? "default" : sel.value;
      a.download = "angel-model-" + name.replace(/\s+/g, "-") + ".csv";
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Exported CSV");
    });
    // Import CSV
    document
      .getElementById("scenario-import")
      .addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const lines = reader.result.split("\n");
          let count = 0;
          lines.forEach((line) => {
            const idx = line.indexOf(",");
            if (idx < 0) return;
            const key = line.substring(0, idx).trim();
            const val = parseFloat(line.substring(idx + 1).trim());
            if (isNaN(val) || !key || key === "Parameter") return;
            try {
              setVal(state, key, val);
              count++;
            } catch (e) {}
          });
          if (count > 0) {
            refreshInputs();
            scheduleRecompute();
            showToast("Imported " + count + " values from " + file.name);
            Sound.play("success");
          } else {
            showToast("No valid data found in file");
          }
          e.target.value = "";
        };
        reader.readAsText(file);
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
    initScenarios();
    computed = recalcAll(state);
    render();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
