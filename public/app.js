(function () {
  "use strict";

  var TOKEN_KEY = "hbp.token";
  var THEME_KEY = "hbp.theme";

  var PATHWAY_META = {
    grey: { name: "Grey", sub: "SMR, no CCUS", color: "var(--series-grey)" },
    blue: { name: "Blue", sub: "SMR/ATR + CCUS", color: "var(--series-blue)" },
    green: { name: "Green", sub: "Electrolysis, grid-connected", color: "var(--series-green)" },
    pink: { name: "Pink", sub: "Nuclear-powered electrolysis", color: "var(--series-pink)" },
    turquoise: { name: "Turquoise", sub: "Methane pyrolysis", color: "var(--series-turquoise)" }
  };
  var PATHWAY_ORDER = ["grey", "blue", "green", "pink", "turquoise"];
  var YEARS = [2026, 2030, 2035, 2040, 2046];
  var CLUSTER_ORDER = ["ROAD", "HYNET", "HUMBER", "TEESSIDE"];
  var CLUSTER_SHORT = { ROAD: "Off-cluster", HYNET: "HyNet", HUMBER: "Humber", TEESSIDE: "Teesside" };

  var BREAKDOWN_LABELS = {
    gas: "Gas", elec: "Electricity", energy: "Electricity", capex: "Capex + O&M",
    carbon: "Residual carbon", ccsFee: "CCS transport/storage", credit: "By-product credit",
    other: "Water/degradation", cluster: "Delivery logistics"
  };
  var BREAKDOWN_COLORS = {
    gas: "#a66a2f", elec: "#7a8a90", energy: "#1baf7a", capex: "#b7c2c6",
    carbon: "#8a4a1f", ccsFee: "#9aa6ab", credit: "#3a8a4a", other: "#b7c2c6",
    cluster: "#5b6b78"
  };

  var state = {
    pathway: "grey",
    year: 2026,
    clusterId: "ROAD",
    electrolyser: "PEM",
    tab: "explorer",
    clusters: null,
    projects: []
  };

  // ---------------- API client ----------------

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (res) {
      if (res.status === 401) {
        setToken(null);
        showAuthScreen();
        throw new Error("Session expired — please sign in again");
      }
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || "Request failed (" + res.status + ")");
        return body;
      });
    });
  }

  // ---------------- Auth screen ----------------

  var authMode = "login";

  function showAuthScreen() {
    document.getElementById("appScreen").hidden = true;
    document.getElementById("authScreen").hidden = false;
  }
  function showAppScreen() {
    document.getElementById("authScreen").hidden = true;
    document.getElementById("appScreen").hidden = false;
    boot();
  }

  document.getElementById("authSwitchBtn").addEventListener("click", function () {
    authMode = authMode === "login" ? "register" : "login";
    document.getElementById("authTitle").textContent = authMode === "login" ? "Sign in" : "Create an account";
    document.getElementById("authSubmit").textContent = authMode === "login" ? "Sign in" : "Register";
    document.getElementById("authSwitchLabel").textContent = authMode === "login" ? "No account yet?" : "Already have an account?";
    document.getElementById("authSwitchBtn").textContent = authMode === "login" ? "Register" : "Sign in";
    document.getElementById("authError").textContent = "";
  });

  document.getElementById("authForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("authEmail").value.trim();
    var password = document.getElementById("authPassword").value;
    var errorEl = document.getElementById("authError");
    errorEl.textContent = "";
    var endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (!r.ok) { errorEl.textContent = r.body.error || "Something went wrong"; return; }
        setToken(r.body.token);
        showAppScreen();
      })
      .catch(function () { errorEl.textContent = "Could not reach the server"; });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    setToken(null);
    showAuthScreen();
  });

  // ---------------- Theme toggle ----------------

  function currentTheme() {
    var stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("themeToggleBtn").textContent = theme === "dark" ? "Light mode" : "Dark mode";
  }
  document.getElementById("themeToggleBtn").addEventListener("click", function () {
    var next = currentTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
  applyTheme(currentTheme());

  // ---------------- Sidebar ----------------

  function renderPathwayList() {
    var el = document.getElementById("pathwayList");
    el.innerHTML = "";
    PATHWAY_ORDER.forEach(function (p) {
      var meta = PATHWAY_META[p];
      var btn = document.createElement("button");
      btn.className = "pathway-item" + (p === state.pathway ? " is-active" : "");
      btn.type = "button";
      btn.innerHTML =
        '<span class="name"><span class="tech-dot" style="background:' + meta.color + '"></span>' + meta.name + "</span>" +
        '<span class="sub">' + meta.sub + "</span>";
      btn.addEventListener("click", function () {
        state.pathway = p;
        renderAll();
      });
      el.appendChild(btn);
    });
  }

  function renderYearChips() {
    var el = document.getElementById("yearChips");
    el.innerHTML = "";
    YEARS.forEach(function (y) {
      var btn = document.createElement("button");
      btn.className = "chip-btn" + (y === state.year ? " is-active" : "");
      btn.type = "button";
      btn.textContent = y;
      btn.addEventListener("click", function () { state.year = y; renderAll(); });
      el.appendChild(btn);
    });
  }

  function renderElectrolyserChips() {
    var group = document.getElementById("electrolyserGroup");
    group.hidden = state.pathway !== "green";
    if (state.pathway !== "green") return;
    var el = document.getElementById("electrolyserChips");
    el.innerHTML = "";
    ["PEM", "AEL", "SOE"].forEach(function (tech) {
      var btn = document.createElement("button");
      btn.className = "chip-btn" + (tech === state.electrolyser ? " is-active" : "");
      btn.type = "button";
      btn.textContent = tech;
      btn.addEventListener("click", function () { state.electrolyser = tech; renderAll(); });
      el.appendChild(btn);
    });
  }

  function renderClusterChips() {
    var el = document.getElementById("clusterChips");
    el.innerHTML = "";
    CLUSTER_ORDER.forEach(function (cid) {
      var btn = document.createElement("button");
      btn.className = "chip-btn" + (cid === state.clusterId ? " is-active" : "");
      btn.type = "button";
      btn.textContent = CLUSTER_SHORT[cid];
      btn.addEventListener("click", function () { state.clusterId = cid; renderAll(); });
      el.appendChild(btn);
    });
    renderClusterCard();
  }

  function renderClusterCard() {
    var card = document.getElementById("clusterCard");
    if (!state.clusters) { card.innerHTML = ""; return; }
    var c = state.clusters.find(function (x) { return x.id === state.clusterId; });
    if (!c) { card.innerHTML = ""; return; }
    card.innerHTML =
      '<div class="name">' + c.name + "</div>" +
      '<div class="row"><span>Mode</span><span>' + (c.mode === "pipeline" ? "Pipeline" : "Road tube-trailer") + "</span></div>" +
      '<div class="row"><span>Transport (' + state.year + ")</span><span>£" + c.transportPerKg[state.year].toFixed(2) + "/kg</span></div>" +
      '<div class="row"><span>Storage/delivery (' + state.year + ")</span><span>£" + c.storagePerKg[state.year].toFixed(2) + "/kg</span></div>" +
      '<div class="caveat">' + c.caveat + "</div>";
  }

  // ---------------- Tabs ----------------

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
      document.getElementById("panel-explorer").hidden = state.tab !== "explorer";
      document.getElementById("panel-comparison").hidden = state.tab !== "comparison";
      document.getElementById("panel-sensitivity").hidden = state.tab !== "sensitivity";
      document.getElementById("panel-portfolio").hidden = state.tab !== "portfolio";
      document.getElementById("panel-workspace").hidden = state.tab !== "workspace";
      renderActiveTab();
    });
  });

  // ---------------- Explorer ----------------

  function money(x) { return "£" + x.toFixed(2); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Purely a decorative diurnal texture over the API's authoritative daily
  // average — normalised so its mean is exactly 1.0, so the rendered curve's
  // average always equals the server's total. No pricing logic lives here.
  function diurnalMultipliers(seed) {
    var rand = mulberry32(seed);
    var trough = 0.45, peak = 1.6, curtail = 0.12;
    var raw = [];
    for (var h = 0; h < 24; h++) {
      var angle = ((h - 4) / 24) * 2 * Math.PI;
      var main = trough + (peak - trough) * (0.5 - 0.5 * Math.cos(angle));
      var eveningBump = Math.exp(-Math.pow(h - 18, 2) / 8) * (peak - trough) * 0.15;
      var solarDip = Math.exp(-Math.pow(h - 13, 2) / 10) * (main - curtail) * 0.85;
      var value = main + eveningBump - solarDip;
      value = value * (1 + (rand() - 0.5) * 0.06);
      raw.push(Math.max(value, curtail * 0.7));
    }
    var mean = raw.reduce(function (a, b) { return a + b; }, 0) / raw.length;
    return raw.map(function (v) { return v / mean; });
  }

  function svgResolveColor(v) {
    if (v.indexOf("var(") === 0) {
      var name = v.slice(4, -1).trim();
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    return v;
  }

  function renderDiurnalChart(total, rangePct, pathway) {
    var wrap = document.getElementById("diurnalChartWrap");
    wrap.innerHTML = "";
    var mults = diurnalMultipliers(state.year * 10 + PATHWAY_ORDER.indexOf(pathway));
    var series = mults.map(function (m, h) { return { hour: h, total: total * m }; });

    var W = 860, H = 220, padL = 46, padR = 16;
    var padT = 12, padB = 24;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var allVals = [];
    series.forEach(function (d) {
      allVals.push(d.total * (1 + rangePct));
      allVals.push(d.total * (1 - rangePct));
    });
    var maxV = Math.max.apply(null, allVals) * 1.1;
    var minV = Math.max(0, Math.min.apply(null, allVals) * 0.9);

    function x(h) { return padL + (h / 23) * plotW; }
    function y(v) { return padT + plotH - ((v - minV) / (maxV - minV || 1)) * plotH; }

    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("id", "diurnalSvg");
    svg.style.width = "100%";
    svg.style.maxWidth = W + "px";
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Illustrative 24-hour price curve for " + pathway);

    var color = svgResolveColor(PATHWAY_META[pathway].color);
    var mutedColor = svgResolveColor("var(--text-muted)");
    var borderColor = svgResolveColor("var(--border)");

    for (var i = 0; i <= 3; i++) {
      var gv = minV + ((maxV - minV) / 3) * i;
      var gy = y(gv);
      var line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", padL); line.setAttribute("x2", W - padR);
      line.setAttribute("y1", gy); line.setAttribute("y2", gy);
      line.setAttribute("stroke", borderColor); line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
      var label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", padL - 8); label.setAttribute("y", gy + 3);
      label.setAttribute("text-anchor", "end"); label.setAttribute("font-size", "10");
      label.setAttribute("font-family", "monospace"); label.setAttribute("fill", mutedColor);
      label.textContent = "£" + gv.toFixed(1);
      svg.appendChild(label);
    }

    var bandPts = "M " + x(0) + " " + y(series[0].total * (1 + rangePct)) + " ";
    series.forEach(function (d) { bandPts += "L " + x(d.hour) + " " + y(d.total * (1 + rangePct)) + " "; });
    for (var k = series.length - 1; k >= 0; k--) { bandPts += "L " + x(series[k].hour) + " " + y(series[k].total * (1 - rangePct)) + " "; }
    bandPts += "Z";
    var band = document.createElementNS(svgNS, "path");
    band.setAttribute("d", bandPts); band.setAttribute("fill", color); band.setAttribute("opacity", "0.12"); band.setAttribute("stroke", "none");
    svg.appendChild(band);

    var linePts = series.map(function (d) { return x(d.hour) + "," + y(d.total); }).join(" ");
    var poly = document.createElementNS(svgNS, "polyline");
    poly.setAttribute("points", linePts); poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", color); poly.setAttribute("stroke-width", "2");
    svg.appendChild(poly);

    for (var h2 = 0; h2 < 24; h2 += 3) {
      var lbl = document.createElementNS(svgNS, "text");
      lbl.setAttribute("x", x(h2)); lbl.setAttribute("y", H - 6);
      lbl.setAttribute("text-anchor", "middle"); lbl.setAttribute("font-size", "10");
      lbl.setAttribute("font-family", "monospace"); lbl.setAttribute("fill", mutedColor);
      lbl.textContent = (h2 < 10 ? "0" : "") + h2 + ":00";
      svg.appendChild(lbl);
    }

    var caption = document.createElement("p");
    caption.className = "spot-note";
    caption.textContent = "Illustrative 24-hour shape around the API's authoritative daily average (£" + total.toFixed(2) + "/kg) — the wiggle is decorative texture, not a separate price feed. Shaded band = ±" + Math.round(rangePct * 100) + "% published-range uncertainty.";

    wrap.appendChild(svg);
    wrap.appendChild(caption);
  }

  function renderBreakdownBar(breakdown) {
    var bar = document.getElementById("breakdownBar");
    var legend = document.getElementById("breakdownLegend");
    bar.innerHTML = "";
    legend.innerHTML = "";
    var keys = Object.keys(breakdown).filter(function (k) { return k !== "total" && k !== "captureRate" && k !== "kwhPerKg" && k !== "effPct" && BREAKDOWN_LABELS[k]; });
    var total = breakdown.total;
    keys.forEach(function (k) {
      var val = breakdown[k];
      var pct = Math.max(0, (val / total) * 100);
      var seg = document.createElement("div");
      seg.className = "breakdown-seg";
      seg.style.width = pct + "%";
      seg.style.background = BREAKDOWN_COLORS[k] || "#888";
      if (pct > 8) seg.textContent = money(val);
      bar.appendChild(seg);

      var item = document.createElement("span");
      item.innerHTML = '<span class="sw" style="background:' + (BREAKDOWN_COLORS[k] || "#888") + '"></span>' + BREAKDOWN_LABELS[k] + ": " + money(val);
      legend.appendChild(item);
    });
  }

  function renderExplorer() {
    var params = new URLSearchParams({ year: state.year, clusterId: state.clusterId, electrolyser: state.electrolyser });
    api("/api/pathways/" + state.pathway + "/cost?" + params.toString()).then(function (data) {
      var meta = PATHWAY_META[state.pathway];
      document.getElementById("explorerTitle").textContent = meta.name + " — " + meta.sub;
      document.getElementById("explorerSub").textContent =
        state.year + " scenario · " + CLUSTER_SHORT[state.clusterId] + " · ±" + Math.round(data.uncertainty.pct * 100) + "% uncertainty";

      var kpis = document.getElementById("explorerKpis");
      kpis.innerHTML = "";
      var tiles = [
        { label: "Total £/kg", value: money(data.breakdown.total) },
        { label: "Uncertainty band", value: money(data.uncertainty.low) + "–" + money(data.uncertainty.high) }
      ];
      if (data.carbonPolicyExposure !== undefined) {
        tiles.push({ label: "Carbon policy exposure", value: money(data.carbonPolicyExposure), note: "Not priced in — liability if a carbon mechanism applies" });
      }
      tiles.forEach(function (t) {
        var tile = document.createElement("div");
        tile.className = "kpi-tile";
        tile.innerHTML = '<div class="kpi-label">' + t.label + '</div><div class="kpi-value">' + t.value + "</div>" +
          (t.note ? '<div class="kpi-note">' + t.note + "</div>" : "");
        kpis.appendChild(tile);
      });

      renderBreakdownBar(data.breakdown);
      renderDiurnalChart(data.breakdown.total, data.uncertainty.pct, state.pathway);

      var liveFields = Object.keys(data.marketSources).filter(function (k) { return data.marketSources[k].indexOf("live") === 0; });
      var chip = document.getElementById("marketStatusChip");
      if (liveFields.length > 0) {
        chip.className = "status-chip live";
        chip.textContent = "live: " + liveFields.join(", ");
      } else {
        chip.className = "status-chip curated";
        chip.textContent = "market data: curated (forward scenario)";
      }
    }).catch(function (err) {
      document.getElementById("explorerSub").textContent = "Error: " + err.message;
    });
  }

  // ---------------- Comparison ----------------

  function renderComparison() {
    api("/api/pathways/compare/" + state.year + "?clusterId=" + state.clusterId).then(function (data) {
      document.getElementById("comparisonSub").textContent = state.year + " scenario · " + CLUSTER_SHORT[state.clusterId];
      var list = document.getElementById("rankList");
      list.innerHTML = "";
      data.ranking.forEach(function (r, idx) {
        var meta = PATHWAY_META[r.pathway];
        var row = document.createElement("div");
        row.className = "rank-row";
        row.innerHTML =
          '<div class="rank-left"><span class="rank-pos">' + (idx + 1) + '</span>' +
          '<span class="tech-dot" style="background:' + meta.color + '"></span>' +
          "<span>" + meta.name + "</span></div>" +
          '<span class="rank-total">' + money(r.total) + "</span>";
        list.appendChild(row);
      });
    });
  }

  // ---------------- Sensitivity (canonical pathway tornado) ----------------

  function renderTornadoRows(container, rows, baseline) {
    container.innerHTML = "";
    var allVals = rows.reduce(function (acc, r) { return acc.concat([r.low, r.high, r.baseline]); }, []);
    var maxAbs = Math.max.apply(null, allVals.map(Math.abs)) * 1.15 || 1;

    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "tornado-row";
      var lowPct = (r.low / maxAbs) * 100;
      var highPct = (r.high / maxAbs) * 100;
      var basePct = (r.baseline / maxAbs) * 100;
      var label = document.createElement("div");
      label.className = "tornado-label";
      var valsText = (highPct - lowPct < 7)
        ? money(r.low) + "–" + money(r.high)
        : money(r.low) + " · " + money(r.high);
      label.innerHTML = "<span>" + r.name + "</span><span class=\"vals\">" + valsText + "</span>";
      var track = document.createElement("div");
      track.className = "tornado-track";
      var bar = document.createElement("div");
      bar.className = "tornado-bar" + (r.exposure ? " exposure" : "");
      bar.style.left = Math.min(lowPct, highPct) + "%";
      bar.style.width = Math.abs(highPct - lowPct) + "%";
      track.appendChild(bar);
      var marker = document.createElement("div");
      marker.className = "tornado-marker";
      marker.style.left = basePct + "%";
      track.appendChild(marker);
      row.appendChild(label);
      row.appendChild(track);
      container.appendChild(row);
    });
  }

  function renderSensitivity() {
    document.getElementById("sensPathwayLabel").textContent = PATHWAY_META[state.pathway].name;
    var params = new URLSearchParams({ year: state.year, clusterId: state.clusterId, electrolyser: state.electrolyser });
    api("/api/pathways/" + state.pathway + "/sensitivity?" + params.toString()).then(function (data) {
      document.getElementById("sensSub").textContent =
        "±30% market swing, ±20% capex swing · " + state.year + " scenario · baseline £" + data.baseline.toFixed(2) + "/kg shown as vertical marker";
      renderTornadoRows(document.getElementById("tornadoWrap"), data.rows, data.baseline);
    });
  }

  // ---------------- Portfolio blend ----------------

  var portfolio = [{ id: 1, projectId: null, weight: 50 }];
  var portfolioIdCounter = 2;

  function renderPortfolio() {
    var rowsEl = document.getElementById("portfolioRows");
    rowsEl.innerHTML = "";
    if (state.projects.length === 0) {
      rowsEl.innerHTML = '<p class="spot-note">No saved projects yet — add one from Project Workspace first.</p>';
      document.getElementById("portfolioKpis").innerHTML = "";
      return;
    }
    portfolio.forEach(function (row) {
      var el = document.createElement("div");
      el.className = "portfolio-row";
      var select = document.createElement("select");
      state.projects.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id; opt.textContent = p.name.indexOf(PATHWAY_META[p.pathway].name) === 0 ? p.name : PATHWAY_META[p.pathway].name + " — " + p.name;
        if (String(p.id) === String(row.projectId)) opt.selected = true;
        select.appendChild(opt);
      });
      if (row.projectId === null) { row.projectId = state.projects[0].id; select.value = row.projectId; }
      // Project ids are strings (Postgres BIGSERIAL) — keep row.projectId a
      // string throughout rather than parseInt-ing it, or it stops matching
      // p.id (===) the moment a user changes this dropdown.
      select.addEventListener("change", function () { row.projectId = select.value; renderPortfolio(); });

      var weightInput = document.createElement("input");
      weightInput.type = "number"; weightInput.min = "0"; weightInput.value = row.weight;
      weightInput.addEventListener("input", function () { row.weight = parseFloat(weightInput.value) || 0; renderPortfolio(); });

      var removeBtn = document.createElement("button");
      removeBtn.className = "btn"; removeBtn.type = "button"; removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", function () {
        portfolio = portfolio.filter(function (r) { return r.id !== row.id; });
        renderPortfolio();
      });

      el.appendChild(select);
      el.appendChild(weightInput);
      el.appendChild(removeBtn);
      rowsEl.appendChild(el);
    });

    var weightSum = portfolio.reduce(function (s, r) { return s + (r.weight || 0); }, 0);
    var blended = 0;
    portfolio.forEach(function (r) {
      var proj = state.projects.find(function (p) { return String(p.id) === String(r.projectId); });
      if (proj && weightSum > 0) blended += (r.weight / weightSum) * proj.costs.total;
    });

    var kpis = document.getElementById("portfolioKpis");
    kpis.innerHTML = "";
    var tile1 = document.createElement("div");
    tile1.className = "kpi-tile";
    tile1.innerHTML = '<div class="kpi-label">Blended delivered price</div><div class="kpi-value">' + (weightSum > 0 ? money(blended) : "—") + "</div>";
    kpis.appendChild(tile1);
    var tile2 = document.createElement("div");
    tile2.className = "kpi-tile";
    tile2.innerHTML = '<div class="kpi-label">Total weight</div><div class="kpi-value">' + weightSum + "</div>";
    kpis.appendChild(tile2);
  }

  document.getElementById("portfolioAddRowBtn").addEventListener("click", function () {
    portfolio.push({ id: portfolioIdCounter++, projectId: null, weight: 25 });
    renderPortfolio();
  });

  // ---------------- Workspace (projects) ----------------

  var PROJECT_FIELDS = {
    grey: ["gasPrice", "gasKwh", "elecPrice", "elecKwh", "unabatedCO2", "carbonPrice", "capex", "transport", "storage", "refPrice"],
    blue: ["gasPrice", "gasKwh", "elecPrice", "elecKwh", "unabatedCO2", "captureRate", "carbonPrice", "capex", "ccsFee", "transport", "storage", "refPrice"],
    green: ["elecPrice", "elecKwh", "capex", "other", "transport", "storage", "refPrice"],
    pink: ["elecPrice", "elecKwh", "capex", "other", "transport", "storage", "refPrice"],
    turquoise: ["gasPrice", "gasKwh", "elecPrice", "elecKwh", "capex", "credit", "transport", "storage", "refPrice"]
  };
  var FIELD_LABELS = {
    gasPrice: "Gas £/MWh", gasKwh: "Gas kWh/kg", elecPrice: "Elec £/MWh", elecKwh: "Elec kWh/kg",
    unabatedCO2: "Unabated kg/kg", captureRate: "Capture %", carbonPrice: "Carbon £/t",
    capex: "Capex £/kg", ccsFee: "CCS fee £/kg", credit: "By-product credit £/kg", other: "Water/degr. £/kg",
    transport: "Transport £/kg", storage: "Storage £/kg", refPrice: "Ref price £/kg"
  };

  function loadProjects() {
    return api("/api/projects").then(function (data) {
      state.projects = data.projects;
    });
  }

  function renderWorkspace() {
    document.getElementById("workspacePathwayLabel").textContent = PATHWAY_META[state.pathway].name;
    var list = state.projects.filter(function (p) { return p.pathway === state.pathway; });
    var fields = PROJECT_FIELDS[state.pathway];
    var table = document.getElementById("projectsTable");
    table.innerHTML = "";

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    ["Name"].concat(fields.map(function (f) { return FIELD_LABELS[f]; })).concat(["Total £/kg", "CfD gap", ""]).forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    list.forEach(function (proj) {
      var tr = document.createElement("tr");

      var nameTd = document.createElement("td");
      var nameInput = document.createElement("input");
      nameInput.type = "text"; nameInput.value = proj.name;
      nameInput.addEventListener("change", function () { updateProject(proj.id, { name: nameInput.value }); });
      nameTd.appendChild(nameInput);
      tr.appendChild(nameTd);

      fields.forEach(function (f) {
        var td = document.createElement("td");
        if (f === "captureRate") {
          // stored as 0-100 already
        }
        var input = document.createElement("input");
        input.type = "number"; input.step = "0.01";
        input.value = proj[f];
        input.addEventListener("change", function () {
          var val = parseFloat(input.value);
          if (isNaN(val)) return;
          var patch = {}; patch[f] = val;
          updateProject(proj.id, patch);
        });
        td.appendChild(input);
        tr.appendChild(td);
      });

      var totalTd = document.createElement("td");
      totalTd.textContent = money(proj.costs.total);
      tr.appendChild(totalTd);

      var gapTd = document.createElement("td");
      var gap = proj.costs.cfdGap;
      gapTd.textContent = (gap >= 0 ? "+" : "") + money(gap);
      gapTd.style.color = gap > 0 ? "var(--status-critical)" : "var(--status-good)";
      tr.appendChild(gapTd);

      var actionTd = document.createElement("td");
      var delBtn = document.createElement("button");
      delBtn.className = "btn"; delBtn.type = "button"; delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () { deleteProject(proj.id); });
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function updateProject(id, patch) {
    var errorEl = document.getElementById("workspaceError");
    errorEl.textContent = "";
    api("/api/projects/" + id, { method: "PUT", body: JSON.stringify(patch) })
      .then(function (updated) {
        var idx = state.projects.findIndex(function (p) { return p.id === updated.id; });
        if (idx !== -1) state.projects[idx] = updated;
        renderWorkspace();
      })
      .catch(function (err) { errorEl.textContent = err.message; });
  }

  function deleteProject(id) {
    api("/api/projects/" + id, { method: "DELETE" }).then(function () {
      state.projects = state.projects.filter(function (p) { return p.id !== id; });
      renderWorkspace();
    });
  }

  document.getElementById("addProjectBtn").addEventListener("click", function () {
    var errorEl = document.getElementById("workspaceError");
    errorEl.textContent = "";
    api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ pathway: state.pathway, year: state.year, electrolyser: state.electrolyser, clusterId: state.clusterId })
    })
      .then(function (created) {
        state.projects.push(created);
        renderWorkspace();
        renderStressTest();
      })
      .catch(function (err) { errorEl.textContent = err.message; });
  });

  function downloadBlob(content, mime, filename) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvEscape(v) {
    var s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  document.getElementById("exportCsvBtn").addEventListener("click", function () {
    var list = state.projects.filter(function (p) { return p.pathway === state.pathway; });
    if (list.length === 0) return;
    var fields = PROJECT_FIELDS[state.pathway];
    var headers = ["Name"].concat(fields.map(function (f) { return FIELD_LABELS[f]; })).concat(["Total £/kg", "CfD gap £/kg"]);
    var rows = list.map(function (p) {
      return [p.name].concat(fields.map(function (f) { return p[f]; })).concat([p.costs.total.toFixed(2), p.costs.cfdGap.toFixed(2)]);
    });
    var lines = [headers.map(csvEscape).join(",")].concat(rows.map(function (r) { return r.map(csvEscape).join(","); }));
    downloadBlob(lines.join("\r\n"), "text/csv;charset=utf-8;", state.pathway + "_projects.csv");
  });

  document.getElementById("explorerPngBtn").addEventListener("click", function () {
    var svg = document.getElementById("diurnalSvg");
    if (!svg) return;
    var clone = svg.cloneNode(true);
    var W = 860, H = 220;
    var svgData = new XMLSerializer().serializeToString(clone);
    var img = new Image();
    var bgColor = svgResolveColor("var(--surface)");
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = W * 2; canvas.height = H * 2;
      var ctx = canvas.getContext("2d");
      ctx.scale(2, 2);
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = state.pathway + "_" + state.year + "_price_curve.png";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
  });

  // ---------------- Project stress test (per-project tornado + heatmap) ----------------

  var HEATMAP_STEPS = [-0.4, -0.2, 0, 0.2, 0.4];

  function stressProject() {
    // Project ids come back from the API as strings (Postgres BIGSERIAL) —
    // compare as strings throughout rather than parseInt-ing one side.
    var id = document.getElementById("stressProjectSelect").value;
    return state.projects.find(function (p) { return String(p.id) === id; });
  }

  function renderStressTest() {
    var select = document.getElementById("stressProjectSelect");
    var list = state.projects.filter(function (p) { return p.pathway === state.pathway; });
    var prevValue = select.value;
    select.innerHTML = "";
    list.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id; opt.textContent = p.name;
      select.appendChild(opt);
    });
    if (list.some(function (p) { return String(p.id) === prevValue; })) select.value = prevValue;

    var rowField = document.getElementById("heatmapRowField");
    var colField = document.getElementById("heatmapColField");
    if (rowField.options.length === 0) {
      var numericFields = ["gasPrice", "elecPrice", "carbonPrice", "capex"];
      numericFields.forEach(function (f) {
        var o1 = document.createElement("option"); o1.value = f; o1.textContent = FIELD_LABELS[f]; rowField.appendChild(o1);
        var o2 = document.createElement("option"); o2.value = f; o2.textContent = FIELD_LABELS[f]; colField.appendChild(o2);
      });
      rowField.value = "gasPrice"; colField.value = "carbonPrice";
      rowField.addEventListener("change", renderHeatmap);
      colField.addEventListener("change", renderHeatmap);
    }

    if (list.length === 0) {
      document.getElementById("stressTornadoWrap").innerHTML = '<p class="spot-note">Add a project above to stress-test it.</p>';
      document.getElementById("heatmapWrap").innerHTML = "";
      return;
    }
    select.onchange = function () { renderProjectTornado(); renderHeatmap(); };
    renderProjectTornado();
    renderHeatmap();
  }

  function renderProjectTornado() {
    var proj = stressProject();
    if (!proj) {
      document.getElementById("stressTornadoWrap").innerHTML = '<p class="spot-note">No project selected.</p>';
      return;
    }
    document.getElementById("stressTornadoWrap").innerHTML = '<p class="spot-note">Loading…</p>';
    var base = { gasPrice: proj.gasPrice, gasKwh: proj.gasKwh, elecPrice: proj.elecPrice, elecKwh: proj.elecKwh,
      unabatedCO2: proj.unabatedCO2, captureRate: proj.captureRate, carbonPrice: proj.carbonPrice, priceCarbon: proj.priceCarbon,
      capex: proj.capex, ccsFee: proj.ccsFee, credit: proj.credit, other: proj.other, transport: proj.transport,
      storage: proj.storage, refPrice: proj.refPrice };

    var variations = [];
    var specs = [];
    if (proj.gasPrice) { specs.push({ label: "Gas price", field: "gasPrice", lo: 0.7, hi: 1.3 }); }
    specs.push({ label: proj.pathway === "pink" ? "Nuclear PPA price" : "Electricity price", field: "elecPrice", lo: 0.7, hi: 1.3 });
    specs.push({ label: "Capex + O&M", field: "capex", lo: 0.8, hi: 1.2 });
    if (proj.pathway === "blue") specs.push({ label: "Carbon price", field: "carbonPrice", lo: 0.7, hi: 1.3 });

    specs.forEach(function (s) {
      variations.push({ label: s.label + ":lo", overrides: (function () { var o = {}; o[s.field] = base[s.field] * s.lo; return o; })() });
      variations.push({ label: s.label + ":hi", overrides: (function () { var o = {}; o[s.field] = base[s.field] * s.hi; return o; })() });
    });

    api("/api/projects/compute-batch", { method: "POST", body: JSON.stringify({ base: base, variations: variations }) })
      .then(function (data) {
        var rows = specs.map(function (s) {
          var lo = data.results.find(function (r) { return r.label === s.label + ":lo"; }).costs.total;
          var hi = data.results.find(function (r) { return r.label === s.label + ":hi"; }).costs.total;
          return { name: s.label, low: Math.min(lo, hi), high: Math.max(lo, hi), baseline: data.base.total };
        });
        renderTornadoRows(document.getElementById("stressTornadoWrap"), rows, data.base.total);
      })
      .catch(function (err) { document.getElementById("stressTornadoWrap").innerHTML = '<p class="spot-note">Error: ' + err.message + "</p>"; });
  }

  function renderHeatmap() {
    var proj = stressProject();
    if (!proj) {
      document.getElementById("heatmapWrap").innerHTML = "";
      return;
    }
    document.getElementById("heatmapWrap").innerHTML = '<p class="spot-note">Loading…</p>';
    var rowField = document.getElementById("heatmapRowField").value;
    var colField = document.getElementById("heatmapColField").value;
    var base = { gasPrice: proj.gasPrice, gasKwh: proj.gasKwh, elecPrice: proj.elecPrice, elecKwh: proj.elecKwh,
      unabatedCO2: proj.unabatedCO2, captureRate: proj.captureRate, carbonPrice: proj.carbonPrice, priceCarbon: proj.priceCarbon,
      capex: proj.capex, ccsFee: proj.ccsFee, credit: proj.credit, other: proj.other, transport: proj.transport,
      storage: proj.storage, refPrice: proj.refPrice };

    var variations = [];
    HEATMAP_STEPS.forEach(function (rMult) {
      HEATMAP_STEPS.forEach(function (cMult) {
        var overrides = {};
        overrides[rowField] = base[rowField] * (1 + rMult);
        overrides[colField] = base[colField] * (1 + cMult);
        variations.push({ label: rMult + "," + cMult, overrides: overrides });
      });
    });

    api("/api/projects/compute-batch", { method: "POST", body: JSON.stringify({ base: base, variations: variations }) })
      .then(function (data) {
        var table = document.getElementById("heatmapWrap");
        table.innerHTML = "";
        var tbl = document.createElement("table");
        tbl.className = "heatmap-table";
        var thead = document.createElement("tr");
        thead.innerHTML = "<th>" + FIELD_LABELS[rowField] + " \\ " + FIELD_LABELS[colField] + "</th>" +
          HEATMAP_STEPS.map(function (c) { return "<th>" + (c >= 0 ? "+" : "") + Math.round(c * 100) + "%</th>"; }).join("");
        tbl.appendChild(thead);
        HEATMAP_STEPS.forEach(function (rMult) {
          var tr = document.createElement("tr");
          var rowLabel = document.createElement("th");
          rowLabel.textContent = (rMult >= 0 ? "+" : "") + Math.round(rMult * 100) + "%";
          tr.appendChild(rowLabel);
          HEATMAP_STEPS.forEach(function (cMult) {
            var result = data.results.find(function (r) { return r.label === rMult + "," + cMult; });
            var td = document.createElement("td");
            td.textContent = money(result.costs.total);
            if (rMult === 0 && cMult === 0) td.style.fontWeight = "700";
            tr.appendChild(td);
          });
          tbl.appendChild(tr);
        });
        table.appendChild(tbl);
      })
      .catch(function (err) { document.getElementById("heatmapWrap").innerHTML = '<p class="spot-note">Error: ' + err.message + "</p>"; });
  }

  // ---------------- Dispatch ----------------

  function renderActiveTab() {
    if (state.tab === "explorer") renderExplorer();
    else if (state.tab === "comparison") renderComparison();
    else if (state.tab === "sensitivity") renderSensitivity();
    else if (state.tab === "portfolio") renderPortfolio();
    else if (state.tab === "workspace") { renderWorkspace(); renderStressTest(); }
  }

  function renderAll() {
    renderPathwayList();
    renderYearChips();
    renderElectrolyserChips();
    renderClusterChips();
    renderActiveTab();
  }

  function boot() {
    Promise.all([
      api("/api/pathways/delivery-points").then(function (data) { state.clusters = data; }),
      loadProjects()
    ]).then(renderAll)
      .catch(function (err) {
        console.error(err);
      });
  }

  if (getToken()) showAppScreen();
  else showAuthScreen();
})();
