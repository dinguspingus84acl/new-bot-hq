/* New Bot HQ — station map, aisle waypoint graph, org routes, and status diffs.
   Walkers use approach → spine → approach → seat and never cut desks.
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
      seat: { x: 32.8, y: 58.2 },
      companion: { dx: 5.2, dy: 1.4 },
      overflow: { dx: 6.4, dy: 2.2 },
      face: "right",
      approach: "coord_ap",
      monitor: { x: 26.2, y: 50.8, w: 11.2, h: 7.2 },
      strip: { x: 18.4, y: 57.2, w: 16.5 },
      chip: { x: 32.8, y: 61.4 },
      hit: { x: 24.6, y: 45.8, w: 16.4, h: 18.4 }
    },
    deep: {
      seat: { x: 36.8, y: 31.8 },
      companion: { dx: 4.4, dy: 1.2 },
      overflow: { dx: 5.6, dy: 2.0 },
      face: "right",
      approach: "deep_ap",
      monitor: { x: 34.6, y: 20.4, w: 10.4, h: 6.6 },
      strip: { x: 28.8, y: 27.2, w: 15.2 },
      chip: { x: 36.8, y: 35.0 },
      hit: { x: 30.4, y: 18.8, w: 15.0, h: 17.8 }
    },
    cluster: {
      seat: { x: 53.0, y: 32.2 },
      companion: { dx: -4.4, dy: 1.2 },
      overflow: { dx: -5.6, dy: 2.0 },
      face: "left",
      approach: "cluster_ap",
      monitor: { x: 51.8, y: 20.2, w: 10.6, h: 6.6 },
      strip: { x: 46.8, y: 26.8, w: 15.4 },
      chip: { x: 53.0, y: 35.2 },
      hit: { x: 45.8, y: 19.0, w: 14.8, h: 17.6 }
    },
    watch: {
      seat: { x: 69.2, y: 32.2 },
      companion: { dx: -4.6, dy: 1.2 },
      overflow: { dx: -5.8, dy: 2.0 },
      face: "left",
      approach: "watch_ap",
      monitor: { x: 68.4, y: 20.4, w: 10.8, h: 6.6 },
      strip: { x: 63.6, y: 27.0, w: 15.6 },
      chip: { x: 69.2, y: 35.2 },
      hit: { x: 61.8, y: 19.0, w: 15.2, h: 17.6 }
    },
    lab: {
      seat: { x: 61.4, y: 58.2 },
      companion: { dx: -5.2, dy: 1.4 },
      overflow: { dx: -6.4, dy: 2.2 },
      face: "left",
      approach: "lab_ap",
      monitor: { x: 57.4, y: 50.6, w: 11.0, h: 7.0 },
      strip: { x: 51.6, y: 57.0, w: 16.2 },
      chip: { x: 61.4, y: 61.4 },
      hit: { x: 53.4, y: 45.6, w: 16.2, h: 18.4 }
    }
  };

  const DESK_INDEX = ["coord", "deep", "cluster", "watch", "lab"];

  /* Aisle waypoints in image-percent space. Seats match seated2 chairs.
     Walkers use approach → spine → approach → seat and never cut desks. */
  const NODES = {
    hub: { x: 45.0, y: 71.0 },
    mid: { x: 45.0, y: 62.0 },
    gap: { x: 45.0, y: 50.0 },
    cross: { x: 45.0, y: 42.0 },
    west: { x: 26.0, y: 71.0 },
    east: { x: 68.0, y: 71.0 },
    nw: { x: 32.0, y: 42.0 },
    ne: { x: 64.0, y: 42.0 },
    report: { x: 45.0, y: 66.0 },
    report_b: { x: 41.6, y: 68.2 },
    report_c: { x: 48.4, y: 68.2 },
    lounge: { x: 17.5, y: 34.5 },
    lounge_ap: { x: 22.5, y: 43.0 },
    coord_ap: { x: 34.2, y: 66.4 },
    coord: { x: 32.8, y: 58.2, face: "right", home: true },
    deep_ap: { x: 37.2, y: 41.0 },
    deep: { x: 36.8, y: 31.8, face: "right", home: true },
    cluster_ap: { x: 53.0, y: 41.2 },
    cluster: { x: 53.0, y: 32.2, face: "left", home: true },
    watch_ap: { x: 69.2, y: 41.2 },
    watch: { x: 69.2, y: 32.2, face: "left", home: true },
    lab_ap: { x: 60.8, y: 66.4 },
    lab: { x: 61.4, y: 58.2, face: "left", home: true }
  };

  const EDGES = [
    ["hub", "west"],
    ["hub", "east"],
    ["hub", "mid"],
    ["hub", "report"],
    ["report", "mid"],
    ["report", "report_b"],
    ["report", "report_c"],
    ["mid", "gap"],
    ["gap", "cross"],
    ["cross", "nw"],
    ["cross", "ne"],
    ["cross", "deep_ap"],
    ["cross", "cluster_ap"],
    ["nw", "lounge_ap"],
    ["nw", "deep_ap"],
    ["ne", "cluster_ap"],
    ["ne", "watch_ap"],
    ["lounge_ap", "lounge"],
    ["west", "coord_ap"],
    ["coord_ap", "coord"],
    ["east", "lab_ap"],
    ["lab_ap", "lab"],
    ["deep_ap", "deep"],
    ["cluster_ap", "cluster"],
    ["watch_ap", "watch"]
  ];

  const BLOCKED = [
    { name: "sofa", poly: [[2, 7], [28, 7], [28, 21], [2, 21]] },
    { name: "loungeTable", poly: [[12, 22], [25, 22], [25, 31], [12, 31]] },
    { name: "northL", poly: [[27, 16], [47, 16], [47, 30], [27, 30]] },
    { name: "northM", poly: [[49, 16], [66, 16], [66, 30], [49, 30]] },
    { name: "northR", poly: [[67, 16], [86, 16], [86, 30], [67, 30]] },
    { name: "swDesk", poly: [[15, 46], [40, 46], [40, 56.2], [15, 56.2]] },
    { name: "seDesk", poly: [[50, 46], [74, 46], [74, 56.2], [50, 56.2]] },
    { name: "coffee", poly: [[82, 40], [98, 40], [98, 56], [82, 56]] },
    { name: "cabBL", poly: [[0, 62], [13, 62], [13, 78], [0, 78]] },
    { name: "cabBR", poly: [[78, 72], [99, 72], [99, 90], [78, 90]] }
  ];

  const AGENT_META = {
    coord: { org: "Coordinator", specialty: "Delegation / floor lead", reportsTo: null, shortName: "New Bot" },
    deep: { org: "Research", specialty: "Forensics", reportsTo: "coord", shortName: "Mira" },
    cluster: { org: "Analysis", specialty: "Cluster intel", reportsTo: "coord", shortName: "Kai" },
    watch: { org: "Monitoring", specialty: "Watch floor", reportsTo: "coord", shortName: "Oak" },
    lab: { org: "Archive", specialty: "Review & records", reportsTo: "coord", shortName: "Rex" }
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
    { id: "coord-deep", a: "coord", b: "deep", kind: "report", d: "M 32.8 58.2 C 34.8 49.0 36.0 39.8 36.8 31.8" },
    { id: "coord-cluster", a: "coord", b: "cluster", kind: "report", d: "M 32.8 58.2 C 39.0 50.5 47.5 40.8 53.0 32.2" },
    { id: "coord-watch", a: "coord", b: "watch", kind: "report", d: "M 32.8 58.2 C 44.5 52.0 60.5 42.0 69.2 32.2" },
    { id: "coord-lab", a: "coord", b: "lab", kind: "handoff", d: "M 32.8 59.4 C 42.5 66.8 52.0 66.6 61.4 59.4" },
    { id: "deep-cluster", a: "deep", b: "cluster", kind: "handoff", d: "M 36.8 33.2 C 42.4 38.4 47.6 38.4 53.0 33.4" },
    { id: "cluster-watch", a: "cluster", b: "watch", kind: "handoff", d: "M 53.0 33.4 C 58.6 38.6 64.0 38.6 69.2 33.4" },
    { id: "deep-lab", a: "deep", b: "lab", kind: "handoff", d: "M 36.8 31.8 C 43.5 43.5 52.5 52.5 61.4 58.2" },
    { id: "watch-lab", a: "watch", b: "lab", kind: "report", d: "M 69.2 32.2 C 67.8 43.5 64.2 52.0 61.4 58.2" }
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

  function shortName(station) {
    const id = station && (station.id || station);
    if (AGENT_META[id] && AGENT_META[id].shortName) return AGENT_META[id].shortName;
    const raw = String((station && station.character) || id || "Agent");
    return raw.replace(/\s+Desk$/i, "").trim() || "Agent";
  }

  function companionPoint(stationId, occupied) {
    const spec = STATIONS[stationId] || STATIONS.coord;
    const off = occupied ? spec.overflow : spec.companion;
    return {
      x: spec.seat.x + off.dx,
      y: spec.seat.y + off.dy,
      face: spec.face
    };
  }

  const adj = {};
  Object.keys(NODES).forEach((id) => (adj[id] = []));
  EDGES.forEach(([a, b]) => {
    adj[a].push(b);
    adj[b].push(a);
  });

  function nativeOf(p) {
    return { x: (p.x / 100) * NATIVE_W, y: (p.y / 100) * NATIVE_H };
  }

  function dist(a, b) {
    const pa = nativeOf(a);
    const pb = nativeOf(b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    return Math.hypot(dx, dy);
  }

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function nearestNode(p, allowed) {
    const ids = allowed || Object.keys(NODES);
    let best = ids[0];
    let bestD = Infinity;
    ids.forEach((id) => {
      const d = dist(p, NODES[id]);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    });
    return best;
  }

  function findPath(fromId, toId) {
    if (!NODES[fromId] || !NODES[toId]) return [fromId];
    if (fromId === toId) return [fromId];
    const q = [fromId];
    const prev = { [fromId]: null };
    while (q.length) {
      const cur = q.shift();
      if (cur === toId) break;
      (adj[cur] || []).forEach((n) => {
        if (prev[n] === undefined) {
          prev[n] = cur;
          q.push(n);
        }
      });
    }
    if (prev[toId] === undefined) return [fromId, toId];
    const out = [];
    for (let n = toId; n; n = prev[n]) out.push(n);
    return out.reverse();
  }

  function nodePath(fromId, toId) {
    return findPath(fromId, toId).map((id) => ({ id, x: NODES[id].x, y: NODES[id].y, face: NODES[id].face }));
  }

  function pathFromPoint(fromPt, toId) {
    const start = nearestNode(fromPt);
    const nodes = nodePath(start, toId);
    if (dist(fromPt, nodes[0]) > 6) {
      return [{ id: "_cur", x: fromPt.x, y: fromPt.y }, ...nodes];
    }
    return [{ id: "_cur", x: fromPt.x, y: fromPt.y }, ...nodes.slice(1)];
  }

  /* Chamfer sharp corners so aisle turns read as a short rounded step. */
  function chamfer(points, radiusPx) {
    if (points.length < 3) return points.slice();
    const r = radiusPx == null ? 22 : radiusPx;
    const out = [{ x: points[0].x, y: points[0].y, id: points[0].id }];
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      const d1 = dist(a, b);
      const d2 = dist(b, c);
      const rad = Math.min(r, d1 * 0.35, d2 * 0.35);
      if (rad < 8) {
        out.push({ x: b.x, y: b.y, id: b.id });
        continue;
      }
      const t1 = rad / d1;
      const t2 = rad / d2;
      out.push({ x: b.x + (a.x - b.x) * t1, y: b.y + (a.y - b.y) * t1, id: b.id + "_in" });
      out.push({ x: b.x + (c.x - b.x) * t2, y: b.y + (c.y - b.y) * t2, id: b.id + "_out" });
    }
    const last = points[points.length - 1];
    out.push({ x: last.x, y: last.y, id: last.id });
    return out;
  }

  function polyLen(points) {
    let s = 0;
    for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
    return s;
  }

  function pointAlong(points, s) {
    if (!points.length) return { x: 0, y: 0, heading: { x: 1, y: 0 }, seg: 0 };
    if (points.length === 1 || s <= 0) {
      const h = points[1] ? heading(points[0], points[1]) : { x: 1, y: 0 };
      return { x: points[0].x, y: points[0].y, heading: h, seg: 0 };
    }
    let left = s;
    for (let i = 1; i < points.length; i++) {
      const d = dist(points[i - 1], points[i]);
      if (left <= d || i === points.length - 1) {
        const t = d ? clamp(left / d, 0, 1) : 1;
        const p = lerp(points[i - 1], points[i], t);
        return { x: p.x, y: p.y, heading: heading(points[i - 1], points[i]), seg: i - 1 };
      }
      left -= d;
    }
    const last = points[points.length - 1];
    const prev = points[points.length - 2] || last;
    return { x: last.x, y: last.y, heading: heading(prev, last), seg: points.length - 2 };
  }

  function heading(a, b) {
    const pa = nativeOf(a);
    const pb = nativeOf(b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  }

  /* Near-constant mid-route speed; short ease only at go / stop. */
  function travelPlan(lengthPx) {
    const cruise = clamp(90 + (lengthPx / 700) * 40, 90, 130);
    let ta = 0.13;
    let td = 0.14;
    let cruiseD = lengthPx - 0.5 * cruise * (ta + td);
    let v = cruise;
    if (cruiseD < 8) {
      v = clamp(lengthPx / 0.42, 70, 130);
      ta = 0.1;
      td = 0.12;
      cruiseD = Math.max(0, lengthPx - 0.5 * v * (ta + td));
    }
    const T = ta + td + cruiseD / v;
    return { T, v, ta, td, length: lengthPx };
  }

  function distanceAt(plan, t) {
    const { T, v, ta, td, length } = plan;
    if (t <= 0) return 0;
    if (t >= T) return length;
    if (t < ta) {
      const u = t / ta;
      return 0.5 * v * ta * u * u;
    }
    if (t < T - td) {
      return 0.5 * v * ta + v * (t - ta);
    }
    const u = (T - t) / td;
    return length - 0.5 * v * td * u * u;
  }

  function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      const hit = a[1] > p.y !== b[1] > p.y && p.x < ((b[0] - a[0]) * (p.y - a[1])) / (b[1] - a[1]) + a[0];
      if (hit) inside = !inside;
    }
    return inside;
  }

  function segmentHitsBlocked(a, b, samples) {
    const n = samples || 8;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = lerp(a, b, t);
      for (let k = 0; k < BLOCKED.length; k++) {
        if (pointInPoly(p, BLOCKED[k].poly)) return BLOCKED[k].name;
      }
    }
    return null;
  }

  function pathBlocked(points) {
    for (let i = 1; i < points.length; i++) {
      const hit = segmentHitsBlocked(points[i - 1], points[i]);
      if (hit) return { hit, i };
    }
    return null;
  }

  function destIdFor(station) {
    if (station && station.destination && NODES[station.destination]) return station.destination;
    return stationIdFor(station);
  }

  function reportSlot(index) {
    const ids = ["report", "report_b", "report_c"];
    return ids[index % ids.length];
  }

  function faceFromHeading(h, fallback) {
    if (!h || (Math.abs(h.x) < 0.12 && Math.abs(h.y) >= Math.abs(h.x))) return fallback || "right";
    return h.x < 0 ? "left" : "right";
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
      const name = shortName(s);
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
      agent: shortName(station),
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
    NODES,
    EDGES,
    BLOCKED,
    adj,
    AGENT_META,
    STATUS_META,
    WORKFLOW,
    ROUTES,
    OCCLUDERS,
    clamp,
    zFromY,
    stationIdFor,
    destIdFor,
    companionPoint,
    reportSlot,
    findRoute,
    nativeOf,
    dist,
    lerp,
    nearestNode,
    findPath,
    nodePath,
    pathFromPoint,
    chamfer,
    polyLen,
    pointAlong,
    heading,
    travelPlan,
    distanceAt,
    pointInPoly,
    segmentHitsBlocked,
    pathBlocked,
    faceFromHeading,
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
    ticketFrom,
    shortName
  };
});
