/**
 * Angel Investment Model — Calculation Engine
 * Pure functions, no DOM dependencies.
 */
"use strict";

const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B"];
const OUTCOMES = [
  "Failure (0x)",
  "Partial (1-2x)",
  "Moderate (3-5x)",
  "Winner (10x+)",
  "Home Run (50x+)",
];

const DEFAULTS = {
  annual_budget: 5000000,
  deploy_years: 2,
  followon_pct: 0,
  check_t1: 300000,
  check_t2: 500000,
  alloc_t1: 0.6,
  alloc_t2: 0.4,
  stage_mix: [0.5, 0.35, 0.1, 0.05],
  prob: [
    [0.7, 0.15, 0.1, 0.04, 0.01],
    [0.55, 0.2, 0.15, 0.08, 0.02],
    [0.35, 0.25, 0.2, 0.15, 0.05],
    [0.25, 0.3, 0.25, 0.15, 0.05],
  ],
  mult: [
    [1.5, 4, 15, 50],
    [1.5, 4, 12, 30],
    [1.5, 4, 8, 20],
    [1.5, 4, 6, 15],
  ],
  dilution_per_round: [0.2, 0.2, 0.2, 0.15],
  rounds_to_exit: [3.5, 2.5, 1.5, 1.0],
  syndicate_pct: 0.3,
  mgmt_fee: 0.02,
  carry: 0.2,
  ltcg_rate: 0.125,
  starting_nw: 50000000,
  nw_growth: 0.1,
  nw_guardrail: 0.2,
  nifty_cagr: 0.12,
  fd_rate: 0.07,
  fd_tax_rate: 0.3,
  equity_ltcg: 0.125,
  scenario_mods: {
    base: { fail: 1.0, winner_mult: 1.0, hr_prob: 1.0 },
    bull: { fail: 0.85, winner_mult: 1.3, hr_prob: 1.5 },
    bear: { fail: 1.15, winner_mult: 0.7, hr_prob: 0.5 },
  },
  nav_curve: [1.0, 1.0, 0.85, 0.7, 0.65, 0.8, 1.0, 1.3, 1.8, 2.5],
};

// ── Capital ──
function calcCapital(s) {
  const total = s.annual_budget * s.deploy_years;
  const investable = total * (1 - s.followon_pct);
  const reserve = total * s.followon_pct;
  return { total, investable, reserve };
}

// ── Check Size Tiers ──
function calcTiers(s, investable) {
  const cap1 = investable * s.alloc_t1;
  const cap2 = investable * s.alloc_t2;
  const deals1 = Math.round(cap1 / s.check_t1) || 0;
  const deals2 = Math.round(cap2 / s.check_t2) || 0;
  const totalDeals = deals1 + deals2;
  const avgCheck = totalDeals > 0 ? investable / totalDeals : 0;
  return { cap1, cap2, deals1, deals2, totalDeals, avgCheck };
}

// ── Deployment Schedule ──
function calcDeployment(s, tiers) {
  const years = [];
  let cumulative = 0;
  for (let yr = 1; yr <= 10; yr++) {
    const active = yr <= s.deploy_years;
    const t1Deals = active ? Math.round(tiers.deals1 / s.deploy_years) : 0;
    const t2Deals = active ? Math.round(tiers.deals2 / s.deploy_years) : 0;
    const t1Cap = t1Deals * s.check_t1;
    const t2Cap = t2Deals * s.check_t2;
    const total = t1Cap + t2Cap;
    cumulative += total;
    const stages = s.stage_mix.map((mix) => ({
      deals: Math.round((t1Deals + t2Deals) * mix),
      capital: Math.round(total * mix),
    }));
    years.push({
      yr,
      t1Deals,
      t1Cap,
      t2Deals,
      t2Cap,
      totalDeals: t1Deals + t2Deals,
      total,
      cumulative,
      stages,
    });
  }
  return years;
}

// ── Portfolio Construction ──
function calcPortfolioStage(si, s, totalDeals, avgCheck) {
  const dealCount = Math.round(totalDeals * s.stage_mix[si]);
  const probs = s.prob[si];
  const mults = [0, ...s.mult[si]]; // prepend 0x for failure
  const outcomes = [];
  let grossReturn = 0;
  for (let o = 0; o < 5; o++) {
    const companies = Math.round(dealCount * probs[o]);
    const multiple = mults[o];
    const returnPerCo = multiple * avgCheck;
    const totalReturn = companies * returnPerCo;
    grossReturn += totalReturn;
    outcomes.push({
      companies,
      prob: probs[o],
      multiple,
      returnPerCo,
      totalReturn,
    });
  }
  const retention = Math.pow(
    1 - s.dilution_per_round[si],
    s.rounds_to_exit[si],
  );
  const postDilution = grossReturn * retention;
  const dilutionLoss = grossReturn - postDilution;
  return {
    stage: STAGES[si],
    dealCount,
    outcomes,
    grossReturn,
    retention,
    postDilution,
    dilutionLoss,
  };
}

