"use strict";
(function () {
  // ── Constants ──
  const STAGE_MIXES = [
    [0.7, 0.2, 0.1, 0],
    [0.65, 0.25, 0.1, 0],
    [0.6, 0.3, 0.1, 0],
    [0.6, 0.25, 0.1, 0.05],
    [0.55, 0.35, 0.1, 0],
    [0.55, 0.3, 0.1, 0.05],
    [0.5, 0.35, 0.1, 0.05],
    [0.5, 0.3, 0.15, 0.05],
    [0.5, 0.25, 0.15, 0.1],
    [0.45, 0.35, 0.15, 0.05],
    [0.45, 0.3, 0.15, 0.1],
    [0.45, 0.25, 0.2, 0.1],
    [0.4, 0.35, 0.15, 0.1],
    [0.4, 0.3, 0.2, 0.1],
    [0.4, 0.25, 0.2, 0.15],
    [0.35, 0.35, 0.2, 0.1],
    [0.35, 0.3, 0.25, 0.1],
    [0.35, 0.35, 0.15, 0.15],
    [0.3, 0.4, 0.2, 0.1],
    [0.3, 0.35, 0.25, 0.1],
    [0.3, 0.3, 0.25, 0.15],
    [0.3, 0.3, 0.2, 0.2],
    [0.25, 0.4, 0.25, 0.1],
    [0.25, 0.35, 0.25, 0.15],
    [0.25, 0.35, 0.2, 0.2],
    [0.2, 0.4, 0.25, 0.15],
    [0.2, 0.35, 0.3, 0.15],
    [0.2, 0.55, 0.2, 0.05],
    [0.2, 0.3, 0.3, 0.2],
    [0.15, 0.45, 0.25, 0.15],
    [0.15, 0.4, 0.3, 0.15],
    [0.15, 0.35, 0.3, 0.2],
    [0.1, 0.5, 0.25, 0.15],
    [0.1, 0.45, 0.3, 0.15],
    [0.1, 0.4, 0.3, 0.2],
  ];
  const CHECK_T1S = [
    100000, 150000, 200000, 250000, 300000, 400000, 500000, 750000, 1000000,
    1500000,
  ];
  const CHECK_T1S_FINE = [
    75000, 100000, 125000, 150000, 175000, 200000, 250000, 300000, 350000,
    400000, 500000, 600000, 750000, 1000000, 1500000,
  ];
  const T2_RATIOS = [1.25, 1.5, 1.75, 2, 2.5];
  const ALLOC_T1S = [0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8];
  const SYND_PCTS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  const FOLLOWON_PCTS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
  const DEPLOY_YEARS = [1, 2, 3, 4, 5];

  const MODES = {
    A: {
      label: "Given budget + years → find best config",
      fixed: ["annual_budget", "deploy_years"],
      sweep: {
        check_t1: CHECK_T1S,
        t2_ratio: T2_RATIOS,
        alloc_t1: ALLOC_T1S,
        stage_mix: STAGE_MIXES,
        syndicate_pct: SYND_PCTS,
        followon_pct: FOLLOWON_PCTS,
      },
    },
    B: {
      label: "Given budget + check size → find best config",
      fixed: ["annual_budget", "check_t1", "check_t2"],
      sweep: {
        deploy_years: DEPLOY_YEARS,
        alloc_t1: ALLOC_T1S,
        stage_mix: STAGE_MIXES,
        syndicate_pct: SYND_PCTS,
        followon_pct: FOLLOWON_PCTS,
      },
    },
    C: {
      label: "Given budget + years + checks → find best mix",
      fixed: ["annual_budget", "deploy_years", "check_t1", "check_t2"],
      sweep: {
        alloc_t1: ALLOC_T1S,
        stage_mix: STAGE_MIXES,
        syndicate_pct: SYND_PCTS,
        followon_pct: FOLLOWON_PCTS,
      },
    },
    D: {
      label: "Exhaustive: sweep everything (budget fixed only)",
      fixed: ["annual_budget"],
      sweep: {
        deploy_years: DEPLOY_YEARS,
        check_t1: CHECK_T1S_FINE,
        t2_ratio: T2_RATIOS,
        alloc_t1: ALLOC_T1S,
        stage_mix: STAGE_MIXES,
        syndicate_pct: SYND_PCTS,
        followon_pct: FOLLOWON_PCTS,
      },
    },
  };

  // ── Scoring ──
  function divPenalty(deals) {
    return deals >= 20 ? 1 : deals >= 15 ? 0.95 : deals >= 10 ? 0.8 : 0.5;
  }
  function score(m, target) {
    const base = m.moicBase,
      bull = m.moicBull,
      bear = m.moicBear,
      deals = m.deals;
    const dp = divPenalty(deals);
    if (target === "maxMoic") return base * dp;
    if (target === "conservative") return bear * dp;
    if (target === "sharpe") {
      const spread = Math.max(0.01, bull - bear);
      return ((base - 1) / spread) * dp;
    }
    // balanced (sortino)
    const exp = 0.5 * base + 0.25 * bull + 0.25 * bear;
    const downside = Math.max(0.01, exp - bear);
    return ((exp - 1) / downside) * dp;
  }

  // ── Worker Code Builder ──
  function buildWorkerSrc() {
    const fns = [
      calcCapital,
      calcTiers,
      calcDeployment,
      calcPortfolioStage,
      calcPortfolio,
      calcScenarioEV,
      calcFeesTax,
      calcJCurve,
      calcMOIC,
      calcPostTaxMOIC,
      calcIRR,
      buildCashFlows,
      calcNetWorth,
      calcOppCost,
      calcEV,
      calcSensitivity,
      recalcAll,
      recalcLite,
    ]
      .map((f) => f.toString())
      .join("\n");
    return `"use strict";
var STAGES=${JSON.stringify(STAGES)};
var OUTCOMES=${JSON.stringify(OUTCOMES)};
var DEFAULTS=${JSON.stringify(DEFAULTS)};
${fns}
self.onmessage=function(e){
  if(e.data.type!=="start")return;
  var d=e.data, base=JSON.parse(JSON.stringify(d.baseState)), sw=d.sweepRanges, target=d.optimTarget;
  var configs=[], ct1s=sw.check_t1||[base.check_t1], t2rs=sw.t2_ratio||[0],
    a1s=sw.alloc_t1||[base.alloc_t1], mixes=sw.stage_mix||[base.stage_mix],
    synds=sw.syndicate_pct||[base.syndicate_pct], fos=sw.followon_pct||[base.followon_pct],
    dys=sw.deploy_years||[base.deploy_years];
  for(var a=0;a<ct1s.length;a++)for(var b=0;b<t2rs.length;b++)for(var c=0;c<a1s.length;c++)
    for(var dd=0;dd<mixes.length;dd++)for(var ee=0;ee<synds.length;ee++)
      for(var ff=0;ff<fos.length;ff++)for(var gg=0;gg<dys.length;gg++)
        configs.push({check_t1:ct1s[a],check_t2:t2rs[b]?Math.round(ct1s[a]*t2rs[b]):base.check_t2,
          alloc_t1:a1s[c],alloc_t2:1-a1s[c],stage_mix:mixes[dd],syndicate_pct:synds[ee],
          followon_pct:fos[ff],deploy_years:dys[gg]});
  var total=configs.length, topN=[], batch=[];
  function dp(deals){return deals>=20?1:deals>=15?.95:deals>=10?.8:.5;}
  function sc(m){
    var b=m.moicBase,bu=m.moicBull,be=m.moicBear,deals=m.deals,pen=dp(deals);
    if(target==="maxMoic")return b*pen;
    if(target==="conservative")return be*pen;
    if(target==="sharpe"){var sp=Math.max(.01,bu-be);return((b-1)/sp)*pen;}
    var exp=.5*b+.25*bu+.25*be,ds=Math.max(.01,exp-be);return((exp-1)/ds)*pen;
  }
  function insertTop(entry){
    if(topN.length<50){topN.push(entry);topN.sort(function(a,b){return b.score-a.score;});}
    else if(entry.score>topN[49].score){topN[49]=entry;topN.sort(function(a,b){return b.score-a.score;});}
  }
  for(var i=0;i<total;i++){
    var cfg=configs[i], s=JSON.parse(JSON.stringify(base));
    for(var k in cfg){if(k==="stage_mix")s.stage_mix=cfg.stage_mix.slice();else s[k]=cfg[k];}
    var r=recalcAll(s);
    var m={moicBase:r.moic.base.yr10,moicBull:r.moic.bull.yr10,moicBear:r.moic.bear.yr10,deals:r.tiers.totalDeals,
      irrBase:r.irr.base,netMoic:r.fees.netMOIC,grossMoic:r.fees.grossMOIC};
    var scr=sc(m);
    var warns=[];
    if(m.deals<15)warns.push("<15 deals");
    if(Math.max.apply(null,cfg.stage_mix)>.8)warns.push(">80% in one stage");
    insertTop({score:scr,config:cfg,metrics:m,warnings:warns});
    batch.push(m.deals,m.moicBase,scr);
    if((i+1)%500===0||i===total-1){
      self.postMessage({type:"progress",completed:i+1,total:total,
        bestSoFar:topN[0],topN:topN.slice(0,10),
        points:new Float32Array(batch)});
      batch=[];
    }
  }
  self.postMessage({type:"done",topN:topN,totalTested:total});
};`;
  }

  // ── Formatting helpers (access app.js formatters via closure) ──
  function fmtI(n) {
    if (n >= 1e7) return "₹" + (n / 1e7).toFixed(1) + "Cr";
    if (n >= 1e5) return "₹" + (n / 1e5).toFixed(1) + "L";
    return "₹" + n.toLocaleString("en-IN");
  }
  function fmtM(n) {
    return n == null || isNaN(n) ? "—" : n.toFixed(2) + "x";
  }
  function fmtP(n) {
    return n == null || isNaN(n) ? "—" : (n * 100).toFixed(0) + "%";
  }

  // ── Scatter Canvas ──
  var scatterCanvas, scatterCtx, scatterImg, scatterBounds;
  var SC_W = 600,
    SC_H = 400;
  function initScatter(container) {
    container.innerHTML = "";
    scatterCanvas = document.createElement("canvas");
    scatterCanvas.width = SC_W;
    scatterCanvas.height = SC_H;
    scatterCanvas.style.width = "100%";
    scatterCanvas.style.borderRadius = "4px";
    container.appendChild(scatterCanvas);
    scatterCtx = scatterCanvas.getContext("2d");
    scatterImg = scatterCtx.createImageData(SC_W, SC_H);
    scatterBounds = { xMin: 5, xMax: 50, yMin: 0, yMax: 4 };
  }
  function drawScatterBatch(pts) {
    var W = SC_W,
      H = SC_H,
      pad = { t: 12, r: 12, b: 30, l: 50 };
    var pw = W - pad.l - pad.r,
      ph = H - pad.t - pad.b;
    var b = scatterBounds,
      d = scatterImg.data;
    for (var i = 0; i < pts.length; i += 3) {
      var deals = pts[i],
        moic = pts[i + 1],
        sc = pts[i + 2];
      if (deals > b.xMax) b.xMax = deals + 5;
      if (moic > b.yMax) b.yMax = moic * 1.1;
      var px = Math.round(
        pad.l + ((deals - b.xMin) / Math.max(1, b.xMax - b.xMin)) * pw,
      );
      var py = Math.round(
        pad.t + (1 - (moic - b.yMin) / Math.max(0.01, b.yMax - b.yMin)) * ph,
      );
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      // Color by score: low=red, high=green
      var t = Math.max(0, Math.min(1, sc / 3));
      var r = Math.round(180 - t * 100),
        g = Math.round(80 + t * 120),
        bl = 80;
      var idx = (py * W + px) * 4;
      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = bl;
      d[idx + 3] = 220;
      // 2x2 pixel for visibility
      if (px + 1 < W) {
        d[idx + 4] = r;
        d[idx + 5] = g;
        d[idx + 6] = bl;
        d[idx + 7] = 220;
      }
      if (py + 1 < H) {
        var idx2 = ((py + 1) * W + px) * 4;
        d[idx2] = r;
        d[idx2 + 1] = g;
        d[idx2 + 2] = bl;
        d[idx2 + 3] = 220;
      }
    }
    scatterCtx.putImageData(scatterImg, 0, 0);
    // Axes
    scatterCtx.fillStyle = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--text-muted");
    scatterCtx.font = "11px system-ui";
    scatterCtx.textAlign = "center";
    for (var i = 0; i <= 5; i++) {
      var x = pad.l + (i / 5) * (W - pad.l - pad.r);
      scatterCtx.fillText(
        Math.round(b.xMin + (i / 5) * (b.xMax - b.xMin)),
        x,
        H - 8,
      );
    }
    scatterCtx.textAlign = "right";
    for (var i = 0; i <= 5; i++) {
      var y = pad.t + (i / 5) * (H - pad.t - pad.b);
      scatterCtx.fillText(
        (b.yMax - (i / 5) * (b.yMax - b.yMin)).toFixed(1) + "x",
        pad.l - 6,
        y + 4,
      );
    }
  }

  // ── Leaderboard ──
  function renderLeaderboard(container, topN) {
    var h =
      "<table><thead><tr><th>#</th><th>Check</th><th>Mix</th><th>Deals</th><th>Base</th><th>Bull</th><th>Bear</th><th>Score</th></tr></thead><tbody>";
    topN.forEach(function (e, i) {
      var m = e.metrics,
        sm = e.config.stage_mix
          .map(function (v) {
            return Math.round(v * 100);
          })
          .join("/");
      var w = e.warnings.length ? ' style="color:var(--warning)"' : "";
      h +=
        "<tr" +
        w +
        "><td>" +
        (i + 1) +
        "</td><td>" +
        fmtI(e.config.check_t1) +
        "</td><td>" +
        sm +
        "</td><td>" +
        m.deals +
        "</td><td>" +
        fmtM(m.moicBase) +
        "</td><td>" +
        fmtM(m.moicBull) +
        "</td><td>" +
        fmtM(m.moicBear) +
        "</td><td>" +
        e.score.toFixed(2) +
        "</td></tr>";
    });
    h += "</tbody></table>";
    container.innerHTML = h;
  }

  // ── Results Table ──
  function renderResults(container, topN) {
    var h =
      "<table><thead><tr><th>#</th><th>T1</th><th>T2</th><th>Alloc</th><th>Mix</th><th>Synd</th><th>FO</th><th>Yrs</th><th>Deals</th><th>Base</th><th>Bull</th><th>Bear</th><th>Net MOIC</th><th>IRR</th><th>Score</th><th>Warn</th><th></th></tr></thead><tbody>";
    topN.slice(0, 5).forEach(function (e, i) {
      var c = e.config,
        m = e.metrics,
        sm = c.stage_mix
          .map(function (v) {
            return Math.round(v * 100);
          })
          .join("/");
      h +=
        "<tr><td>" +
        (i + 1) +
        "</td><td>" +
        fmtI(c.check_t1) +
        "</td><td>" +
        fmtI(c.check_t2) +
        "</td><td>" +
        fmtP(c.alloc_t1) +
        "</td><td>" +
        sm +
        "</td><td>" +
        fmtP(c.syndicate_pct) +
        "</td><td>" +
        fmtP(c.followon_pct) +
        "</td><td>" +
        c.deploy_years +
        "</td><td>" +
        m.deals +
        "</td><td><strong>" +
        fmtM(m.moicBase) +
        "</strong></td><td>" +
        fmtM(m.moicBull) +
        "</td><td>" +
        fmtM(m.moicBear) +
        "</td><td>" +
        fmtM(m.netMoic) +
        "</td><td>" +
        (m.irrBase && !isNaN(m.irrBase)
          ? (m.irrBase * 100).toFixed(1) + "%"
          : "N/A") +
        "</td><td>" +
        e.score.toFixed(2) +
        "</td><td>" +
        (e.warnings.length ? e.warnings.join(", ") : "-") +
        '</td><td><button class="sim-apply" data-idx="' +
        i +
        '">Apply</button></td></tr>';
    });
    h += "</tbody></table>";
    container.innerHTML = h;
  }

  // ── Insights Generator ──
  function generateInsights(topN, currentState) {
    var ins = [];
    if (!topN.length) return ins;
    var best = topN[0];
    // 1. Deal count sweet spot
    var buckets = {};
    topN.slice(0, 50).forEach(function (e) {
      var b = Math.floor(e.metrics.deals / 5) * 5;
      if (!buckets[b]) buckets[b] = { sum: 0, n: 0 };
      buckets[b].sum += e.score;
      buckets[b].n++;
    });
    var bestBucket = null,
      bestAvg = 0;
    for (var k in buckets) {
      var avg = buckets[k].sum / buckets[k].n;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestBucket = k;
      }
    }
    if (bestBucket)
      ins.push({
        p: 1,
        t:
          "Sweet spot: <strong>" +
          bestBucket +
          "-" +
          (+bestBucket + 5) +
          " deals</strong> with " +
          fmtI(best.config.check_t1) +
          " checks delivers the best risk-adjusted returns.",
      });
    // 2. Current config ranking
    var curDeals = Math.round(
      (currentState.annual_budget *
        currentState.deploy_years *
        (1 - currentState.followon_pct)) /
        (currentState.check_t1 * currentState.alloc_t1 +
          currentState.check_t2 * (1 - currentState.alloc_t1)),
    );
    var curLite = recalcLite(currentState);
    var curScore = score(
      {
        moicBase: curLite.moic.base,
        moicBull: curLite.moic.bull,
        moicBear: curLite.moic.bear,
        deals: curLite.deals,
      },
      "balanced",
    );
    var rank =
      topN.filter(function (e) {
        return e.score > curScore;
      }).length + 1;
    var improvement = best.metrics.moicBase - curLite.moic.base;
    if (improvement > 0.1)
      ins.push({
        p: 2,
        t:
          "Your current config ranks <strong>#" +
          rank +
          "</strong>. The top config improves base MOIC by <strong>" +
          improvement.toFixed(1) +
          "x</strong>.",
      });
    else
      ins.push({
        p: 2,
        t:
          "Your current config is already in the <strong>top " +
          Math.round((rank / topN.length) * 100) +
          "%</strong> — well optimized!",
      });
    // 3. Diversification warning
    if (best.metrics.deals < 20)
      ins.push({
        p: 3,
        t:
          "Warning: The top config uses only <strong>" +
          best.metrics.deals +
          " deals</strong>. Config #" +
          (topN.findIndex(function (e) {
            return e.metrics.deals >= 20;
          }) +
            1) +
          " has 20+ deals with slightly lower returns.",
      });
    ins.sort(function (a, b) {
      return a.p - b.p;
    });
    return ins.slice(0, 3);
  }

  // ── UI Orchestration ──
  var worker = null,
    currentResults = null;
  function goToStep(n) {
    document.querySelectorAll(".sim-step").forEach(function (s) {
      s.classList.remove("active");
    });
    document
      .querySelector('[data-sim-step="' + n + '"]')
      .classList.add("active");
    document
      .querySelectorAll("#sim-overlay .ob-dots .dot")
      .forEach(function (d, i) {
        d.classList.toggle("active", i <= n);
      });
  }
  function updateModeInfo() {
    var mode = document.querySelector('input[name="sim-mode"]:checked').value;
    var def = MODES[mode],
      sw = def.sweep;
    var total = 1;
    for (var k in sw) total *= sw[k].length;
    document.getElementById("sim-info").textContent =
      "Will test " +
      total.toLocaleString() +
      " configurations (~" +
      (total < 5000 ? "<1" : Math.ceil(total / 500000)) +
      "s)";
    var h =
      "<div style='font-size:0.78rem;color:var(--text-muted);margin:8px 0'><strong>Fixed from dashboard:</strong> ";
    def.fixed.forEach(function (k) {
      var v = getVal(state, k);
      h +=
        k.replace(/_/g, " ") +
        ": <strong>" +
        (k.includes("budget") || k.includes("check") ? fmtI(v) : v) +
        "</strong> &nbsp; ";
    });
    h += "</div>";
    document.getElementById("sim-fixed-params").innerHTML = h;
  }

  function startSim() {
    var mode = document.querySelector('input[name="sim-mode"]:checked').value;
    var def = MODES[mode],
      target = document.getElementById("sim-target").value;
    var fixedParams = {};
    def.fixed.forEach(function (k) {
      fixedParams[k] = getVal(state, k);
    });
    // Build worker
    var src = buildWorkerSrc();
    var blob = new Blob([src], { type: "application/javascript" });
    worker = new Worker(URL.createObjectURL(blob));
    initScatter(document.getElementById("sim-scatter"));
    goToStep(1);
    document.getElementById("sim-progress-fill").style.width = "0%";
    document.getElementById("sim-status").textContent = "Starting...";
    worker.onmessage = function (e) {
      var msg = e.data;
      if (msg.type === "progress") {
        var pct = ((msg.completed / msg.total) * 100).toFixed(1);
        document.getElementById("sim-progress-fill").style.width = pct + "%";
        document.getElementById("sim-status").textContent =
          "Testing " +
          msg.completed.toLocaleString() +
          " / " +
          msg.total.toLocaleString() +
          " — Best: " +
          fmtM(msg.bestSoFar.metrics.moicBase) +
          " (" +
          msg.bestSoFar.metrics.deals +
          " deals)";
        drawScatterBatch(msg.points);
        renderLeaderboard(document.getElementById("sim-leaderboard"), msg.topN);
      }
      if (msg.type === "done") {
        currentResults = msg.topN;
        goToStep(2);
        renderResults(document.getElementById("sim-results"), msg.topN);
        var insights = generateInsights(msg.topN, state);
        var ih = "";
        insights.forEach(function (ins) {
          ih += '<div class="sim-insight">' + ins.t + "</div>";
        });
        document.getElementById("sim-insights").innerHTML = ih;
        if (typeof Sound !== "undefined") Sound.play("success");
        URL.revokeObjectURL(blob);
        worker = null;
      }
    };
    worker.postMessage({
      type: "start",
      baseState: JSON.parse(JSON.stringify(state)),
      sweepRanges: def.sweep,
      optimTarget: target,
    });
    if (typeof Sound !== "undefined") Sound.play("tab");
  }

  function applyConfig(idx) {
    if (!currentResults || !currentResults[idx]) return;
    var cfg = currentResults[idx].config;
    for (var k in cfg) {
      if (k === "stage_mix")
        cfg.stage_mix.forEach(function (v, i) {
          setVal(state, "stage_mix." + i, v);
        });
      else if (k !== "alloc_t2") setVal(state, k, cfg[k]);
    }
    setVal(state, "alloc_t2", 1 - cfg.alloc_t1);
    if (typeof refreshInputs === "function") refreshInputs();
    if (typeof scheduleRecompute === "function") scheduleRecompute();
    document.getElementById("sim-overlay").classList.add("hidden");
    if (typeof showToast === "function")
      showToast(
        "Applied: " +
          cfg.check_t1 / 100000 +
          "L checks, " +
          currentResults[idx].metrics.deals +
          " deals, " +
          fmtM(currentResults[idx].metrics.moicBase) +
          " MOIC",
      );
    if (typeof Sound !== "undefined") Sound.play("success");
  }

  function cancelSim() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    document.getElementById("sim-overlay").classList.add("hidden");
  }

  // ── Init ──
  window.initSimulator = function () {
    document.getElementById("sim-btn").addEventListener("click", function () {
      document.getElementById("sim-overlay").classList.remove("hidden");
      goToStep(0);
      updateModeInfo();
    });
    document.getElementById("sim-close").addEventListener("click", cancelSim);
    document.getElementById("sim-cancel").addEventListener("click", cancelSim);
    document.getElementById("sim-start").addEventListener("click", startSim);
    document.getElementById("sim-rerun").addEventListener("click", function () {
      goToStep(0);
      updateModeInfo();
    });
    document
      .getElementById("sim-close-results")
      .addEventListener("click", function () {
        document.getElementById("sim-overlay").classList.add("hidden");
      });
    document.querySelectorAll('input[name="sim-mode"]').forEach(function (r) {
      r.addEventListener("change", updateModeInfo);
    });
    document
      .getElementById("sim-results")
      .addEventListener("click", function (e) {
        var btn = e.target.closest(".sim-apply");
        if (btn) applyConfig(parseInt(btn.dataset.idx));
      });
  };
})();
