/* New Bot HQ — event-driven command center.
   Polls status.json every 3s. Characters stay at desks.
   Motion only on normalized state changes (assign/handoff/tool/approval/block/complete/fail). */
(function () {
  const N = window.OfficeNav;
  if (!N) throw new Error("OfficeNav missing");

  const CREATURES = {
    voltbug: { file: "assets/voltbug.png?seated", name: "Voltbug", species: "spark beetle" },
    foldfox: { file: "assets/foldfox.png?seated", name: "Foldfox", species: "origami fox" },
    scanslime: { file: "assets/scanslime.png?seated", name: "Scanslime", species: "lens slime" },
    archivowl: { file: "assets/archivowl.png?seated", name: "Archivowl", species: "archive owl" },
    bunbot: { file: "assets/bunbot.png?seated", name: "Bunbot", species: "bunny-bot" }
  };
  const ASSET_VER = "seated2";
  const RUNNERS = {
    coord: "assets/runner-coord.png?" + ASSET_VER,
    deep: "assets/runner-deep.png?" + ASSET_VER,
    cluster: "assets/runner-cluster.png?" + ASSET_VER,
    watch: "assets/runner-watch.png?" + ASSET_VER,
    lab: "assets/runner-lab.png?" + ASSET_VER
  };
  const DEFAULT_CREATURE = {
    deep: "scanslime",
    cluster: "foldfox",
    watch: "voltbug",
    lab: "archivowl",
    coord: "bunbot"
  };
  const FALLBACK_IDS = ["coord", "deep", "cluster", "watch", "lab"];
  const ACTIVITY_CAP = 8;
  const PACKET_MAX = 2;
  const DEMO_BEATS = [
    { wait: 700, type: "assigned", from: "coord", to: "deep", agent: "deep", task: "Watchlist packet review", result: "assigned" },
    { wait: 1000, type: "tool_started", from: "deep", to: "coord", agent: "deep", task: "Watchlist packet review", result: "running tool: probe" },
    { wait: 900, type: "handoff", from: "deep", to: "cluster", agent: "cluster", task: "Cluster extract", result: "working" },
    { wait: 1000, type: "approval", agent: "lab", to: "lab", task: "Archive release gate", result: "needs approval" },
    { wait: 900, type: "completed", agent: "cluster", to: "cluster", task: "Cluster extract", result: "done" }
  ];

  const stageEl = () => document.getElementById("stage");
  const sceneEl = () => document.getElementById("scene");

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || /(?:\?|&)motion=reduce(?:&|$)/.test(location.search);
  }

  function crewFor(station, idx) {
    const cid = station.creature_id || DEFAULT_CREATURE[station.id] || Object.keys(CREATURES)[idx % 5];
    const creature = CREATURES[cid] || CREATURES.bunbot;
    const runner = RUNNERS[station.id] || "assets/runner-" + FALLBACK_IDS[idx % FALLBACK_IDS.length] + ".png?" + ASSET_VER;
    return {
      runner,
      creature: creature.file,
      creatureName: station.creature || creature.name,
      species: station.creature_species || creature.species,
      creatureId: cid
    };
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtElapsed(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return h + "h " + String(m % 60).padStart(2, "0") + "m";
    }
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function fmtSync(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
  }

  function actionVerb(type) {
    return ({
      assigned: "assigned",
      started: "started",
      tool_started: "ran tool",
      handoff: "handed off",
      approval: "requested approval",
      blocked: "blocked",
      completed: "completed",
      failed: "failed"
    })[type] || type;
  }

  const hq = {
    actors: new Map(),
    lastStations: null,
    lastPayload: null,
    hidden: false,
    selected: null,
    spawned: false,
    demo: false,
    demoTimer: 0,
    packets: 0,
    packetQ: [],
    activity: [],
    seenSince: {},
    overlay: {},
    ambientClock: 0,
    ambientTimer: 0
  };

  function stationById(id) {
    const list = (hq.lastPayload && hq.lastPayload.stations) || [];
    return list.find((s) => s.id === id);
  }

  function displayStation(id) {
    const live = stationById(id);
    const over = hq.overlay[id];
    return over ? Object.assign({}, live || { id: id }, over) : live;
  }

  function makeActor(kind, station, idx) {
    const spec = N.STATIONS[N.stationIdFor(station, idx)] || N.STATIONS.coord;
    const home = kind === "critter" ? N.companionPoint(station.id) : spec.seat;
    const crew = crewFor(station, idx);
    const el = document.createElement("div");
    el.className = "actor " + kind + (spec.face === "left" ? " face-left" : "");
    el.dataset.id = kind === "runner" ? station.id : "c-" + station.id;
    el.dataset.kind = kind;
    el.style.left = home.x + "%";
    el.style.top = home.y + "%";
    el.style.zIndex = String(N.zFromY(home.y));
    const src = kind === "runner" ? crew.runner : crew.creature;
    const alt = kind === "runner" ? N.shortName(station) : crew.creatureName;
    el.innerHTML =
      '<div class="shadow"></div>' +
      '<div class="halo" aria-hidden="true"></div>' +
      '<div class="sprite-wrap">' +
        '<img alt="' + escapeHtml(alt) + '" src="' + src + '" />' +
      "</div>" +
      '<div class="done-spark" aria-hidden="true"></div>';
    sceneEl().appendChild(el);
    return { id: el.dataset.id, stationId: station.id, kind: kind, el: el };
  }

  function renderOccluders() {
    const scene = sceneEl();
    N.OCCLUDERS.forEach((o) => {
      const img = document.createElement("img");
      img.className = "occluder";
      img.alt = "";
      img.src = o.file;
      img.style.left = (o.x / N.NATIVE_W) * 100 + "%";
      img.style.top = (o.y / N.NATIVE_H) * 100 + "%";
      img.style.width = (o.w / N.NATIVE_W) * 100 + "%";
      img.style.height = (o.h / N.NATIVE_H) * 100 + "%";
      img.style.zIndex = String(N.zFromY(o.sortY));
      scene.appendChild(img);
    });
  }

  function renderAmbient() {
    const host = document.getElementById("ambient");
    const spots = [
      { x: 36.4, y: 21.2 },
      { x: 57.8, y: 21.0 },
      { x: 75.6, y: 21.2 },
      { x: 24.8, y: 49.2 },
      { x: 61.6, y: 49.0 },
      { x: 88.6, y: 45.5 }
    ];
    spots.forEach((s, i) => {
      const d = document.createElement("i");
      d.className = "led";
      d.style.left = s.x + "%";
      d.style.top = s.y + "%";
      d.dataset.i = String(i);
      host.appendChild(d);
    });
  }

  function renderRoutes() {
    const svg = document.getElementById("routes");
    svg.innerHTML = "";
    N.ROUTES.forEach((r) => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", r.d);
      p.setAttribute("data-id", r.id);
      p.setAttribute("data-a", r.a);
      p.setAttribute("data-b", r.b);
      p.setAttribute("class", "kind-" + r.kind);
      svg.appendChild(p);
    });
  }

  function renderStations(stations) {
    const host = document.getElementById("stations");
    host.innerHTML = "";
    stations.forEach((s, idx) => {
      const sid = N.stationIdFor(s, idx);
      const spec = N.STATIONS[sid];
      const wrap = document.createElement("div");
      wrap.className = "station";
      wrap.dataset.id = sid;
      wrap.innerHTML =
        '<button type="button" class="station-hit" aria-label="Inspect ' + escapeHtml(N.shortName(s)) + '"></button>' +
        '<div class="monitor-fx">' +
          '<div class="scan"></div>' +
          '<div class="kbd"></div>' +
          '<div class="led-dot"></div>' +
          '<div class="glyph"></div>' +
          '<div class="doc">▤</div>' +
          '<div class="term"></div>' +
        "</div>" +
        '<div class="progress-strip"><i></i></div>' +
        '<div class="status-chip"><span class="chip-name"></span><span class="chip-ico"></span><span class="chip-label"></span></div>';
      const hit = wrap.querySelector(".station-hit");
      hit.style.left = spec.hit.x + "%";
      hit.style.top = spec.hit.y + "%";
      hit.style.width = spec.hit.w + "%";
      hit.style.height = spec.hit.h + "%";
      const mon = wrap.querySelector(".monitor-fx");
      mon.style.left = spec.monitor.x + "%";
      mon.style.top = spec.monitor.y + "%";
      mon.style.width = spec.monitor.w + "%";
      mon.style.height = spec.monitor.h + "%";
      const strip = wrap.querySelector(".progress-strip");
      strip.style.left = spec.strip.x + "%";
      strip.style.top = spec.strip.y + "%";
      strip.style.width = spec.strip.w + "%";
      const chip = wrap.querySelector(".status-chip");
      chip.style.left = spec.chip.x + "%";
      chip.style.top = spec.chip.y + "%";
      hit.addEventListener("click", () => selectAgent(sid));
      host.appendChild(wrap);
      paintStation(sid);
    });
  }

  function paintStation(id) {
    const wrap = document.querySelector('.station[data-id="' + id + '"]');
    const s = displayStation(id);
    if (!wrap || !s) return;
    const st = N.deriveAgentStatus(s);
    const meta = N.STATUS_META[st] || N.STATUS_META.idle;
    const keep = ["pulse-once", "flash-done", "flash-fail"].filter((c) => wrap.classList.contains(c));
    wrap.className = "station status-" + st;
    keep.forEach((c) => wrap.classList.add(c));
    wrap.classList.toggle("selected", hq.selected === id);
    wrap.querySelector(".chip-name").textContent = N.shortName(s);
    wrap.querySelector(".chip-ico").textContent = meta.glyph;
    wrap.querySelector(".chip-label").textContent = meta.label;
    wrap.querySelector(".progress-strip > i").style.width = Math.round(100 * (s.progress || 0)) + "%";
    const glyph = wrap.querySelector(".glyph");
    glyph.textContent = st === "running_tool" ? "≡" : st === "reading" ? "▤" : st === "thinking" ? "◇" : st === "needs_approval" ? "!" : "";
    wrap.querySelector(".term").textContent = st === "running_tool" ? "TL" : st === "working" ? "WRK" : st === "reading" ? "RD" : "";
    const runner = hq.actors.get(id);
    const mascot = hq.actors.get("c-" + id);
    const live = st === "working" || st === "running_tool" || st === "reading" || st === "thinking";
    if (runner) runner.el.classList.toggle("is-live", live);
    if (mascot) mascot.el.classList.toggle("is-live", live);
  }

  function renderRoster(stations) {
    const roster = document.getElementById("roster");
    const key = stations.map((s) => s.id).join(",");
    if (roster.dataset.key === key && roster.children.length === stations.length) {
      stations.forEach((s, idx) => {
        const card = roster.children[idx];
        const crew = crewFor(s, idx);
        const st = N.deriveAgentStatus(s);
        const pct = Math.round(100 * (s.progress || 0));
        card.querySelector(".name").innerHTML = escapeHtml(N.shortName(s)) + ' <span style="opacity:.65;font-size:.78rem">+ ' + escapeHtml(crew.creatureName) + "</span>";
        card.querySelector(".role").textContent = (s.role || "") + " · " + (N.AGENT_META[s.id] ? N.AGENT_META[s.id].org : "") + " · " + crew.species;
        const pill = card.querySelector(".pill");
        pill.className = "pill pill-" + st;
        pill.textContent = (N.STATUS_META[st] || {}).label || st;
        card.querySelector(".task").textContent = s.task || "";
        card.querySelector(".stage").textContent = s.stage || "";
        const bar = card.querySelector(".bar > i");
        bar.style.width = pct + "%";
        bar.style.background = "linear-gradient(90deg," + (s.color || "#38bdf8") + ",#a78bfa)";
      });
      return;
    }
    roster.innerHTML = "";
    roster.dataset.key = key;
    stations.forEach((s, idx) => {
      const crew = crewFor(s, idx);
      const st = N.deriveAgentStatus(s);
      const pct = Math.round(100 * (s.progress || 0));
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        '<img src="' + crew.creature + '" alt="' + escapeHtml(crew.creatureName) + '" />' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;gap:8px;align-items:flex-start">' +
            '<div>' +
              '<div class="name">' + escapeHtml(N.shortName(s)) + ' <span style="opacity:.65;font-size:.78rem">+ ' + escapeHtml(crew.creatureName) + "</span></div>" +
              '<div class="role">' + escapeHtml(s.role || "") + " · " + escapeHtml((N.AGENT_META[s.id] || {}).org || "") + " · " + escapeHtml(crew.species) + "</div>" +
            "</div>" +
            '<div class="pill pill-' + st + '">' + escapeHtml((N.STATUS_META[st] || {}).label || st) + "</div>" +
          "</div>" +
          '<div class="task">' + escapeHtml(s.task || "") + "</div>" +
          '<div class="stage">' + escapeHtml(s.stage || "") + "</div>" +
          '<div class="bar"><i style="width:' + pct + "%;background:linear-gradient(90deg," + (s.color || "#38bdf8") + ",#a78bfa)" + '"></i></div>' +
        "</div>";
      roster.appendChild(card);
    });
  }

  function renderCmdbar(stations, updatedAt) {
    const m = N.commandMetrics(stations, updatedAt);
    document.getElementById("m-active").textContent = m.active + " / " + m.total;
    document.getElementById("m-queued").textContent = String(m.queued);
    document.getElementById("m-done").textContent = String(m.completed);
    const blocked = document.getElementById("m-blocked");
    blocked.textContent = String(m.blocked);
    blocked.className = "v" + (m.blocked ? " tone-red" : "");
    document.getElementById("m-usage").textContent = m.used.toFixed(1) + " / " + m.cap.toFixed(1);
    document.getElementById("m-sync").textContent = fmtSync(m.updatedAt);
    const health = document.getElementById("m-health");
    health.textContent = m.health;
    health.className = "v tone-" + m.healthTone;
    document.getElementById("live-label").textContent = hq.hidden ? "PAUSED" : "LIVE";
  }

  function renderNeeds(stations) {
    const host = document.getElementById("needs");
    const items = N.needsYouItems(stations);
    if (!items.length) {
      host.innerHTML = '<li class="empty-note">Clear — no approvals, blockers, or failed jobs.</li>';
      return;
    }
    host.innerHTML = items.map((it) => {
      const tone = it.kind === "failed" || it.kind === "blocked" ? "tone-red" : "tone-amber";
      return '<li data-agent="' + escapeHtml(it.agent) + '">' +
        '<div class="need-k ' + tone + '">' + escapeHtml(it.kind) + " · " + escapeHtml(it.name) + "</div>" +
        '<div class="need-title">' + escapeHtml(it.title) + "</div>" +
        '<div class="need-reason">' + escapeHtml(it.reason) + "</div>" +
      "</li>";
    }).join("");
    host.querySelectorAll("li[data-agent]").forEach((li) => {
      li.style.cursor = "pointer";
      li.addEventListener("click", () => selectAgent(li.getAttribute("data-agent")));
    });
  }

  function currentStations() {
    return N.DESK_INDEX.map((id) => displayStation(id)).filter(Boolean);
  }

  function renderFlow() {
    const host = document.getElementById("flow");
    const stations = currentStations();
    const groups = {};
    N.WORKFLOW.forEach((p) => (groups[p] = []));
    stations.forEach((s) => {
      const t = N.ticketFrom(s);
      t.elapsed = fmtElapsed(Date.now() - (hq.seenSince[s.id] || Date.now()));
      groups[t.phase].push(t);
    });
    host.innerHTML = N.WORKFLOW.map((phase) => {
      const tickets = groups[phase] || [];
      const body = tickets.length
        ? tickets.map((t) =>
          '<article class="ticket">' +
            '<div class="t-title">' + escapeHtml(t.title) + "</div>" +
            '<div class="ticket-meta">' +
              "<span>" + escapeHtml(t.agent) + "</span>" +
              "<span>" + escapeHtml(t.glyph + " " + t.stateLabel) + "</span>" +
              '<span class="t-elapsed" data-agent="' + escapeHtml(t.agentId) + '">' + escapeHtml(t.elapsed) + "</span>" +
              "<span>" + escapeHtml(t.priority) + "</span>" +
            "</div>" +
            '<div class="ticket-meta">Last: ' + escapeHtml(t.lastAction) + "</div>" +
            '<div class="t-bar"><i style="width:' + t.progress + '%"></i></div>' +
          "</article>"
        ).join("")
        : '<div class="empty-note">—</div>';
      return "<div class=\"col\"><h3>" + phase + "</h3>" + body + "</div>";
    }).join("");
  }

  function pushActivity(entry, opts) {
    const silent = opts && opts.silent;
    hq.activity.unshift(entry);
    if (hq.activity.length > ACTIVITY_CAP) hq.activity.length = ACTIVITY_CAP;
    const host = document.getElementById("activity");
    const li = document.createElement("li");
    if (!silent && !reduceMotion()) li.className = "enter";
    const t = entry.t ? fmtSync(entry.t) : fmtSync(new Date().toISOString());
    li.innerHTML =
      '<div class="act-time">' + escapeHtml(t) + (entry.demo ? '<span class="act-demo">Demo</span>' : "") + "</div>" +
      '<div class="act-body"><b>' + escapeHtml(entry.agentName || entry.agent || "floor") + "</b> " +
      escapeHtml(entry.action) +
      (entry.task ? " · " + escapeHtml(entry.task) : "") +
      (entry.result ? " → " + escapeHtml(entry.result) : "") +
      "</div>";
    host.insertBefore(li, host.firstChild);
    while (host.children.length > ACTIVITY_CAP) host.removeChild(host.lastChild);
    if (!silent) {
      setTimeout(() => li.classList.remove("enter"), 220);
    }
  }

  function highlightRoutesFor(id) {
    document.querySelectorAll("#routes path").forEach((p) => {
      const a = p.getAttribute("data-a");
      const b = p.getAttribute("data-b");
      const on = id && (a === id || b === id);
      p.classList.toggle("selected", !!on);
    });
  }

  function flashRoute(id, on) {
    const p = document.querySelector('#routes path[data-id="' + id + '"]');
    if (p) p.classList.toggle("hot", !!on);
  }

  function enqueuePacket(from, to, kind) {
    if (!from || !to || from === to) return;
    if (reduceMotion() || hq.hidden) {
      const found = N.findRoute(from, to);
      if (found) {
        flashRoute(found.route.id, true);
        setTimeout(() => flashRoute(found.route.id, false), 400);
      }
      return;
    }
    hq.packetQ.push({ from: from, to: to, kind: kind || "assigned" });
    pumpPackets();
  }

  function pumpPackets() {
    while (hq.packets < PACKET_MAX && hq.packetQ.length) {
      const job = hq.packetQ.shift();
      flyPacket(job);
    }
  }

  function flyPacket(job) {
    const found = N.findRoute(job.from, job.to);
    if (!found) return;
    const path = document.querySelector('#routes path[data-id="' + found.route.id + '"]');
    if (!path) return;
    hq.packets += 1;
    flashRoute(found.route.id, true);
    const svg = document.getElementById("routes");
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    let len = 0;
    try {
      len = path.getTotalLength();
    } catch (e) {
      hq.packets -= 1;
      flashRoute(found.route.id, false);
      pumpPackets();
      return;
    }
    const dur = N.clamp(0.5 + len / 90, 0.5, 1.2);
    dot.setAttribute("r", "0.85");
    dot.setAttribute("class", "packet " + job.kind);
    svg.appendChild(dot);
    const t0 = performance.now();
    function finish() {
      if (dot.parentNode) dot.remove();
      flashRoute(found.route.id, false);
      hq.packets -= 1;
      const dest = document.querySelector('.station[data-id="' + job.to + '"] .monitor-fx');
      if (dest) {
        dest.style.boxShadow = "0 0 12px rgba(103,232,249,.45)";
        setTimeout(() => { dest.style.boxShadow = ""; }, 420);
      }
      pumpPackets();
    }
    function step(now) {
      if (!path.getAttribute("d")) {
        finish();
        return;
      }
      const u = Math.min(1, (now - t0) / (dur * 1000));
      const s = found.reverse ? 1 - u : u;
      const pt = path.getPointAtLength(s * len);
      dot.setAttribute("cx", String(pt.x));
      dot.setAttribute("cy", String(pt.y));
      if (u < 1) {
        requestAnimationFrame(step);
        return;
      }
      finish();
    }
    requestAnimationFrame(step);
  }

  function playSpark(id, kind) {
    const runner = hq.actors.get(id);
    if (runner) {
      const spark = runner.el.querySelector(".done-spark");
      if (spark && kind === "completed" && !reduceMotion()) {
        spark.classList.remove("play");
        void spark.offsetWidth;
        spark.classList.add("play");
        setTimeout(() => spark.classList.remove("play"), 520);
      }
    }
    const wrap = document.querySelector('.station[data-id="' + id + '"]');
    if (!wrap) return;
    wrap.classList.remove("flash-done", "flash-fail", "pulse-once");
    if (kind === "completed") wrap.classList.add("flash-done");
    if (kind === "failed") wrap.classList.add("flash-fail");
    if (kind === "approval") wrap.classList.add("pulse-once");
    setTimeout(() => wrap.classList.remove("flash-done", "flash-fail", "pulse-once"), 900);
  }

  function applyEvent(ev, demo) {
    if (!ev) return;
    const agent = stationById(ev.agent) || { id: ev.agent, character: ev.agent };
    pushActivity({
      t: new Date().toISOString(),
      agent: ev.agent,
      agentName: N.shortName(agent),
      action: actionVerb(ev.type),
      task: ev.task || "",
      result: ev.result || "",
      demo: !!demo
    });
    if (ev.type === "assigned" || ev.type === "handoff" || ev.type === "tool_started") {
      enqueuePacket(ev.from, ev.to, ev.type);
    }
    if (ev.type === "completed" || ev.type === "failed" || ev.type === "approval") {
      playSpark(ev.agent || ev.to, ev.type);
    }
    if (demo) {
      const id = ev.agent || ev.to;
      if (id) {
        const map = {
          assigned: { state: "working", task: ev.task, stage: "Assigned", progress: 0.12 },
          started: { state: "working", task: ev.task, stage: "Working", progress: 0.35 },
          tool_started: { state: "working", task: ev.task, stage: "running tool: probe", progress: 0.48, activity: "tool:probe" },
          handoff: { state: "working", task: ev.task, stage: "Working", progress: 0.4 },
          approval: { state: "working", task: ev.task, stage: "Awaiting approval", progress: 0.86 },
          completed: { state: "done", task: ev.task, stage: "DONE", progress: 1 },
          blocked: { state: "blocked", task: ev.task, stage: ev.result || "Blocked", progress: 0.4 },
          failed: { state: "failed", task: ev.task, stage: ev.result || "Failed", progress: 0.4 }
        };
        hq.overlay[id] = Object.assign({}, displayStation(id) || { id: id }, map[ev.type] || {});
        paintStation(id);
      }
    }
    renderNeeds(currentStations());
    renderFlow();
    renderCmdbar(currentStations(), hq.lastPayload && hq.lastPayload.updated_at_utc);
    if (hq.selected) fillDrawer(hq.selected);
  }

  function selectAgent(id) {
    if (hq.selected === id) {
      hq.selected = null;
    } else {
      hq.selected = id;
    }
    document.querySelectorAll(".station").forEach((el) => {
      el.classList.toggle("selected", el.dataset.id === hq.selected);
    });
    highlightRoutesFor(hq.selected);
    const drawer = document.getElementById("drawer");
    if (!hq.selected) {
      drawer.hidden = true;
      drawer.classList.remove("open");
      return;
    }
    drawer.hidden = false;
    drawer.classList.add("open");
    fillDrawer(hq.selected);
  }

  function fillDrawer(id) {
    const s = displayStation(id);
    if (!s) return;
    const idx = N.DESK_INDEX.indexOf(id);
    const crew = crewFor(s, idx < 0 ? 0 : idx);
    const st = N.deriveAgentStatus(s);
    const meta = N.STATUS_META[st] || N.STATUS_META.idle;
    const org = N.AGENT_META[id] || {};
    const usage = N.usageFor(s);
    document.getElementById("d-name").textContent = N.shortName(s);
    document.getElementById("d-org").textContent = (org.org || s.role || "") + " · " + (org.specialty || "");
    document.getElementById("d-state").textContent = meta.glyph + " " + meta.label;
    document.getElementById("d-task").textContent = s.task || "—";
    document.getElementById("d-elapsed").textContent = fmtElapsed(Date.now() - (hq.seenSince[id] || Date.now()));
    document.getElementById("d-progress").textContent = Math.round(100 * (s.progress || 0)) + "%";
    document.getElementById("d-action").textContent = s.stage || s.activity || "—";
    document.getElementById("d-usage").textContent = usage.used.toFixed(1) + " / " + usage.cap.toFixed(1);
    document.getElementById("d-block").textContent = st === "blocked" || st === "failed" ? (s.stage || st) : "—";
    const img = document.getElementById("d-mascot");
    img.src = crew.creature;
    img.alt = crew.creatureName;
    document.getElementById("d-mascot-name").textContent = crew.creatureName;
    document.getElementById("d-species").textContent = crew.species;
    const evHost = document.getElementById("d-events");
    const mine = hq.activity.filter((a) => a.agent === id).slice(0, 6);
    evHost.innerHTML = mine.length
      ? mine.map((a) => "<li>" + escapeHtml((a.action || "") + (a.task ? " · " + a.task : "") + (a.result ? " → " + a.result : "")) + "</li>").join("")
      : "<li>No recent events.</li>";
  }

  function spawn(stations) {
    renderOccluders();
    renderAmbient();
    renderRoutes();
    stations.forEach((s, i) => {
      const runner = makeActor("runner", s, i);
      const critter = makeActor("critter", s, i);
      hq.actors.set(runner.id, runner);
      hq.actors.set(critter.id, critter);
      hq.seenSince[s.id] = Date.now();
    });
    renderStations(stations);
    hq.spawned = true;
  }

  function seedTicker(data) {
    (data.ticker || []).slice(0, 4).forEach((line) => {
      pushActivity({
        t: data.updated_at_utc,
        agent: "floor",
        agentName: "Floor",
        action: line,
        task: "",
        result: "",
        demo: false
      }, { silent: true });
    });
  }

  function startDemo() {
    if (reduceMotion()) {
      DEMO_BEATS.forEach((beat) => {
        pushActivity({
          t: new Date().toISOString(),
          agent: beat.agent,
          agentName: N.shortName(stationById(beat.agent) || { id: beat.agent }),
          action: actionVerb(beat.type),
          task: beat.task,
          result: beat.result,
          demo: true
        }, { silent: true });
      });
      return;
    }
    hq.demo = true;
    document.getElementById("demo-tag").classList.add("on");
    let i = 0;
    function next() {
      if (i >= DEMO_BEATS.length) {
        hq.overlay = {};
        hq.demo = false;
        document.getElementById("demo-tag").classList.remove("on");
        const data = hq.lastPayload;
        const live = ((data && data.stations) || []).slice().sort((a, b) => (a.desk ?? 9) - (b.desk ?? 9));
        const events = N.diffEvents(hq.lastStations, live);
        hq.lastStations = live.map((s) => Object.assign({}, s));
        live.forEach((s) => paintStation(s.id));
        renderNeeds(live);
        renderFlow();
        renderCmdbar(live, data && data.updated_at_utc);
        renderRoster(live);
        events.forEach((ev) => applyEvent(ev, false));
        if (hq.selected) fillDrawer(hq.selected);
        return;
      }
      const beat = DEMO_BEATS[i++];
      hq.demoTimer = setTimeout(() => {
        applyEvent(beat, true);
        next();
      }, beat.wait);
    }
    next();
  }

  function ingest(data, fromPoll) {
    const stations = (data.stations || []).slice().sort((a, b) => (a.desk ?? 9) - (b.desk ?? 9));
    if (!hq.spawned) {
      hq.lastPayload = data;
      hq.lastStations = stations.map((s) => Object.assign({}, s));
      spawn(stations);
      stations.forEach((s) => paintStation(s.id));
      renderRoster(stations);
      renderCmdbar(stations, data.updated_at_utc);
      renderNeeds(stations);
      renderFlow();
      seedTicker(data);
      startDemo();
      return;
    }
    if (hq.demo) {
      hq.lastPayload = data;
      return;
    }
    renderRoster(stations);
    renderCmdbar(stations, data.updated_at_utc);
    if (fromPoll && N.stationsEqual(hq.lastStations, stations)) {
      const sameDetail = (hq.lastStations || []).every((p, i) => {
        const s = stations[i];
        return s && (p.stage || "") === (s.stage || "") && (p.progress || 0) === (s.progress || 0);
      });
      hq.lastPayload = data;
      renderCmdbar(stations, data.updated_at_utc);
      if (sameDetail) return;
      stations.forEach((s) => paintStation(s.id));
      hq.lastStations = stations.map((s) => Object.assign({}, s));
      renderNeeds(stations);
      renderFlow();
      return;
    }
    const events = N.diffEvents(hq.lastStations, stations);
    stations.forEach((s) => {
      const prev = (hq.lastStations || []).find((x) => x.id === s.id);
      if (!prev || prev.state !== s.state || prev.task !== s.task) hq.seenSince[s.id] = Date.now();
    });
    hq.lastPayload = data;
    hq.lastStations = stations.map((s) => Object.assign({}, s));
    stations.forEach((s) => paintStation(s.id));
    renderNeeds(stations);
    renderFlow();
    events.forEach((ev) => applyEvent(ev, false));
    if (hq.selected) fillDrawer(hq.selected);
  }

  function stepAmbient() {
    if (hq.hidden) return;
    hq.ambientClock += 1;
    const leds = document.querySelectorAll(".led");
    if (!leds.length) return;
    const active = Math.floor(hq.ambientClock / 4) % leds.length;
    const second = (active + 3) % leds.length;
    leds.forEach((el, i) => {
      el.classList.toggle("on", i === active || i === second);
    });
  }

  async function load() {
    try {
      const data = await (await fetch("status.json?ts=" + Date.now())).json();
      ingest(data, true);
    } catch (e) {
      const host = document.getElementById("activity");
      if (host && !host.dataset.err) {
        host.dataset.err = "1";
        pushActivity({ agent: "floor", agentName: "Floor", action: "Could not load status.json", demo: false });
      }
    }
  }

  document.getElementById("d-close").addEventListener("click", () => selectAgent(null));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && hq.selected) selectAgent(null);
  });

  document.addEventListener("visibilitychange", () => {
    hq.hidden = document.hidden;
    const ambient = document.getElementById("ambient");
    const stage = stageEl();
    if (ambient) ambient.classList.toggle("paused", hq.hidden);
    if (stage) stage.classList.toggle("paused", hq.hidden);
    document.getElementById("live-label").textContent = hq.hidden ? "PAUSED" : "LIVE";
  });

  setInterval(() => {
    if (hq.selected) {
      document.getElementById("d-elapsed").textContent = fmtElapsed(Date.now() - (hq.seenSince[hq.selected] || Date.now()));
    }
    document.querySelectorAll(".t-elapsed").forEach((el) => {
      const id = el.getAttribute("data-agent");
      el.textContent = fmtElapsed(Date.now() - (hq.seenSince[id] || Date.now()));
    });
  }, 1000);

  hq.ambientTimer = setInterval(stepAmbient, 900);

  window.OfficeHQ = {
    ingest: function (data) { ingest(data, false); },
    select: selectAgent,
    applyEvent: function (ev) { applyEvent(ev, false); },
    actors: hq.actors,
    nav: N,
    _state: hq
  };

  load();
  setInterval(load, 3000);
})();