function calcPortfolio(s, tiers) {
  const stages = [0, 1, 2, 3].map((si) =>
    calcPortfolioStage(si, s, tiers.totalDeals, tiers.avgCheck),
  );
  const grossTotal = stages.reduce((a, st) => a + st.grossReturn, 0);
  const postDilutionTotal = stages.reduce((a, st) => a + st.postDilution, 0);
  const totalCompanies = stages.reduce((a, st) => a + st.dealCount, 0);
  return { stages, grossTotal, postDilutionTotal, totalCompanies };
}

// ── Scenario-Adjusted Portfolio EV ──
function calcScenarioEV(s, tiers, scenarioKey) {
  const mod = s.scenario_mods[scenarioKey];
  let grossReturn = 0;
  for (let si = 0; si < 4; si++) {
    const dc = Math.round(tiers.totalDeals * s.stage_mix[si]);
    const p = s.prob[si],
      m = s.mult[si];
    const adjFail = Math.min(0.99, p[0] * mod.fail);
    const nfs = (1 - adjFail) / Math.max(0.01, 1 - p[0]);
    const adjHR = p[4] * nfs * mod.hr_prob;
    const adjWin = Math.max(0, p[3] * nfs + (p[4] * nfs - adjHR));
    const ret = Math.pow(1 - s.dilution_per_round[si], s.rounds_to_exit[si]);
    grossReturn +=
      dc *
      tiers.avgCheck *
      (p[1] * nfs * m[0] +
        p[2] * nfs * m[1] * mod.winner_mult +
        adjWin * m[2] * mod.winner_mult +
        adjHR * m[3] * mod.winner_mult) *
      ret;
  }
  return grossReturn;
}

// ── Fees & Tax ──
function calcFeesTax(s, invested, postDilutionReturn) {
  const grossProfit = Math.max(0, postDilutionReturn - invested);
  const syndicateProfit = grossProfit * s.syndicate_pct;
  const carryDeduction = syndicateProfit * s.carry;
  const mgmtFee = invested * s.syndicate_pct * s.mgmt_fee;
  const netPretax = grossProfit - carryDeduction - mgmtFee;
  const tax = Math.max(0, netPretax) * s.ltcg_rate;
  const netPosttax = netPretax - tax;
  const netValue = invested + netPosttax;
  const grossMOIC = invested > 0 ? postDilutionReturn / invested : 0;
  const netMOIC = invested > 0 ? netValue / invested : 0;
  return {
    invested,
    grossProfit,
    carryDeduction,
    mgmtFee,
    netPretax,
    tax,
    netPosttax,
    netValue,
    grossMOIC,
    netMOIC,
  };
}

// ── Returns / J-Curve ──
function calcJCurve(s, invested, tiers) {
  const scenarios = {};
  const baseNav = s.nav_curve[9] || 1;
  for (const key of ["base", "bull", "bear"]) {
    const terminal = calcScenarioEV(s, tiers, key);
    const scale = invested * baseNav > 0 ? terminal / (invested * baseNav) : 0;
    scenarios[key] = s.nav_curve.map((nv) => invested * nv * scale);
  }
  return scenarios;
}

function calcMOIC(jCurve, invested) {
  const result = {};
  for (const key of ["base", "bull", "bear"]) {
    result[key] = {
      yr5: invested > 0 ? jCurve[key][4] / invested : 0,
      yr7: invested > 0 ? jCurve[key][6] / invested : 0,
      yr10: invested > 0 ? jCurve[key][9] / invested : 0,
    };
  }
  return result;
}

function calcPostTaxMOIC(moic, s) {
  const result = {};
  for (const key of ["base", "bull", "bear"]) {
    const adjust = (m) => {
      if (m <= 1) return m;
      const gains = m - 1;
      const afterCarry = gains * (1 - s.syndicate_pct * s.carry);
      const afterTax = afterCarry * (1 - s.ltcg_rate);
      return 1 + afterTax;
    };
    result[key] = {
      yr5: adjust(moic[key].yr5),
      yr7: adjust(moic[key].yr7),
      yr10: adjust(moic[key].yr10),
    };
  }
  return result;
}

