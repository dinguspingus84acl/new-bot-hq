/* New Bot HQ — event-driven office simulation.
   Polls status.json every 3s for cards/ticker; movement only on semantic change. */
(function () {
  const N = window.OfficeNav;
  if (!N) throw new Error("OfficeNav missing");

  const CREATURES = {
    voltbug: { file: "assets/creatures/voltbug.png", name: "Voltbug", species: "spark beetle", idle: "spark" },
    foldfox: { file: "assets/creatures/foldfox.png", name: "Foldfox", species: "origami fox", idle: "flick" },
    scanslime: { file: "assets/creatures/scanslime.png", name: "Scanslime", species: "lens slime", idle: "hover" },
    archivowl: { file: "assets/creatures/archivowl.png", name: "Archivowl", species: "archive owl", idle: "blink" },
    bunbot: { file: "assets/creatures/bunbot.png", name: "Bunbot", species: "bunny-bot", idle: "twitch" }
  };
  const RUNNER_VER = "sheet2";
  const RUNNERS = {
    deep: "assets/runners/mira.png?" + RUNNER_VER,
    cluster: "assets/runners/kai.png?" + RUNNER_VER,
    watch: "assets/runners/oak.png?" + RUNNER_VER,
    lab: "assets/runners/rex.png?" + RUNNER_VER,
    coord: "assets/runners/newbot.png?" + RUNNER_VER
  };
  const DEFAULT_CREATURE = {
    deep: "scanslime",
    cluster: "foldfox",
    watch: "voltbug",
    lab: "archivowl",
    coord: "bunbot"
  };
  const FALLBACK_IDS = ["mira", "kai", "oak", "rex", "newbot"];

  const STATES = {
    IDLE: "IDLE",
    PREPARE: "PREPARE_TO_MOVE",
    WALK: "WALK",
    ARRIVE: "ARRIVE",
    WORK: "WORK",
    TALK: "TALK",
    DONE: "DONE"
  };

  const PREPARE_MS = 130;
  const ARRIVE_MS = 180;
  const BUBBLE_POP_MS = 190;
  const BUBBLE_HOLD = 4000;
  const FOLLOW_LAG_PX = 22;
  const FOLLOW_DELAY = 140;
  const SEPARATION_PX = 20;

  const stageEl = () => document.getElementById("stage");
  const sceneEl = () => document.getElementById("scene");

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function crewFor(station, idx) {
    const cid = station.creature_id || DEFAULT_CREATURE[station.id] || Object.keys(CREATURES)[idx % 5];
    const creature = CREATURES[cid] || CREATURES.bunbot;
    const runner = RUNNERS[station.id] || "assets/runners/" + FALLBACK_IDS[idx % FALLBACK_IDS.length] + ".png?" + RUNNER_VER;
    return {
      runner,
      creature: creature.file,
      creatureName: station.creature || creature.name,
      species: station.creature_species || creature.species,
      creatureId: cid,
      idle: creature.idle
    };
  }

  function stageSize() {
    const r = stageEl().getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  }

  function pctToStage(p, sz) {
    return { x: Math.round((p.x / 100) * sz.w), y: Math.round((p.y / 100) * sz.h) };
  }

  function zFromY(yPct) {
    return 40 + Math.round(yPct * 10);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bubbleLines(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    if (t.length <= 26) return [t];
    const cut = t.slice(0, 54);
    const mid = cut.lastIndexOf(" ", 28);
    if (mid > 10) return [cut.slice(0, mid), cut.slice(mid + 1)];
    return [cut.slice(0, 26), cut.slice(26)];
  }

  const sim = {
    actors: new Map(),
    lastStations: null,
    lastPayload: null,
    lastPollKey: null,
    lastT: 0,
    hidden: false,
    openingDone: false,
    destMarks: new Map(),
    ambientClock: 0,
    occupancy: new Map()
  };

  function makeActor(kind, station, idx, home) {
    const crew = crewFor(station, idx);
    const el = document.createElement("div");
    el.className = "actor " + kind;
    el.dataset.id = kind === "runner" ? station.id : "c-" + station.id;
    el.dataset.kind = kind;
    const src = kind === "runner" ? crew.runner : crew.creature;
    const alt = kind === "runner" ? station.character || "Agent" : crew.creatureName;
    el.innerHTML =
      '<div class="shadow"></div>' +
      '<div class="sprite-wrap">' +
        '<img alt="' + escapeHtml(alt) + '" src="' + src + '" />' +
      "</div>" +
      (kind === "runner" ? '<div class="label">' + escapeHtml(station.character || "Agent") + "</div>" : "") +
      '<div class="cue"></div>' +
      '<div class="done-spark" aria-hidden="true"></div>';
    if (kind === "critter") {
      el.dataset.creature = crew.creatureId;
      el.dataset.idle = crew.idle;
    }
    sceneEl().appendChild(el);
    const actor = {
      id: el.dataset.id,
      stationId: station.id,
      kind,
      el,
      sprite: el.querySelector(".sprite-wrap"),
      x: home.x,
      y: home.y,
      face: home.face || "right",
      heading: { x: home.face === "left" ? -1 : 1, y: 0 },
      mode: STATES.IDLE,
      path: null,
      plan: null,
      walkT: 0,
      walkS: 0,
      phaseT: 0,
      pending: null,
      after: null,
      bob: 0,
      vx: 0,
      vy: 0,
      followT: 0,
      foot: 0,
      idlePhase: Math.random() * 8,
      idleNext: 2.5 + Math.random() * 5,
      semantic: N.normalizeStation(station),
      label: station.character || "Agent"
    };
    applyPose(actor, true);
    return actor;
  }

  function applyPose(actor, instant) {
    const sz = stageSize();
    const p = pctToStage(actor, sz);
    actor.el.style.transform = "translate3d(" + p.x + "px," + p.y + "px,0) translate(-50%,-100%)";
    actor.el.style.zIndex = String(zFromY(actor.y));
    const flip = actor.face === "left" ? -1 : 1;
    const bob = Math.round(actor.bob);
    const foot = actor.foot ? (flip < 0 ? -1 : 1) : 0;
    actor.sprite.style.transform = "translate(" + foot + "px," + bob + "px) scaleX(" + flip + ")";
    if (instant) actor.el.style.transition = "none";
  }

  function setMode(actor, mode) {
    actor.mode = mode;
    actor.el.classList.remove("is-idle", "is-work", "is-walk", "is-talk", "is-done", "is-blocked", "is-prepare");
    const map = {
      IDLE: "is-idle",
      WORK: "is-work",
      WALK: "is-walk",
      TALK: "is-talk",
      DONE: "is-done",
      PREPARE_TO_MOVE: "is-prepare"
    };
    if (map[mode]) actor.el.classList.add(map[mode]);
  }

  function restMode(state) {
    if (state === "working") return STATES.WORK;
    if (state === "done") return STATES.IDLE;
    if (state === "blocked") return STATES.IDLE;
    return STATES.IDLE;
  }

  function cueFor(actor, state) {
    actor.el.classList.remove("cue-work", "cue-done", "cue-idle", "cue-blocked");
    if (state === "working") actor.el.classList.add("cue-work");
    else if (state === "blocked") actor.el.classList.add("cue-blocked");
    else if (state === "done") actor.el.classList.add("cue-idle");
    else actor.el.classList.add("cue-idle");
  }

  function hideBubble(id) {
    const b = document.getElementById("speech-" + id);
    if (!b) return;
    b.classList.remove("show");
    b.style.opacity = "";
    clearTimeout(b._hide);
  }

  function placeBubble(id) {
    const b = document.getElementById("speech-" + id);
    const actor = sim.actors.get(id);
    if (!b || !actor) return;
    const sz = stageSize();
    const foot = pctToStage(actor, sz);
    const h = actor.el.offsetHeight || (actor.kind === "runner" ? 118 : 58);
    const bw = b.offsetWidth || 140;
    const bh = b.offsetHeight || 40;
    let x = foot.x;
    let y = foot.y - h + 12;
    let side = "above";
    if (y - bh < 8) {
      y = foot.y + 16;
      side = "below";
    }
    if (x + bw / 2 > sz.w - 10) {
      x = foot.x - 36;
      side = "left";
    } else if (x - bw / 2 < 10) {
      x = foot.x + 36;
      side = "right";
    }
    x = N.clamp(x, 10 + bw / 2, sz.w - 10 - bw / 2);
    y = N.clamp(y, 12, sz.h - 8);
    const others = document.querySelectorAll(".speech.show");
    others.forEach((o) => {
      if (o === b) return;
      const ox = parseFloat(o.dataset.x || "0");
      if (Math.abs(ox - x) < 90) x = N.clamp(x + (x < ox ? -64 : 64), 16 + bw / 2, sz.w - 16 - bw / 2);
    });
    b.dataset.x = String(x);
    b.style.zIndex = String(zFromY(actor.y) + 8);
    const scale = b.classList.contains("show") ? 1 : 0.88;
    b.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0) translate(-50%,-100%) scale(" + scale + ")";
    b.dataset.side = side;
  }

  function showBubble(id, text, persist) {
    let b = document.getElementById("speech-" + id);
    if (!b) {
      b = document.createElement("div");
      b.className = "speech";
      b.id = "speech-" + id;
      b.innerHTML = '<span class="speech-text"></span>';
      sceneEl().appendChild(b);
    }
    const lines = bubbleLines(text);
    const next = lines.join("\n");
    const hold = b.querySelector(".speech-text");
    if (hold.textContent !== next) {
      hold.classList.add("crossfade");
      hold.innerHTML = lines.map((ln) => "<span>" + escapeHtml(ln) + "</span>").join("");
      requestAnimationFrame(() => hold.classList.remove("crossfade"));
    }
    placeBubble(id);
    requestAnimationFrame(() => {
      b.classList.add("show");
      placeBubble(id);
    });
    clearTimeout(b._hide);
    if (!persist) {
      b._hide = setTimeout(() => hideBubble(id), BUBBLE_HOLD);
    }
  }

  function markDest(id, pt, on) {
    let el = sim.destMarks.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = "dest-mark";
      sceneEl().appendChild(el);
      sim.destMarks.set(id, el);
    }
    if (!on || !pt) {
      el.classList.remove("show");
      return;
    }
    const sz = stageSize();
    const p = pctToStage(pt, sz);
    el.style.transform = "translate3d(" + p.x + "px," + p.y + "px,0) translate(-50%,-50%)";
    el.style.zIndex = String(zFromY(pt.y) - 2);
    el.classList.add("show");
  }

  function occupy(nodeId, who) {
    if (!nodeId) return;
    sim.occupancy.set(nodeId, who);
  }

  function vacate(who) {
    sim.occupancy.forEach((v, k) => {
      if (v === who) sim.occupancy.delete(k);
    });
  }

  function destTaken(nodeId, who) {
    const owner = sim.occupancy.get(nodeId);
    return owner && owner !== who;
  }

  function resolveDest(station, actor) {
    const requested = N.destIdFor(station);
    if (!destTaken(requested, actor.id)) return requested;
    if (requested === "report") {
      for (let i = 0; i < 3; i++) {
        const alt = N.reportSlot(i);
        if (!destTaken(alt, actor.id)) return alt;
      }
    }
    const spec = N.STATIONS[N.stationIdFor(station)] || N.STATIONS.coord;
    const seat = N.NODES[spec.seat];
    return { x: seat.x + spec.overflow.dx, y: seat.y + spec.overflow.dy, virtual: true };
  }

  function buildRoute(from, dest) {
    if (dest && dest.virtual) {
      return N.chamfer([{ x: from.x, y: from.y, id: "_cur" }, dest]);
    }
    return N.chamfer(N.pathFromPoint(from, dest));
  }

  function enqueueMove(actor, dest, after, delay) {
    actor.pending = { dest, after: after || null, at: performance.now() + (delay || 0) };
  }

  function beginPrepare(actor, dest, after) {
    if (reduceMotion()) {
      const route = buildRoute(actor, dest);
      const end = route[route.length - 1];
      crossfadeTo(actor, end, after);
      return;
    }
    hideBubble(actor.stationId);
    hideBubble(actor.id);
    markDest(actor.id, typeof dest === "string" ? N.NODES[dest] : dest, actor.kind === "runner");
    const route = buildRoute(actor, dest);
    if (route.length < 2 || N.polyLen(route) < 4) {
      finishArrive(actor, after);
      return;
    }
    const first = route[1] || route[0];
    actor.face = N.faceFromHeading(N.heading(actor, first), actor.face);
    actor.path = route;
    actor.plan = N.travelPlan(N.polyLen(route));
    actor.walkT = 0;
    actor.walkS = 0;
    actor.phaseT = 0;
    actor.after = after;
    setMode(actor, STATES.PREPARE);
    applyPose(actor);
  }

  function crossfadeTo(actor, end, after) {
    actor.el.style.transition = "opacity 160ms linear";
    actor.el.style.opacity = "0";
    setTimeout(() => {
      actor.x = end.x;
      actor.y = end.y;
      if (end.face) actor.face = end.face;
      applyPose(actor, true);
      actor.el.style.opacity = "1";
      setTimeout(() => {
        actor.el.style.transition = "none";
        finishArrive(actor, after);
      }, 160);
    }, 160);
  }

  function finishArrive(actor, after) {
    const dest = after && after.face ? after : actor.path && actor.path[actor.path.length - 1];
    if (dest && dest.face) actor.face = dest.face;
    else if (after && after.look) actor.face = after.look;
    actor.bob = 0;
    setMode(actor, STATES.ARRIVE);
    actor.phaseT = 0;
    actor.after = after || actor.after;
    markDest(actor.id, null, false);
    applyPose(actor);
  }

  function settleAfter(actor) {
    const after = actor.after || {};
    const state = after.state || "idle";
    cueFor(actor, state);
    if (after.talk && actor.kind === "runner") {
      setMode(actor, STATES.TALK);
      actor.phaseT = 0;
      setTimeout(() => showBubble(actor.stationId, after.talk, false), BUBBLE_POP_MS);
      setTimeout(() => {
        if (actor.mode === STATES.TALK) {
          setMode(actor, restMode(state));
        }
        if (after.thenHome && actor.kind === "runner") {
          startPair(actor.stationId, actor.stationId, {
            state: state,
            look: (N.STATIONS[actor.stationId] || {}).face
          }, 80);
        }
      }, 1100);
      return;
    }
    if (after.thenHome && actor.kind === "runner") {
      startPair(actor.stationId, actor.stationId, {
        state: state,
        look: (N.STATIONS[actor.stationId] || {}).face
      }, 80);
      return;
    }
    if (state === "done" && after.celebrate && actor.kind === "runner") {
      playDone(actor);
      return;
    }
    if (state === "working") setMode(actor, STATES.WORK);
    else setMode(actor, STATES.IDLE);
    actor.path = null;
    actor.plan = null;
  }

  function playDone(actor) {
    setMode(actor, STATES.DONE);
    actor.el.classList.add("flash-done");
    const spark = actor.el.querySelector(".done-spark");
    spark.classList.add("play");
    setTimeout(() => {
      spark.classList.remove("play");
      actor.el.classList.remove("flash-done");
      setMode(actor, STATES.IDLE);
      cueFor(actor, "done");
    }, 520);
  }

  function mascotOf(stationId) {
    return sim.actors.get("c-" + stationId);
  }

  function runnerOf(stationId) {
    return sim.actors.get(stationId);
  }

  function startPair(stationId, dest, after, delay) {
    const runner = runnerOf(stationId);
    const mascot = mascotOf(stationId);
    if (!runner) return;
    vacate(runner.id);
    if (mascot) vacate(mascot.id);
    enqueueMove(runner, dest, after, delay);
    if (mascot) {
      const spec = N.STATIONS[stationId];
      let slotDest = dest;
      if (typeof dest === "string" && spec && dest === spec.seat) {
        slotDest = N.companionPoint(stationId, destTaken(stationId + ":c", mascot.id));
      } else if (dest === "report") {
        slotDest = "report_b";
      }
      const mAfter = { state: after && after.state, look: after && after.look };
      enqueueMove(mascot, slotDest, mAfter, (delay || 0) + FOLLOW_DELAY);
      mascot.followT = 0;
    }
    if (typeof dest === "string") occupy(dest, runner.id);
  }

  function homeFor(station, idx, kind) {
    const sid = N.stationIdFor(station, idx);
    const spec = N.STATIONS[sid];
    const seat = N.NODES[spec.seat];
    if (kind === "critter") {
      return { x: seat.x + spec.companion.dx, y: seat.y + spec.companion.dy, face: spec.face };
    }
    return { x: seat.x, y: seat.y, face: spec.face };
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
      img.style.zIndex = String(zFromY(o.sortY));
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
    const dust = document.createElement("div");
    dust.className = "dust";
    host.appendChild(dust);
  }

  function renderRoster(stations) {
    const roster = document.getElementById("roster");
    const key = stations.map((s) => s.id).join(",");
    if (roster.dataset.key === key && roster.children.length === stations.length) {
      stations.forEach((s, idx) => {
        const card = roster.children[idx];
        const crew = crewFor(s, idx);
        const pct = Math.round(100 * (s.progress || 0));
        card.querySelector(".name").innerHTML = escapeHtml(s.character || "Agent") + ' <span style="opacity:.65;font-size:.78rem">+ ' + escapeHtml(crew.creatureName) + "</span>";
        card.querySelector(".role").textContent = (s.role || "") + " · " + crew.species;
        const pill = card.querySelector(".pill");
        pill.className = "pill pill-" + (s.state || "idle");
        pill.textContent = s.state || "idle";
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
      const pct = Math.round(100 * (s.progress || 0));
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        '<img src="' + crew.creature + '" alt="' + escapeHtml(crew.creatureName) + '" />' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;gap:8px;align-items:flex-start">' +
            '<div>' +
              '<div class="name">' + escapeHtml(s.character || "Agent") + ' <span style="opacity:.65;font-size:.78rem">+ ' + escapeHtml(crew.creatureName) + "</span></div>" +
              '<div class="role">' + escapeHtml(s.role || "") + " · " + escapeHtml(crew.species) + "</div>" +
            "</div>" +
            '<div class="pill pill-' + (s.state || "idle") + '">' + escapeHtml(s.state || "idle") + "</div>" +
          "</div>" +
          '<div class="task">' + escapeHtml(s.task || "") + "</div>" +
          '<div class="stage">' + escapeHtml(s.stage || "") + "</div>" +
          '<div class="bar"><i style="width:' + pct + "%;background:linear-gradient(90deg," + (s.color || "#38bdf8") + ",#a78bfa)" + '"></i></div>' +
        "</div>";
      roster.appendChild(card);
    });
  }

  function spawn(stations) {
    renderOccluders();
    renderAmbient();
    stations.forEach((s, i) => {
      const runner = makeActor("runner", s, i, homeFor(s, i, "runner"));
      const critter = makeActor("critter", s, i, homeFor(s, i, "critter"));
      sim.actors.set(runner.id, runner);
      sim.actors.set(critter.id, critter);
      occupy(N.stationIdFor(s, i), runner.id);
      const st = s.state || "idle";
      cueFor(runner, st);
      cueFor(critter, st);
      setMode(runner, restMode(st));
      setMode(critter, restMode(st));
      if (st === "done") {
        /* Already complete on first paint — calm idle, no looping celebration. */
      }
    });
    if (/[?&]nav=1/.test(location.search)) drawDebugNav();
  }

  function drawDebugNav() {
    const c = document.createElement("canvas");
    c.className = "nav-debug";
    sceneEl().appendChild(c);
    const paint = () => {
      const sz = stageSize();
      c.width = sz.w;
      c.height = sz.h;
      const g = c.getContext("2d");
      g.clearRect(0, 0, sz.w, sz.h);
      g.strokeStyle = "rgba(125,211,252,.35)";
      N.EDGES.forEach(([a, b]) => {
        const pa = pctToStage(N.NODES[a], sz);
        const pb = pctToStage(N.NODES[b], sz);
        g.beginPath();
        g.moveTo(pa.x, pa.y);
        g.lineTo(pb.x, pb.y);
        g.stroke();
      });
      Object.keys(N.NODES).forEach((id) => {
        const p = pctToStage(N.NODES[id], sz);
        g.fillStyle = N.NODES[id].home ? "#4ade80" : "#7dd3fc";
        g.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
    };
    paint();
    window.addEventListener("resize", paint);
  }

  function applySemanticMoves(prev, next) {
    const changed = [];
    next.forEach((s, i) => {
      const p = prev && prev.find((x) => x.id === s.id);
      if (p && N.semanticEqual(p, s)) return;
      changed.push({ s, i, p });
    });
    changed.forEach((item, n) => {
      const delay = changed.length > 1 ? N.rand(120, 350) + n * 40 : 0;
      const s = item.s;
      const dest = resolveDest(s, { id: s.id });
      const look = (N.STATIONS[N.stationIdFor(s)] || {}).face;
      const after = {
        state: s.state || "idle",
        look,
        talk: s.state === "working" ? s.stage || s.task : s.state === "blocked" ? s.stage || "Blocked" : "",
        celebrate: s.state === "done" && (!item.p || item.p.state !== "done")
      };
      const runner = runnerOf(s.id);
      if (!runner) return;
      const destPt = typeof dest === "string" ? N.NODES[dest] : dest;
      const already = destPt && N.dist(runner, destPt) < 8;
      if (already) {
        cueFor(runner, after.state);
        const m = mascotOf(s.id);
        if (m) cueFor(m, after.state);
        if (after.celebrate) playDone(runner);
        else if (after.talk) {
          setMode(runner, STATES.WORK);
          showBubble(s.id, after.talk, false);
        } else setMode(runner, restMode(after.state));
        return;
      }
      startPair(s.id, dest, after, delay);
    });
  }

  function maybeOpeningTour(stations) {
    if (sim.openingDone) return;
    sim.openingDone = true;
    const lead = stations.find((s) => s.id === "coord" && s.state === "working");
    if (!lead) return;
    setTimeout(() => {
      const runner = runnerOf("coord");
      if (!runner || runner.mode === STATES.WALK || runner.mode === STATES.PREPARE) return;
      startPair("coord", "report", {
        state: "working",
        look: "right",
        talk: lead.stage || "Coordinate + report",
        thenHome: true
      }, 0);
    }, 1600);
  }

  function ingest(data, fromPoll) {
    const stations = (data.stations || []).slice().sort((a, b) => (a.desk ?? 9) - (b.desk ?? 9));
    document.getElementById("updated").textContent = "updated " + (data.updated_at_utc || "?");
    renderRoster(stations);
    const lines = data.ticker || [];
    if (lines.length) {
      const i = Math.floor(Date.now() / 4000) % lines.length;
      document.getElementById("ticker").innerHTML = "<b>Floor</b> " + escapeHtml(lines[i]);
    }
    if (!sim.lastStations) {
      spawn(stations);
      sim.lastStations = stations.map((s) => Object.assign({}, s));
      maybeOpeningTour(stations);
      return;
    }
    if (fromPoll && N.stationsEqual(sim.lastStations, stations)) {
      /* Identical semantic state: cards already refreshed; do not retarget. */
      stations.forEach((s) => {
        const r = runnerOf(s.id);
        if (r) r.semantic = N.normalizeStation(s);
      });
      return;
    }
    applySemanticMoves(sim.lastStations, stations);
    sim.lastStations = stations.map((s) => Object.assign({}, s));
  }

  function stepActor(actor, dt, now) {
    if (actor.pending && now >= actor.pending.at) {
      const job = actor.pending;
      actor.pending = null;
      if (actor.mode === STATES.WALK || actor.mode === STATES.PREPARE) {
        actor.after = job.after;
        actor._retarget = job.dest;
      } else {
        beginPrepare(actor, job.dest, job.after);
      }
    }

    if (actor.mode === STATES.PREPARE) {
      actor.phaseT += dt;
      actor.bob = 0;
      if (actor.phaseT >= PREPARE_MS / 1000) {
        setMode(actor, STATES.WALK);
        actor.walkT = 0;
      }
      applyPose(actor);
      return;
    }

    if (actor.mode === STATES.WALK && actor.path && actor.plan) {
      if (actor._retarget && actor.path) {
        const here = N.pointAlong(actor.path, actor.walkS);
        const segEnd = actor.path[Math.min(here.seg + 1, actor.path.length - 1)];
        const remain = N.dist(here, segEnd);
        if (remain < 10) {
          const dest = actor._retarget;
          actor._retarget = null;
          beginPrepare(actor, dest, actor.after);
          return;
        }
      }
      actor.walkT += dt;
      const s = N.distanceAt(actor.plan, actor.walkT);
      actor.walkS = s;
      let pt = N.pointAlong(actor.path, s);
      if (actor.kind === "critter") {
        const runner = runnerOf(actor.stationId);
        if (runner && runner.path && (runner.mode === STATES.WALK || runner.mode === STATES.PREPARE)) {
          const lag = N.pointAlong(runner.path, Math.max(0, runner.walkS - FOLLOW_LAG_PX));
          const k = 18;
          const damp = 8;
          actor.vx += ((lag.x - actor.x) * k - actor.vx * damp) * dt;
          actor.vy += ((lag.y - actor.y) * k - actor.vy * damp) * dt;
          actor.x += actor.vx * dt;
          actor.y += actor.vy * dt;
          actor.heading = lag.heading || pt.heading;
          pt = { x: actor.x, y: actor.y, heading: actor.heading };
        } else {
          actor.x = pt.x;
          actor.y = pt.y;
          actor.heading = pt.heading;
        }
      } else {
        actor.x = pt.x;
        actor.y = pt.y;
        actor.heading = pt.heading;
      }
      actor.face = N.faceFromHeading(pt.heading, actor.face);
      const step = Math.floor(actor.walkT / 0.16) % 2;
      actor.bob = actor.kind === "runner" ? (step ? -2 : 0) : (step ? -1 : 0);
      actor.foot = actor.kind === "runner" && step ? 1 : 0;
      applyPose(actor);
      if (actor.walkT >= actor.plan.T) {
        const end = actor.path[actor.path.length - 1];
        actor.x = end.x;
        actor.y = end.y;
        actor.bob = actor.kind === "runner" ? 1 : 0;
        if (actor._retarget) {
          const dest = actor._retarget;
          actor._retarget = null;
          beginPrepare(actor, dest, actor.after);
          return;
        }
        finishArrive(actor, actor.after);
      }
      return;
    }

    if (actor.mode === STATES.ARRIVE) {
      actor.phaseT += dt;
      actor.bob = actor.phaseT < 0.08 ? 1 : 0;
      applyPose(actor);
      if (actor.phaseT >= ARRIVE_MS / 1000) settleAfter(actor);
      return;
    }

    /* Idle / work / talk — sparse async motion, labels stay put. */
    actor.idlePhase += dt;
    actor.idleNext -= dt;
    let bob = 0;
    if (!sim.hidden && !reduceMotion()) {
      if (actor.mode === STATES.WORK) {
        bob = Math.round(Math.sin(actor.idlePhase * 7) * 1);
      } else if (actor.mode === STATES.IDLE || actor.mode === STATES.TALK) {
        bob = Math.round(Math.sin(actor.idlePhase * 1.4) * 1);
      }
      if (actor.kind === "critter" && actor.idleNext <= 0) {
        actor.el.classList.remove("fx-twitch", "fx-hover", "fx-flick", "fx-spark", "fx-blink");
        actor.el.classList.add("fx-" + (actor.el.dataset.idle || "twitch"));
        setTimeout(() => actor.el.classList.remove("fx-twitch", "fx-hover", "fx-flick", "fx-spark", "fx-blink"), 420);
        actor.idleNext = 3 + Math.random() * 5;
      }
    }
    actor.bob = bob;
    applyPose(actor);
  }

  function stepAmbient(dt) {
    if (sim.hidden) return;
    sim.ambientClock += dt;
    const leds = document.querySelectorAll(".led");
    if (!leds.length) return;
    const active = Math.floor(sim.ambientClock / 3.6) % leds.length;
    const second = (active + 3) % leds.length;
    leds.forEach((el, i) => {
      el.classList.toggle("on", i === active || i === second);
    });
  }

  function tick(now) {
    const dt = sim.lastT ? Math.min(0.05, (now - sim.lastT) / 1000) : 0.016;
    sim.lastT = now;
    if (sim.hidden) {
      requestAnimationFrame(tick);
      return;
    }
    sim.actors.forEach((a) => stepActor(a, dt, now));
    separate();
    stepAmbient(dt);
    sim.actors.forEach((a) => {
      const b = document.getElementById("speech-" + a.stationId);
      if (b && b.classList.contains("show") && a.kind === "runner") placeBubble(a.stationId);
    });
    requestAnimationFrame(tick);
  }

  function separate() {
    const list = [];
    sim.actors.forEach((a) => list.push(a));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.mode !== STATES.WALK && b.mode !== STATES.WALK) continue;
        const pa = N.nativeOf(a);
        const pb = N.nativeOf(b);
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.hypot(dx, dy);
        if (d >= SEPARATION_PX || d < 0.2) continue;
        const push = (SEPARATION_PX - d) / 2;
        const hx = dx / d;
        const hy = dy / d;
        if (a.mode === STATES.WALK) {
          a.x -= (hx * push * 100) / N.NATIVE_W;
          a.y -= (hy * push * 100) / N.NATIVE_H;
        }
        if (b.mode === STATES.WALK) {
          b.x += (hx * push * 100) / N.NATIVE_W;
          b.y += (hy * push * 100) / N.NATIVE_H;
        }
      }
    }
  }

  async function load() {
    try {
      const data = await (await fetch("status.json?ts=" + Date.now())).json();
      ingest(data, true);
    } catch (e) {
      document.getElementById("ticker").textContent = "Could not load status.json";
    }
  }

  function onResize() {
    sim.actors.forEach((a) => applyPose(a, true));
    sim.actors.forEach((a) => {
      if (a.kind === "runner") placeBubble(a.stationId);
    });
  }

  document.addEventListener("visibilitychange", () => {
    sim.hidden = document.hidden;
    sim.lastT = performance.now();
    const ambient = document.getElementById("ambient");
    if (ambient) ambient.classList.toggle("paused", sim.hidden);
  });

  window.addEventListener("resize", onResize);

  window.OfficeHQ = {
    goto(id, dest, after) {
      startPair(id, dest, after || { state: "working", look: (N.STATIONS[id] || {}).face });
    },
    ingest(data) {
      ingest(data, false);
    },
    actors: sim.actors,
    nav: N
  };

  load();
  setInterval(load, 3000);
  requestAnimationFrame(tick);
})();
