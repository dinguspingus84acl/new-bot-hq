/* New Bot HQ — waypoint graph, pathfinding, and status comparison.
   Coordinates are percent of the 1280×720 office image (foot positions).
   Loaded before office-sim.js; also runnable under Node for tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OfficeNav = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NATIVE_W = 1280;
  const NATIVE_H = 720;

  const NODES = {
    hub: { x: 45.0, y: 76.0 },
    mid: { x: 45.0, y: 64.0 },
    gap: { x: 45.0, y: 52.0 },
    cross: { x: 45.0, y: 44.0 },
    west: { x: 20.5, y: 76.0 },
    east: { x: 72.0, y: 76.0 },
    nw: { x: 30.0, y: 44.0 },
    ne: { x: 68.0, y: 44.0 },
    report: { x: 45.0, y: 67.5 },
    report_b: { x: 41.6, y: 70.0 },
    report_c: { x: 48.4, y: 70.0 },
    lounge: { x: 17.5, y: 34.5 },
    lounge_ap: { x: 22.5, y: 43.0 },

    coord_ap: { x: 27.6, y: 69.0 },
    coord: { x: 27.6, y: 59.8, face: "right", home: true },
    deep_ap: { x: 39.8, y: 43.6 },
    deep: { x: 39.8, y: 35.2, face: "right", home: true },
    cluster_ap: { x: 55.4, y: 43.6 },
    cluster: { x: 55.4, y: 33.6, face: "left", home: true },
    watch_ap: { x: 71.2, y: 43.6 },
    watch: { x: 71.2, y: 33.8, face: "left", home: true },
    lab_ap: { x: 63.0, y: 68.4 },
    lab: { x: 63.0, y: 57.6, face: "left", home: true }
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

  const STATIONS = {
    coord: {
      seat: "coord",
      approach: "coord_ap",
      companion: { dx: 2.05, dy: 1.9 },
      overflow: { dx: 3.4, dy: 3.2 },
      face: "right"
    },
    deep: {
      seat: "deep",
      approach: "deep_ap",
      companion: { dx: 2.0, dy: 2.05 },
      overflow: { dx: 3.3, dy: 3.4 },
      face: "right"
    },
    cluster: {
      seat: "cluster",
      approach: "cluster_ap",
      companion: { dx: -2.05, dy: 2.05 },
      overflow: { dx: -3.4, dy: 3.4 },
      face: "left"
    },
    watch: {
      seat: "watch",
      approach: "watch_ap",
      companion: { dx: -2.1, dy: 2.1 },
      overflow: { dx: -3.5, dy: 3.5 },
      face: "left"
    },
    lab: {
      seat: "lab",
      approach: "lab_ap",
      companion: { dx: -2.05, dy: 1.9 },
      overflow: { dx: -3.4, dy: 3.2 },
      face: "left"
    }
  };

  const DESK_INDEX = ["coord", "deep", "cluster", "watch", "lab"];

  /* Restricted furniture in image-percent space. Used to author/verify
     routes — walkers stay on the graph instead of crossing these. */
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

  const adj = {};
  Object.keys(NODES).forEach((id) => (adj[id] = []));
  EDGES.forEach(([a, b]) => {
    adj[a].push(b);
    adj[b].push(a);
  });

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

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

  /* Near-constant mid-route speed; 100–160ms ease-out at go, ease-in at stop. */
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

  function stationIdFor(station, idx) {
    if (station && STATIONS[station.id]) return station.id;
    const n = Number.isFinite(station && station.desk) ? station.desk : idx || 0;
    return DESK_INDEX[((n % DESK_INDEX.length) + DESK_INDEX.length) % DESK_INDEX.length];
  }

  function destIdFor(station) {
    if (station && station.destination && NODES[station.destination]) return station.destination;
    return stationIdFor(station);
  }

  function companionPoint(stationId, occupied) {
    const spec = STATIONS[stationId] || STATIONS.coord;
    const seat = NODES[spec.seat];
    const off = occupied ? spec.overflow : spec.companion;
    return { x: seat.x + off.dx, y: seat.y + off.dy, face: spec.face };
  }

  function reportSlot(index) {
    const ids = ["report", "report_b", "report_c"];
    return ids[index % ids.length];
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

  function faceFromHeading(h, fallback) {
    if (!h || Math.abs(h.x) < 0.12 && Math.abs(h.y) >= Math.abs(h.x)) return fallback || "right";
    return h.x < 0 ? "left" : "right";
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  return {
    NATIVE_W,
    NATIVE_H,
    NODES,
    EDGES,
    STATIONS,
    DESK_INDEX,
    BLOCKED,
    OCCLUDERS,
    adj,
    clamp,
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
    stationIdFor,
    destIdFor,
    companionPoint,
    reportSlot,
    normalizeStation,
    semanticEqual,
    stationsEqual,
    faceFromHeading,
    rand
  };
});