// ── IRR ──
function calcIRR(cashflows, guess) {
  if (typeof guess === "undefined") guess = 0.1;
  let rate = guess;
  for (let i = 0; i < 100; i++) {
    let npv = 0,
      dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const factor = Math.pow(1 + rate, t);
      npv += cashflows[t] / factor;
      if (factor * (1 + rate) !== 0)
        dnpv -= (t * cashflows[t]) / (factor * (1 + rate));
    }
    if (Math.abs(dnpv) < 1e-10) break;
    const newRate = rate - npv / dnpv;
    if (newRate < -0.99 || newRate > 10 || isNaN(newRate)) break;
    if (Math.abs(newRate - rate) < 1e-7) return newRate;
    rate = newRate;
  }
  // Bisection fallback
  let lo = -0.5,
    hi = 5.0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const npv = cashflows.reduce(
      (sum, cf, t) => sum + cf / Math.pow(1 + mid, t),
      0,
    );
    if (Math.abs(npv) < 1e-7) return mid;
    if (npv > 0) lo = mid;
    else hi = mid;
  }
  return NaN;
}

function buildCashFlows(s, jCurveScenario) {
  const cfs = [];
  for (let yr = 0; yr < 10; yr++) {
    if (yr < s.deploy_years) cfs.push(-s.annual_budget);
    else if (yr === 9) cfs.push(jCurveScenario[9]);
    else cfs.push(0);
  }
  return cfs;
}

// ── Net Worth ──
function calcNetWorth(s, capital, jCurveBase) {
  const rows = [];
  let nw = s.starting_nw;
  for (let yr = 0; yr <= 10; yr++) {
    const deployed = yr > 0 && yr <= s.deploy_years ? s.annual_budget : 0;
    if (yr > 0) nw = nw * (1 + s.nw_growth) - deployed;
    const cumDeployed = Math.min(yr, s.deploy_years) * s.annual_budget;
    const angelVal = yr > 0 ? jCurveBase[yr - 1] : 0;
    const totalNW = nw + angelVal;
    const angelPct = totalNW > 0 ? angelVal / totalNW : 0;
    const riskPct = totalNW > 0 ? cumDeployed / totalNW : 0;
    const exceedsGuardrail = angelPct > s.nw_guardrail;
    rows.push({
      yr,
      nwExAngel: nw,
      cumDeployed,
      angelVal,
      totalNW,
      angelPct,
      riskPct,
      exceedsGuardrail,
    });
  }
  return rows;
}

// ── Opportunity Cost ──
function calcOppCost(s) {
  const rows = [];
  for (let yr = 1; yr <= 10; yr++) {
    let niftyGross = 0,
      fd = 0,
      balanced = 0;
    for (let dy = 1; dy <= Math.min(s.deploy_years, yr); dy++) {
      niftyGross += s.annual_budget * Math.pow(1 + s.nifty_cagr, yr - dy);
      fd +=
        s.annual_budget *
        Math.pow(1 + s.fd_rate * (1 - s.fd_tax_rate), yr - dy);
      const balRate =
        s.nifty_cagr * 0.5 + s.fd_rate * (1 - s.fd_tax_rate) * 0.5;
      balanced += s.annual_budget * Math.pow(1 + balRate, yr - dy);
    }
    const invested = Math.min(yr, s.deploy_years) * s.annual_budget;
    const niftyPostTax =
      invested + Math.max(0, niftyGross - invested) * (1 - s.equity_ltcg);
    rows.push({ yr, nifty: niftyPostTax, fd, balanced, invested });
  }
  return rows;
}

// ── Sensitivity ──
function calcEV(s, tiers, failMod, multMod, hrMod) {
  if (hrMod === undefined) hrMod = 1.0;
  let ev = 0;
  for (let si = 0; si < 4; si++) {
    const cap = tiers.avgCheck * Math.round(tiers.totalDeals * s.stage_mix[si]);
    const p = s.prob[si],
      m = s.mult[si];
    const adjFail = Math.min(0.99, p[0] * failMod);
    const nfs = (1 - adjFail) / Math.max(0.01, 1 - p[0]);
    const adjHR = p[4] * nfs * hrMod;
    const adjWin = Math.max(0, p[3] * nfs + (p[4] * nfs - adjHR));
    const ret = Math.pow(1 - s.dilution_per_round[si], s.rounds_to_exit[si]);
    ev +=
      cap *
      (p[1] * nfs * m[0] +
        p[2] * nfs * m[1] * multMod +
        adjWin * m[2] * multMod +
        adjHR * m[3] * multMod) *
      ret;
  }
  return ev;
}

