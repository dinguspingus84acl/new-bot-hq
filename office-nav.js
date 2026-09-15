/* New Bot HQ — station map, org routes, and status event diffs.
   Walk/pathfinding graph removed. Characters stay at desk seats.
   Coordinates are percent of the 1280×720 office image (foot positions).
   Loaded before office-sim.js; also runnable under Node for tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OfficeNav = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NATIVE_W = 1280;
  const NATIVE_H = 720;

  const STATIONS = {
    coord: {
      seat: { x: 31.8, y: 69.2 },
      companion: { dx: 2.8, dy: 2.3 },
      face: "right",
      monitor: { x: 26.2, y: 50.8, w: 11.2, h: 7.2 },
      strip: { x: 18.4, y: 57.2, w: 16.5 },
      chip: { x: 31.8, y: 73.4 },
      hit: { x: 23.2, y: 52.5, w: 16.8, h: 22.5 }
    },
    deep: {
      seat: { x: 39.8, y: 35.2 },
      companion: { dx: 2.0, dy: 2.05 },
      face: "right",
      monitor: { x: 34.6, y: 20.4, w: 10.4, h: 6.6 },
      strip: { x: 28.8, y: 27.2, w: 15.2 },
      chip: { x: 39.8, y: 38.8 },
      hit: { x: 32.4, y: 20.8, w: 15.6, h: 20.5 }
    },
    cluster: {
      seat: { x: 55.4, y: 33.6 },
      companion: { dx: -2.05, dy: 2.05 },
      face: "left",
      monitor: { x: 51.8, y: 20.2, w: 10.6, h: 6.6 },
      strip: { x: 46.8, y: 26.8, w: 15.4 },
      chip: { x: 55.4, y: 37.4 },
      hit: { x: 47.8, y: 19.6, w: 15.8, h: 20.2 }
    },
    watch: {
      seat: { x: 71.2, y: 33.8 },
      companion: { dx: -2.1, dy: 2.1 },
      face: "left",
      monitor: { x: 68.4, y: 20.4, w: 10.8, h: 6.6 },
      strip: { x: 63.6, y: 27.0, w: 15.6 },
      chip: { x: 71.2, y: 37.6 },
      hit: { x: 63.6, y: 19.8, w: 16.2, h: 20.4 }
    },
    lab: {
      seat: { x: 60.6, y: 69.0 },
      companion: { dx: -2.8, dy: 2.3 },
      face: "left",
      monitor: { x: 57.4, y: 50.6, w: 11.0, h: 7.0 },
      strip: { x: 51.6, y: 57.0, w: 16.2 },
      chip: { x: 60.6, y: 73.2 },
      hit: { x: 52.4, y: 52.2, w: 16.6, h: 22.4 }
    }
  };

  const DESK_INDEX = ["coord", "deep", "cluster", "watch", "lab"];

  const AGENT_META = {
    coord: { org: "Coordinator", specialty: "Delegation / floor lead", reportsTo: null },
    deep: { org: "Research", specialty: "Forensics", reportsTo: "coord" },
    cluster: { org: "Analysis", specialty: "Cluster intel", reportsTo: "coord" },
    watch: { org: "Monitoring", specialty: "Watch floor", reportsTo: "coord" },
    lab: { org: "Archive", specialty: "Review & records", reportsTo: "coord" }
  };

  const STATUS_META = {
    idle: { label: "Idle", glyph: "○", tone: "neutral" },
    reading: { label: "Reading", glyph: "▤", tone: "cyan" },
    thinking: { label: "Thinking", glyph: "◇", tone: "cyan" },
    working: { label: "Working", glyph: "▶", tone: "cyan" },
    running_tool: { label: "Running Tool", glyph: "≡", tone: "violet" },
    waiting: { label: "Waiting", glyph: "…", tone: "amber" },
    needs_approval: { label: "Needs Approval", glyph: "!", tone: "amber" },
    blocked: { label: "Blocked", glyph: "▣", tone: "red" },
    done: { label: "Done", glyph: "✓", tone: "green" },
    failed: { label: "Failed", glyph: "✕", tone: "red" }
  };

  const WORKFLOW = ["inbox", "assigned", "working", "review", "approval", "done"];

  /* Thin aisle traces in image-percent space. Packets travel these paths. */
  const ROUTES = [
    { id: "coord-deep", a: "coord", b: "deep", kind: "report", d: "M 31.8 69.2 C 36.5 58.0 38.8 46.0 39.8 35.2" },
    { id: "coord-cluster", a: "coord", b: "cluster", kind: "report", d: "M 31.8 69.2 C 40.0 62.0 50.5 48.0 55.4 33.6" },
    { id: "coord-watch", a: "coord", b: "watch", kind: "report", d: "M 31.8 69.2 C 44.0 64.0 62.0 50.0 71.2 33.8" },
    { id: "coord-lab", a: "coord", b: "lab", kind: "handoff", d: "M 31.8 69.2 C 42.0 76.8 52.0 76.6 60.6 69.0" },
    { id: "deep-cluster", a: "deep", b: "cluster", kind: "handoff", d: "M 39.8 35.2 C 45.2 30.4 50.0 30.2 55.4 33.6" },
    { id: "cluster-watch", a: "cluster", b: "watch", kind: "handoff", d: "M 55.4 33.6 C 61.0 30.0 66.4 30.2 71.2 33.8" },
    { id: "deep-lab", a: "deep", b: "lab", kind: "handoff", d: "M 39.8 35.2 C 44.5 48.0 52.5 60.5 60.6 69.0" },
    { id: "watch-lab", a: "watch", b: "lab", kind: "report", d: "M 71.2 33.8 C 70.2 48.0 66.4 60.0 60.6 69.0" }
  ];

  const OCCLUDERS = [
    { file: "assets/occluders/lounge.png", x: 0, y: 40, w: 381, h: 211, sortY: 30.0 },
    { file: "assets/occluders/north-desks.png", x: 300, y: 90, w: 901, h: 161, sortY: 31.5 },
    { file: "assets/occluders/sw-desk.png", x: 140, y: 320, w: 401, h: 121, sortY: 57.6 },
    { file: "assets/occluders/se-desk.png", x: 620, y: 320, w: 401, h: 121, sortY: 57.6 },
    { file: "assets/occluders/coffee.png", x: 1040, y: 280, w: 240, h: 181, sortY: 56.0 },
    { file: "assets/occluders/cab-bl.png", x: 0, y: 430, w: 201, h: 191, sortY: 78.0 },
    { file: "assets/occluders/plant-bl.png", x: 40, y: 540, w: 191, h: 180, sortY: 92.0 },
    { file: "assets/occluders/cab-br.png", x: 980, y: 500, w: 300, h: 220, sortY: 88.0 },
    { file: "assets/occluders/plant-br.png", x: 880, y: 540, w: 201, h: 180, sortY: 90.0 },
    { file: "assets/occluders/plant-mid-r.png", x: 900, y: 360, w: 141, h: 141, sortY: 64.0 }
  ];

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function zFromY(yPct) {
    return 40 + Math.round(Number(yPct) * 10);
  }

  function stationIdFor(station, idx) {
    if (station && STATIONS[station.id]) return station.id;
    const n = Number.isFinite(station && station.desk) ? station.desk : idx || 0;
    return DESK_INDEX[((n % DESK_INDEX.length) + DESK_INDEX.length) % DESK_INDEX.length];
  }

  function companionPoint(stationId) {
    const spec = STATIONS[stationId] || STATIONS.coord;
    return {
      x: spec.seat.x + spec.companion.dx,
      y: spec.seat.y + spec.companion.dy,
      face: spec.face
    };
  }

  function findRoute(a, b) {
    if (!a || !b || a === b) return null;
    for (let i = 0; i < ROUTES.length; i++) {
      const r = ROUTES[i];
      if (r.a === a && r.b === b) return { route: r, reverse: false };
      if (r.a === b && r.b === a) return { route: r, reverse: true };
    }
    const viaCoord = a !== "coord" && b !== "coord"
      ? findRoute(a, "coord")
      : null;
    if (viaCoord) return viaCoord;
    return { route: ROUTES[0], reverse: false, fallback: true };
  }

  function blobOf(s) {
    return String((s && (s.stage || "")) + " " + (s && (s.task || "")) + " " + (s && (s.activity || ""))).toLowerCase();
  }

  function deriveAgentStatus(station) {
    const state = String((station && station.state) || "idle").toLowerCase();
    const blob = blobOf(station);
    if (state === "failed" || /\bfail(ed|ure)?\b/.test(blob)) return "failed";
    if (state === "blocked" || /\bblocked\b/.test(blob)) return "blocked";
    if (state !== "done" && /needs approval|awaiting approval|\bapprov/.test(blob)) return "needs_approval";
    if (state === "working" && /running tool|tool:|\btooling\b/.test(blob)) return "running_tool";
    if (state === "working" && /\bthink|\bplan(ning)?\b/.test(blob)) return "thinking";
    if (state === "working" && /\breading\b/.test(blob)) return "reading";
    if (state === "working") return "working";
    if (state === "done") return "done";
    if (state === "idle" && /\bwait/.test(blob)) return "waiting";
    if (state === "idle" && station && station.task && (station.progress || 0) > 0 && (station.progress || 0) < 1) return "waiting";
    return "idle";
  }

  function workflowPhase(station) {
    const st = deriveAgentStatus(station);
    if (!station || !station.task) return "inbox";
    if (st === "failed") return "review";
    if (st === "blocked" || st === "needs_approval") return "approval";
    if (st === "done") return "done";
    if (st === "waiting") return "review";
    if (st === "idle" && (station.progress || 0) >= 1) return "done";
    if (st === "working" || st === "running_tool" || st === "reading" || st === "thinking") return "working";
    return "assigned";
  }

  function priorityFor(station) {
    const st = deriveAgentStatus(station);
    if (st === "blocked" || st === "failed") return "P0";
    if (st === "needs_approval") return "P1";
    if (st === "working" && (station.progress || 0) >= 0.8) return "P1";
    if (st === "working" || st === "running_tool" || st === "reading" || st === "thinking") return "P2";
    if (st === "waiting") return "P3";
    return "P4";
  }

  function usageFor(station) {
    const st = deriveAgentStatus(station);
    const prog = Number(station && station.progress) || 0;
    let used = prog * 1.42;
    if (st === "working" || st === "running_tool" || st === "reading" || st === "thinking") used += 0.28;
    if (st === "needs_approval") used += 0.12;
    return { used: Math.round(used * 10) / 10, cap: 2.5 };
  }

  function normalizeStation(s) {
    return {
      id: s.id,
      state: s.state || "idle",
      task: s.task || "",
      desk: s.desk,
      destination: s.destination || "",
      creature_id: s.creature_id || "",
      activity: s.activity || ""
    };
  }

  function semanticEqual(a, b) {
    if (!a || !b) return false;
    const na = normalizeStation(a);
    const nb = normalizeStation(b);
    return (
      na.id === nb.id &&
      na.state === nb.state &&
      na.task === nb.task &&
      na.desk === nb.desk &&
      na.destination === nb.destination &&
      na.creature_id === nb.creature_id &&
      na.activity === nb.activity
    );
  }

  function stationsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id || !semanticEqual(a[i], b[i])) return false;
    }
    return true;
  }

  function stageSignal(prevStage, nextStage) {
    const prev = String(prevStage || "").toLowerCase();
    const next = String(nextStage || "").toLowerCase();
    if (prev === next) return null;
    if (/needs approval|awaiting approval|\bapprov/.test(next) && !/approv/.test(prev)) return "approval";
    if ((/running tool|tool:|\btooling\b/.test(next)) && !(/running tool|tool:|\btooling\b/.test(prev))) return "tool_started";
    if (/\bblocked\b/.test(next) && !/\bblocked\b/.test(prev)) return "blocked";
    if (/\bfail/.test(next) && !/\bfail/.test(prev)) return "failed";
    return null;
  }

  function diffEvents(prevList, nextList) {
    const events = [];
    const prev = prevList || [];
    const next = nextList || [];
    const prevMap = {};
    prev.forEach((s) => {
      prevMap[s.id] = s;
    });

    next.forEach((s) => {
      const p = prevMap[s.id];
      const ns = deriveAgentStatus(s);
      const ps = p ? deriveAgentStatus(p) : null;

      if (!p) {
        if (s.task) {
          events.push({
            type: s.id === "coord" ? "started" : "assigned",
            agent: s.id,
            from: s.id === "coord" ? null : "coord",
            to: s.id,
            task: s.task,
            result: ns
          });
        }
        return;
      }

      const taskChanged = (p.task || "") !== (s.task || "");
      const statusChanged = ps !== ns;

      if (taskChanged && s.task) {
        const donor = prev.find((x) => x.id !== s.id && x.task === s.task);
        if (donor) {
          events.push({
            type: "handoff",
            agent: s.id,
            from: donor.id,
            to: s.id,
            task: s.task,
            result: "assigned"
          });
        } else {
          events.push({
            type: "assigned",
            agent: s.id,
            from: "coord",
            to: s.id,
            task: s.task,
            result: ns
          });
        }
      }

      if (ns === "failed" && ps !== "failed") {
        events.push({ type: "failed", agent: s.id, to: s.id, task: s.task, result: s.stage || "failed" });
      } else if (ns === "blocked" && ps !== "blocked") {
        events.push({ type: "blocked", agent: s.id, to: s.id, task: s.task, result: s.stage || "blocked" });
      } else if (ns === "needs_approval" && ps !== "needs_approval") {
        events.push({ type: "approval", agent: s.id, to: s.id, task: s.task, result: "needs approval" });
      } else if (ns === "done" && ps !== "done") {
        events.push({ type: "completed", agent: s.id, to: s.id, task: s.task, result: "done" });
      } else if (ns === "running_tool" && ps !== "running_tool") {
        events.push({
          type: "tool_started",
          agent: s.id,
          from: s.id,
          to: AGENT_META[s.id] && AGENT_META[s.id].reportsTo ? AGENT_META[s.id].reportsTo : "coord",
          task: s.task,
          result: s.stage || "tool"
        });
      } else if (
        !taskChanged &&
        (ns === "working" || ns === "reading" || ns === "thinking") &&
        (ps === "idle" || ps === "waiting" || ps === null)
      ) {
        events.push({ type: "started", agent: s.id, to: s.id, task: s.task, result: ns });
      } else if (!taskChanged && !statusChanged) {
        const sig = stageSignal(p.stage, s.stage) || stageSignal(p.activity, s.activity);
        if (sig === "tool_started") {
          events.push({
            type: "tool_started",
            agent: s.id,
            from: s.id,
            to: AGENT_META[s.id] && AGENT_META[s.id].reportsTo ? AGENT_META[s.id].reportsTo : "coord",
            task: s.task,
            result: s.stage || "tool"
          });
        } else if (sig) {
          events.push({ type: sig, agent: s.id, to: s.id, task: s.task, result: s.stage || sig });
        }
      }
    });

    return events;
  }

  function commandMetrics(stations, updatedAt) {
    const list = stations || [];
    let active = 0;
    let queued = 0;
    let completed = 0;
    let blocked = 0;
    let used = 0;
    const cap = 12.5;
    list.forEach((s) => {
      const st = deriveAgentStatus(s);
      const u = usageFor(s);
      used += u.used;
      if (st === "working" || st === "running_tool" || st === "reading" || st === "thinking") active += 1;
      if (st === "done" || (st === "idle" && (s.progress || 0) >= 1)) completed += 1;
      if (st === "blocked" || st === "failed") blocked += 1;
      if (st === "idle" && s.task && (s.progress || 0) < 1) queued += 1;
      if (st === "waiting") queued += 1;
      if (workflowPhase(s) === "assigned" && st !== "working") queued += 1;
    });
    let health = "QUIET";
    let healthTone = "neutral";
    if (list.some((s) => deriveAgentStatus(s) === "failed")) {
      health = "INCIDENT";
      healthTone = "red";
    } else if (list.some((s) => {
      const st = deriveAgentStatus(s);
      return st === "blocked" || st === "needs_approval";
    })) {
      health = "ATTENTION";
      healthTone = "amber";
    } else if (active > 0) {
      health = "OPERATIONAL";
      healthTone = "green";
    }
    if (needsYouItems(list).length && health === "QUIET") {
      health = "ATTENTION";
      healthTone = "amber";
    }
    return {
      active,
      total: list.length,
      queued,
      completed,
      blocked,
      used: Math.round(used * 10) / 10,
      cap,
      updatedAt: updatedAt || "",
      health,
      healthTone
    };
  }

  function needsYouItems(stations) {
    const items = [];
    (stations || []).forEach((s) => {
      const st = deriveAgentStatus(s);
      const name = s.character || s.id;
      if (st === "needs_approval") {
        items.push({
          id: s.id + ":approval",
          kind: "approval",
          agent: s.id,
          name,
          title: s.task || "Approval required",
          reason: s.stage || "Needs approval"
        });
      } else if (st === "blocked") {
        items.push({
          id: s.id + ":blocked",
          kind: "blocked",
          agent: s.id,
          name,
          title: s.task || "Blocked work",
          reason: s.stage || "Blocked"
        });
      } else if (st === "failed") {
        items.push({
          id: s.id + ":failed",
          kind: "failed",
          agent: s.id,
          name,
          title: s.task || "Failed job",
          reason: s.stage || "Failed"
        });
      }
      const blob = blobOf(s);
      if (
        st === "working" &&
        (s.progress || 0) >= 0.8 &&
        /report to jack|report to the human|waiting on jack/.test(blob)
      ) {
        items.push({
          id: s.id + ":report",
          kind: "approval",
          agent: s.id,
          name,
          title: s.task || "Coordinator report",
          reason: s.stage || "Report ready for review"
        });
      }
    });
    const seen = {};
    return items.filter((it) => {
      if (seen[it.id]) return false;
      seen[it.id] = true;
      return true;
    });
  }

  function ticketFrom(station) {
    const st = deriveAgentStatus(station);
    const meta = STATUS_META[st] || STATUS_META.idle;
    const usage = usageFor(station);
    return {
      id: station.id,
      title: station.task || "No task",
      agent: station.character || station.id,
      agentId: station.id,
      state: st,
      stateLabel: meta.label,
      glyph: meta.glyph,
      tone: meta.tone,
      phase: workflowPhase(station),
      elapsed: 0,
      priority: priorityFor(station),
      progress: Math.round(100 * (station.progress || 0)),
      lastAction: station.stage || station.activity || "—",
      usage
    };
  }

  return {
    NATIVE_W,
    NATIVE_H,
    STATIONS,
    DESK_INDEX,
    AGENT_META,
    STATUS_META,
    WORKFLOW,
    ROUTES,
    OCCLUDERS,
    clamp,
    zFromY,
    stationIdFor,
    companionPoint,
    findRoute,
    deriveAgentStatus,
    workflowPhase,
    priorityFor,
    usageFor,
    normalizeStation,
    semanticEqual,
    stationsEqual,
    stageSignal,
    diffEvents,
    commandMetrics,
    needsYouItems,
    ticketFrom
  };
});
