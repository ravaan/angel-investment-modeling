/**
 * Angel Investment Model — App Controller
 * State management, reactivity, DOM binding, rendering.
 */
"use strict";

(function () {
  // ── State ──
  const state = JSON.parse(JSON.stringify(DEFAULTS));
  let computed = null;
  let rafPending = false;

  // ── Formatting ──
  const fmtINR = (n) => {
    if (n == null || isNaN(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e7)
      return (n < 0 ? "-" : "") + "₹" + (abs / 1e7).toFixed(1) + " Cr";
    if (abs >= 1e5)
      return (n < 0 ? "-" : "") + "₹" + (abs / 1e5).toFixed(1) + " L";
    return (
      "₹" +
      new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)
    );
  };
  const fmtPct = (n) =>
    n == null || isNaN(n) ? "—" : (n * 100).toFixed(1) + "%";
  const fmtMult = (n) => (n == null || isNaN(n) ? "—" : n.toFixed(1) + "x");

  // ── State Access ──
  function getVal(obj, path) {
    return path
      .split(".")
      .reduce((o, k) => (o != null ? o[k] : undefined), obj);
  }
  function setVal(obj, path, val) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = val;
  }

  // ── Parse Input Value ──
  function parseInput(el) {
    const raw = el.value.replace(/[₹,%x\s]/g, "").replace(/,/g, "");
    const fmt = el.dataset.fmt;
    let val = parseFloat(raw);
    if (isNaN(val)) return null;
    if (fmt === "pct") val = val / 100;
    return val;
  }

  function displayInput(el, val) {
    const fmt = el.dataset.fmt;
    if (fmt === "inr")
      el.value =
        val != null
          ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
              val,
            )
          : "";
    else if (fmt === "pct")
      el.value = val != null ? (val * 100).toFixed(1) : "";
    else if (fmt === "mult") el.value = val != null ? val.toFixed(1) : "";
    else el.value = val != null ? val : "";
  }

  // ── Bind Inputs ──
  const STAGE_NAMES = ["Pre-Seed", "Seed", "Series A", "Series B"];
  const OUTCOME_NAMES = [
    "Failure",
    "Partial",
    "Moderate",
    "Winner",
    "Home Run",
  ];
  const MULT_NAMES = ["Partial", "Moderate", "Winner", "Home Run"];
  function addAriaLabel(el, key) {
    if (!el.closest(".input-table")) return;
    const p = key.split(".");
    if (p[0] === "prob" && p.length === 3)
      el.setAttribute(
        "aria-label",
        `${OUTCOME_NAMES[p[2]]} probability for ${STAGE_NAMES[p[1]]}`,
      );
    else if (p[0] === "mult" && p.length === 3)
      el.setAttribute(
        "aria-label",
        `${MULT_NAMES[p[2]]} multiple for ${STAGE_NAMES[p[1]]}`,
      );
    else if (p[0] === "dilution_per_round")
      el.setAttribute(
        "aria-label",
        `Dilution per round for ${STAGE_NAMES[p[1]]}`,
      );
    else if (p[0] === "rounds_to_exit")
      el.setAttribute("aria-label", `Rounds to exit for ${STAGE_NAMES[p[1]]}`);
  }

  function bindInputs() {
    document.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      addAriaLabel(el, key);
      const val = getVal(state, key);
      displayInput(el, val);

      el.addEventListener("input", () => {
        const v = parseInput(el);
        if (v === null) return;
        setVal(state, key, v);
        scheduleRecompute();
      });

      el.addEventListener("blur", () => {
        const v = getVal(state, key);
        displayInput(el, v);
      });

      el.addEventListener("focus", () => {
        const v = getVal(state, key);
        const fmt = el.dataset.fmt;
        if (fmt === "pct") el.value = v != null ? (v * 100).toFixed(1) : "";
        else if (fmt === "inr") el.value = v != null ? v : "";
        else if (fmt === "mult") el.value = v != null ? v : "";
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

  // ── Render All ──
  function render() {
    if (!computed) return;
    renderDashboard();
    renderDeployment();
    renderPortfolio();
    renderReturns();
    renderNetWorth();
    renderOppCost();
    renderSensitivity();
  }

  function out(key, text) {
    const el = document.querySelector(`[data-out="${key}"]`);
    if (el) el.textContent = text;
    return el;
  }

  // ── Dashboard ──
  function renderDashboard() {
    const c = computed.capital;
    const t = computed.tiers;
    out("totalCapital", fmtINR(c.total));
    out("investable", fmtINR(c.investable));
    out("reserve", fmtINR(c.reserve));
    out("deals_t1", t.deals1);
    out("deals_t2", t.deals2);
    out("totalDeals", t.totalDeals);
    out("avgCheck", fmtINR(t.avgCheck));

    // Stage mix sum
    const mixSum = state.stage_mix.reduce((a, b) => a + b, 0);
    const el = out("stageMixSum", fmtPct(mixSum));
    if (el) {
      el.classList.toggle("invalid", Math.abs(mixSum - 1) > 0.01);
      el.classList.toggle("valid", Math.abs(mixSum - 1) <= 0.01);
    }

    // Prob sums
    for (let si = 0; si < 4; si++) {
      const sum = state.prob[si].reduce((a, b) => a + b, 0);
      const pel = out(`probSum${si}`, fmtPct(sum));
      if (pel) {
        pel.classList.toggle("invalid", Math.abs(sum - 1) > 0.01);
        pel.classList.toggle("valid", Math.abs(sum - 1) <= 0.01);
      }
    }

    // Donut chart
    Charts.donut(
      document.getElementById("chart-stage-alloc"),
      state.stage_mix,
      STAGES,
      Charts.colors.stages,
    );

    // Summary
    out(
      "dashSummary",
      `${t.totalDeals} deals | ${fmtINR(c.investable)} investable`,
    );
  }

  // ── Deployment ──
  function renderDeployment() {
    const d = computed.deployment;
    let html =
      '<table class="data-table"><thead><tr><th>Year</th><th>T1 Deals</th><th>T1 Capital</th><th>T2 Deals</th><th>T2 Capital</th><th>Total</th><th>Deployed</th><th>Cumulative</th></tr></thead><tbody>';
    d.forEach((yr) => {
      html += `<tr><td>Yr ${yr.yr}</td><td>${yr.t1Deals}</td><td>${fmtINR(yr.t1Cap)}</td><td>${yr.t2Deals}</td><td>${fmtINR(yr.t2Cap)}</td><td>${yr.totalDeals}</td><td>${fmtINR(yr.total)}</td><td>${fmtINR(yr.cumulative)}</td></tr>`;
    });
    html += "</tbody></table>";
    document.getElementById("deployment-table").innerHTML = html;

    // Stage table
    let shtml = '<table class="data-table"><thead><tr><th>Stage</th>';
    for (let yr = 1; yr <= 10; yr++) shtml += `<th>Yr ${yr}</th>`;
    shtml += "<th>Total</th></tr></thead><tbody>";
    STAGES.forEach((stage, si) => {
      shtml += `<tr><td>${stage}</td>`;
      let totalD = 0;
      d.forEach((yr) => {
        totalD += yr.stages[si].deals;
        shtml += `<td>${yr.stages[si].deals}</td>`;
      });
      shtml += `<td><strong>${totalD}</strong></td></tr>`;
    });
    shtml += "</tbody></table>";
    document.getElementById("deployment-stage-table").innerHTML = shtml;

    const totalDep = d.reduce((a, yr) => a + yr.total, 0);
    out(
      "deploySummary",
      `${fmtINR(totalDep)} deployed over ${state.deploy_years}yr`,
    );
  }

  // ── Portfolio ──
  function renderPortfolio() {
    const p = computed.portfolio;
    const f = computed.fees;
    let html = "";

    // Per-stage outcome tables
    p.stages.forEach((stg) => {
      html += `<h4>${stg.stage} (${stg.dealCount} companies)</h4>`;
      html +=
        '<table class="data-table"><thead><tr><th>Outcome</th><th>Prob</th><th>#</th><th>Multiple</th><th>Return/Co</th><th>Total</th></tr></thead><tbody>';
      stg.outcomes.forEach((o, oi) => {
        html += `<tr><td>${OUTCOMES[oi]}</td><td>${fmtPct(o.prob)}</td><td>${o.companies}</td><td>${fmtMult(o.multiple)}</td><td>${fmtINR(o.returnPerCo)}</td><td>${fmtINR(o.totalReturn)}</td></tr>`;
      });
      html += `<tr class="total-row"><td>Stage Total</td><td></td><td>${stg.dealCount}</td><td></td><td></td><td>${fmtINR(stg.grossReturn)}</td></tr>`;
      html += "</tbody></table>";
    });
    document.getElementById("portfolio-outcomes").innerHTML = html;

    // Dilution table
    let dhtml =
      '<table class="data-table"><thead><tr><th>Stage</th><th>Rounds</th><th>Dilution/Rd</th><th>Retention</th><th>Gross</th><th>Post-Dilution</th><th>Loss</th></tr></thead><tbody>';
    p.stages.forEach((stg) => {
      dhtml += `<tr><td>${stg.stage}</td><td>${state.rounds_to_exit[STAGES.indexOf(stg.stage)]}</td><td>${fmtPct(state.dilution_per_round[STAGES.indexOf(stg.stage)])}</td><td>${fmtPct(stg.retention)}</td><td>${fmtINR(stg.grossReturn)}</td><td>${fmtINR(stg.postDilution)}</td><td>${fmtINR(stg.dilutionLoss)}</td></tr>`;
    });
    dhtml += `<tr class="total-row"><td>Total</td><td></td><td></td><td></td><td>${fmtINR(p.grossTotal)}</td><td>${fmtINR(p.postDilutionTotal)}</td><td>${fmtINR(p.grossTotal - p.postDilutionTotal)}</td></tr>`;
    dhtml += "</tbody></table>";
    document.getElementById("dilution-table").innerHTML = dhtml;

    // Fees
    let fhtml = '<div class="summary-card">';
    const items = [
      ["Gross Return (post-dilution)", fmtINR(p.postDilutionTotal)],
      ["Total Invested", fmtINR(f.invested)],
      ["Gross Profit", fmtINR(f.grossProfit)],
      ["Syndicate Carry", fmtINR(f.carryDeduction)],
      ["Syndicate Mgmt Fee", fmtINR(f.mgmtFee)],
      ["LTCG Tax", fmtINR(f.tax)],
      ["Net Profit (post-tax)", fmtINR(f.netPosttax)],
    ];
    items.forEach(
      ([l, v]) =>
        (fhtml += `<div class="metric"><span class="metric-label">${l}</span><span class="metric-value">${v}</span></div>`),
    );
    fhtml += "</div>";
    document.getElementById("fees-table").innerHTML = fhtml;

    // Summary
    let shtml = '<div class="summary-card">';
    shtml += `<div class="metric"><span class="metric-label">Total Companies</span><span class="metric-value">${p.totalCompanies}</span></div>`;
    shtml += `<div class="metric"><span class="metric-label">Net Portfolio Value</span><span class="metric-value highlight">${fmtINR(f.netValue)}</span></div>`;
    shtml += `<div class="metric"><span class="metric-label">Gross MOIC</span><span class="metric-value">${fmtMult(f.grossMOIC)}</span></div>`;
    shtml += `<div class="metric"><span class="metric-label">Net MOIC (post dilution, fees, tax)</span><span class="metric-value highlight">${fmtMult(f.netMOIC)}</span></div>`;
    shtml += "</div>";
    document.getElementById("portfolio-summary").innerHTML = shtml;

    out(
      "portfolioSummary",
      `Net MOIC: ${fmtMult(f.netMOIC)} | ${p.totalCompanies} companies`,
    );
  }

  // ── Returns ──
  function renderReturns() {
    const jc = computed.jCurve;
    const m = computed.moic;
    const pt = computed.postTaxMOIC;
    const irr = computed.irr;

    // J-curve table
    let html = '<table class="data-table"><thead><tr><th>Scenario</th>';
    for (let yr = 1; yr <= 10; yr++) html += `<th>Yr ${yr}</th>`;
    html += "</tr></thead><tbody>";
    ["base", "bull", "bear"].forEach((key) => {
      html += `<tr class="scenario-${key}"><td>${key.charAt(0).toUpperCase() + key.slice(1)}</td>`;
      jc[key].forEach((v) => (html += `<td>${fmtINR(v)}</td>`));
      html += "</tr>";
    });
    html += "</tbody></table>";
    document.getElementById("jcurve-table").innerHTML = html;

    // Line chart
    Charts.line(
      document.getElementById("chart-jcurve"),
      [
        { name: "Base", data: jc.base },
        { name: "Bull", data: jc.bull },
        { name: "Bear", data: jc.bear },
      ],
      Array.from({ length: 10 }, (_, i) => `Yr ${i + 1}`),
      "Portfolio Value Over Time",
    );

    // MOIC table
    let mhtml =
      '<table class="data-table"><thead><tr><th>Horizon</th><th class="scenario-base">Base</th><th class="scenario-bull">Bull</th><th class="scenario-bear">Bear</th></tr></thead><tbody>';
    [
      ["Year 5", "yr5"],
      ["Year 7", "yr7"],
      ["Year 10", "yr10"],
    ].forEach(([label, key]) => {
      mhtml += `<tr><td>${label}</td><td>${fmtMult(m.base[key])}</td><td>${fmtMult(m.bull[key])}</td><td>${fmtMult(m.bear[key])}</td></tr>`;
    });
    mhtml += "</tbody></table>";
    mhtml +=
      '<h4>Post-Tax MOIC</h4><table class="data-table"><thead><tr><th>Horizon</th><th class="scenario-base">Base</th><th class="scenario-bull">Bull</th><th class="scenario-bear">Bear</th></tr></thead><tbody>';
    [
      ["Year 5", "yr5"],
      ["Year 7", "yr7"],
      ["Year 10", "yr10"],
    ].forEach(([label, key]) => {
      mhtml += `<tr><td>${label}</td><td>${fmtMult(pt.base[key])}</td><td>${fmtMult(pt.bull[key])}</td><td>${fmtMult(pt.bear[key])}</td></tr>`;
    });
    mhtml += "</tbody></table>";
    document.getElementById("moic-table").innerHTML = mhtml;

    // MOIC bar chart
    Charts.bar(
      document.getElementById("chart-moic"),
      ["Base Yr10", "Bull Yr10", "Bear Yr10"],
      [m.base.yr10, m.bull.yr10, m.bear.yr10],
      [Charts.colors.base, Charts.colors.bull, Charts.colors.bear],
      "MOIC at Year 10",
    );

    // IRR
    let irrHtml = '<div class="summary-card">';
    ["base", "bull", "bear"].forEach((key) => {
      const val = irr[key];
      irrHtml += `<div class="metric"><span class="metric-label">${key.charAt(0).toUpperCase() + key.slice(1)} IRR</span><span class="metric-value scenario-${key}">${isNaN(val) ? "N/A" : fmtPct(val)}</span></div>`;
    });
    irrHtml += "</div>";
    document.getElementById("irr-display").innerHTML = irrHtml;

    out(
      "returnsSummary",
      `Base MOIC@10yr: ${fmtMult(m.base.yr10)} | IRR: ${isNaN(irr.base) ? "N/A" : fmtPct(irr.base)}`,
    );
  }

  // ── Net Worth ──
  function renderNetWorth() {
    const nw = computed.networth;
    let html =
      '<table class="data-table"><thead><tr><th>Year</th><th>NW (ex-Angel)</th><th>Deployed (Cum)</th><th>Angel Value</th><th>Total NW</th><th>Angel %</th><th>Risk %</th><th>Flag</th></tr></thead><tbody>';
    nw.forEach((r) => {
      html += `<tr><td>Yr ${r.yr}</td><td>${fmtINR(r.nwExAngel)}</td><td>${fmtINR(r.cumDeployed)}</td><td>${fmtINR(r.angelVal)}</td><td>${fmtINR(r.totalNW)}</td><td>${fmtPct(r.angelPct)}</td><td>${fmtPct(r.riskPct)}</td><td class="${r.exceedsGuardrail ? "warn" : ""}">${r.exceedsGuardrail ? "EXCEEDS" : "—"}</td></tr>`;
    });
    html += "</tbody></table>";
    document.getElementById("networth-table").innerHTML = html;

    // Area chart
    const labels = nw.map((r) => `Yr ${r.yr}`);
    Charts.area(
      document.getElementById("chart-networth"),
      [
        { name: "NW (ex-Angel)", data: nw.map((r) => r.nwExAngel) },
        { name: "Angel Portfolio", data: nw.map((r) => r.angelVal) },
      ],
      labels,
      "Net Worth Composition",
    );

    const yr10 = nw[10];
    out(
      "nwSummary",
      yr10
        ? `Total NW@Yr10: ${fmtINR(yr10.totalNW)} | Angel: ${fmtPct(yr10.angelPct)}`
        : "",
    );
  }

  // ── Opportunity Cost ──
  function renderOppCost() {
    const oc = computed.oppcost;
    const jc = computed.jCurve;
    let html =
      '<table class="data-table"><thead><tr><th>Year</th><th>Nifty 50</th><th>FD</th><th>Balanced MF</th><th>Angel Base</th><th>Angel Bull</th></tr></thead><tbody>';
    oc.forEach((r, i) => {
      html += `<tr><td>Yr ${r.yr}</td><td>${fmtINR(r.nifty)}</td><td>${fmtINR(r.fd)}</td><td>${fmtINR(r.balanced)}</td><td>${fmtINR(jc.base[i])}</td><td>${fmtINR(jc.bull[i])}</td></tr>`;
    });
    html += "</tbody></table>";
    document.getElementById("oppcost-table").innerHTML = html;

    // Insights
    const yr8 = oc[7];
    const invested = computed.capital.total;
    let insHtml = '<div class="summary-card">';
    insHtml += `<div class="metric"><span class="metric-label">Nifty 50 at Yr 8</span><span class="metric-value">${fmtINR(yr8 ? yr8.nifty : 0)}</span></div>`;
    insHtml += `<div class="metric"><span class="metric-label">Angel Base at Yr 8</span><span class="metric-value">${fmtINR(jc.base[7])}</span></div>`;
    insHtml += `<div class="metric"><span class="metric-label">Breakeven MOIC vs Nifty</span><span class="metric-value highlight">${invested > 0 ? fmtMult(yr8 ? yr8.nifty / invested : 0) : "—"}</span></div>`;
    insHtml += "</div>";
    document.getElementById("oppcost-insights").innerHTML = insHtml;

    // Bar chart
    if (yr8) {
      Charts.bar(
        document.getElementById("chart-oppcost"),
        ["Nifty 50", "FD", "Balanced", "Angel Base", "Angel Bull"],
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

    out(
      "opcSummary",
      yr8
        ? `Nifty@8yr: ${fmtINR(yr8.nifty)} vs Angel: ${fmtINR(jc.base[7])}`
        : "",
    );
  }

  // ── Sensitivity ──
  function renderSensitivity() {
    const s = computed.sensitivity;
    let html = "";

    // Table 1
    html += "<h4>Table 1: MOIC vs Failure Rate Change</h4>";
    html += '<table class="data-table heatmap"><thead><tr><th>Modifier</th>';
    s.t1.forEach((r) => (html += `<th>${r.label}</th>`));
    html += "</tr></thead><tbody><tr><td>MOIC</td>";
    const t1vals = s.t1.map((r) => r.moic);
    const t1min = Math.min(...t1vals),
      t1max = Math.max(...t1vals);
    s.t1.forEach(
      (r) =>
        (html += `<td style="background:${Charts.heatColor(r.moic, t1min, t1max)};color:#000">${fmtMult(r.moic)}</td>`),
    );
    html += "</tr></tbody></table>";

    // Table 2
    html += "<h4>Table 2: MOIC vs Winner Probability Multiplier</h4>";
    html += '<table class="data-table heatmap"><thead><tr><th>Modifier</th>';
    s.t2.forEach((r) => (html += `<th>${r.label}</th>`));
    html += "</tr></thead><tbody><tr><td>MOIC</td>";
    const t2vals = s.t2.map((r) => r.moic);
    const t2min = Math.min(...t2vals),
      t2max = Math.max(...t2vals);
    s.t2.forEach(
      (r) =>
        (html += `<td style="background:${Charts.heatColor(r.moic, t2min, t2max)};color:#000">${fmtMult(r.moic)}</td>`),
    );
    html += "</tr></tbody></table>";

    // Table 3
    html += "<h4>Table 3: Check Size Mix Impact</h4>";
    html +=
      '<table class="data-table"><thead><tr><th>Tier 1 %</th><th>Avg Check</th><th>Total Deals</th><th>Diversification</th></tr></thead><tbody>';
    s.t3.forEach(
      (r) =>
        (html += `<tr><td>${fmtPct(r.alloc)}</td><td>${fmtINR(r.avgCheck)}</td><td>${r.deals}</td><td>${r.score}</td></tr>`),
    );
    html += "</tbody></table>";

    // Table 4
    html += "<h4>Table 4: Portfolio Size vs Probability of Winners</h4>";
    html += '<table class="data-table heatmap"><thead><tr><th>Companies</th>';
    s.t4.forEach((r) => (html += `<th>${r.n}</th>`));
    html += "</tr></thead><tbody>";
    html += "<tr><td>P(≥1 Home Run)</td>";
    const t4hr = s.t4.map((r) => r.pHR);
    const t4min = Math.min(...t4hr),
      t4max = Math.max(...t4hr);
    s.t4.forEach(
      (r) =>
        (html += `<td style="background:${Charts.heatColor(r.pHR, t4min, t4max)};color:#000">${fmtPct(r.pHR)}</td>`),
    );
    html += "</tr><tr><td>P(≥1 Winner)</td>";
    s.t4.forEach((r) => (html += `<td>${fmtPct(r.pWin)}</td>`));
    html += "</tr><tr><td>Expected Winners</td>";
    s.t4.forEach((r) => (html += `<td>${r.expWin.toFixed(1)}</td>`));
    html += "</tr></tbody></table>";

    // Table 5
    html += "<h4>Table 5: Two-Way — Failure Rate x Winner Multiple</h4>";
    html +=
      '<table class="data-table heatmap"><thead><tr><th>Fail \\ Mult</th>';
    s.multMods.forEach((mm) => (html += `<th>${mm.label}</th>`));
    html += "</tr></thead><tbody>";
    const allT5 = s.t5.flatMap((r) => r.values);
    const t5min = Math.min(...allT5),
      t5max = Math.max(...allT5);
    s.t5.forEach((row) => {
      html += `<tr><td>${row.label}</td>`;
      row.values.forEach(
        (v) =>
          (html += `<td style="background:${Charts.heatColor(v, t5min, t5max)};color:#000">${fmtMult(v)}</td>`),
      );
      html += "</tr>";
    });
    html += "</tbody></table>";

    document.getElementById("sens-tables").innerHTML = html;
    out(
      "sensSummary",
      `Base MOIC: ${fmtMult(s.t1[2]?.moic)} | Range: ${fmtMult(t5min)}–${fmtMult(t5max)}`,
    );
  }

  // ── Section Toggle ──
  function bindSections() {
    document.querySelectorAll("[data-toggle]").forEach((header) => {
      const toggle = () => {
        header.closest(".model-section").classList.toggle("open");
        Sound.play("tab");
      };
      header.addEventListener("click", toggle);
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  // ── Nav Links ──
  function bindNav() {
    const sections = document.querySelectorAll(".model-section");
    const links = document.querySelectorAll(".nav-link");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            links.forEach((l) => l.classList.remove("active"));
            const link = document.querySelector(
              `.nav-link[href="#${e.target.id}"]`,
            );
            if (link) link.classList.add("active");
          }
        });
      },
      { rootMargin: "-100px 0px -60% 0px" },
    );
    sections.forEach((s) => observer.observe(s));

    links.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute("href"));
        if (target) {
          if (!target.classList.contains("open")) target.classList.add("open");
          target.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  }

  // ── Theme ──
  const themes = ["dark", "light", "amber"];
  const themeIcons = ["◐", "☀", "◑"];
  let themeIdx = 0;

  function cycleTheme() {
    themeIdx = (themeIdx + 1) % themes.length;
    document.documentElement.dataset.theme = themes[themeIdx];
    document.querySelector("#theme-toggle .icon").textContent =
      themeIcons[themeIdx];
    localStorage.setItem("theme", themes[themeIdx]);
    Sound.play("theme");
    showToast(`Theme: ${themes[themeIdx]}`);
  }

  function loadTheme() {
    const saved = localStorage.getItem("theme");
    if (saved && themes.includes(saved)) {
      themeIdx = themes.indexOf(saved);
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      themeIdx = 1;
    }
    document.documentElement.dataset.theme = themes[themeIdx];
    document.querySelector("#theme-toggle .icon").textContent =
      themeIcons[themeIdx];
  }

  // ── Toast ──
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
  }

  // ── Keyboard ──
  let helpBuffer = "";
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
        showToast(`Sound: ${on ? "On" : "Off"}`);
        return;
      }
      if (e.key === "?") {
        document.getElementById("help-dialog").showModal();
        return;
      }
      if (e.key >= "1" && e.key <= "7") {
        const sections = document.querySelectorAll(".model-section");
        const idx = parseInt(e.key) - 1;
        if (sections[idx]) {
          if (!sections[idx].classList.contains("open"))
            sections[idx].classList.add("open");
          sections[idx].scrollIntoView({ behavior: "smooth" });
        }
        return;
      }
      // Easter egg
      helpBuffer += e.key.toLowerCase();
      if (helpBuffer.length > 10) helpBuffer = helpBuffer.slice(-10);
      if (helpBuffer.endsWith("help")) {
        document.getElementById("help-dialog").showModal();
        helpBuffer = "";
      }
    });
  }

  // ── Help Dialog ──
  function bindHelp() {
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

  // ── Control Buttons ──
  function bindControls() {
    document
      .getElementById("theme-toggle")
      .addEventListener("click", cycleTheme);
    document.getElementById("sound-toggle").addEventListener("click", () => {
      const on = Sound.toggle();
      document.querySelector("#sound-toggle .icon").textContent = on
        ? "♪"
        : "♩";
      showToast(`Sound: ${on ? "On" : "Off"}`);
    });
  }

  // ── Init ──
  function init() {
    loadTheme();
    Sound.load();
    if (Sound.enabled)
      document.querySelector("#sound-toggle .icon").textContent = "♪";
    else document.querySelector("#sound-toggle .icon").textContent = "♩";

    bindInputs();
    bindSections();
    bindNav();
    bindKeyboard();
    bindHelp();
    bindControls();

    computed = recalcAll(state);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