function calcSensitivity(s, tiers, capital) {
  const invested = capital.investable;
  // Table 1: MOIC vs failure rate
  const failMods = [
    { label: "-20%", v: 0.8 },
    { label: "-10%", v: 0.9 },
    { label: "Base", v: 1.0 },
    { label: "+10%", v: 1.1 },
    { label: "+20%", v: 1.2 },
  ];
  const t1 = failMods.map((fm) => ({
    label: fm.label,
    moic: invested > 0 ? calcEV(s, tiers, fm.v, 1.0) / invested : 0,
  }));

  // Table 2: MOIC vs winner mult
  const multMods = [
    { label: "0.5x", v: 0.5 },
    { label: "0.75x", v: 0.75 },
    { label: "Base", v: 1.0 },
    { label: "1.5x", v: 1.5 },
    { label: "2.0x", v: 2.0 },
  ];
  const t2 = multMods.map((mm) => ({
    label: mm.label,
    moic: invested > 0 ? calcEV(s, tiers, 1.0, mm.v) / invested : 0,
  }));

  // Table 3: check size mix
  const allocVals = [0.4, 0.5, 0.6, 0.7, 0.8];
  const t3 = allocVals.map((a) => {
    const avgChk = s.check_t1 * a + s.check_t2 * (1 - a);
    const deals = invested > 0 ? Math.round(invested / avgChk) : 0;
    return {
      alloc: a,
      avgCheck: avgChk,
      deals,
      score: deals >= 25 ? "Good" : deals >= 15 ? "OK" : "Low",
    };
  });

  // Table 4: portfolio size probability
  const sizes = [10, 15, 20, 25, 30, 40];
  const weightedHR = s.stage_mix.reduce((a, m, i) => a + m * s.prob[i][4], 0);
  const weightedWin = s.stage_mix.reduce((a, m, i) => a + m * s.prob[i][3], 0);
  const t4 = sizes.map((n) => ({
    n,
    pHR: 1 - Math.pow(1 - weightedHR, n),
    pWin: 1 - Math.pow(1 - weightedWin, n),
    expWin: n * weightedWin,
  }));

  // Table 5: two-way fail x mult
  const t5 = failMods.map((fm) => ({
    label: fm.label,
    values: multMods.map((mm) =>
      invested > 0 ? calcEV(s, tiers, fm.v, mm.v) / invested : 0,
    ),
  }));

  return { t1, t2, t3, t4, t5, failMods, multMods };
}

// ── Master Recalc ──
function recalcAll(s) {
  const capital = calcCapital(s);
  const tiers = calcTiers(s, capital.investable);
  const deployment = calcDeployment(s, tiers);
  const portfolio = calcPortfolio(s, tiers);
  const fees = calcFeesTax(s, capital.investable, portfolio.postDilutionTotal);
  const jCurve = calcJCurve(s, capital.investable, tiers);
  const moic = calcMOIC(jCurve, capital.investable);
  const postTaxMOIC = calcPostTaxMOIC(moic, s);
  const irr = {};
  for (const key of ["base", "bull", "bear"]) {
    const cfs = buildCashFlows(s, jCurve[key]);
    irr[key] = calcIRR(cfs);
  }
  const networth = calcNetWorth(s, capital, jCurve.base);
  const oppcost = calcOppCost(s);
  const sensitivity = calcSensitivity(s, tiers, capital);
  return {
    capital,
    tiers,
    deployment,
    portfolio,
    fees,
    jCurve,
    moic,
    postTaxMOIC,
    irr,
    networth,
    oppcost,
    sensitivity,
  };
}

// ── Lite Recalc (for optimizer — skips IRR, networth, oppcost, sensitivity) ──
function recalcLite(s) {
  const capital = calcCapital(s);
  const tiers = calcTiers(s, capital.investable);
  const invested = capital.investable;
  const baseNav = s.nav_curve[9] || 1;
  const moic = {};
  for (const key of ["base", "bull", "bear"]) {
    const terminal = calcScenarioEV(s, tiers, key);
    moic[key] = invested > 0 ? terminal / invested : 0;
  }
  return { capital, tiers, moic, deals: tiers.totalDeals, invested };
}

// ── State Accessors (used by app.js and simulator) ──
function getVal(obj, path) {
  return path.split(".").reduce(function (o, k) {
    return o != null ? o[k] : undefined;
  }, obj);
}
function setVal(obj, path, val) {
  var p = path.split("."),
    c = obj;
  for (var i = 0; i < p.length - 1; i++) c = c[p[i]];
  c[p[p.length - 1]] = val;
}
