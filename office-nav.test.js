/* Node tests for HQ station map, status comparison, and event diffs. */
const nav = require("./office-nav.js");
const assert = require("assert");

(function seatsExist() {
  ["coord", "deep", "cluster", "watch", "lab"].forEach((id) => {
    const s = nav.STATIONS[id];
    assert.ok(s && s.seat && Number.isFinite(s.seat.x) && Number.isFinite(s.seat.y), id + " needs a seat");
    assert.ok(s.companion && Number.isFinite(s.companion.dx), id + " needs companion offset");
  });
})();

(function walkApisRemoved() {
  assert.strictEqual(typeof nav.findPath, "undefined");
  assert.strictEqual(typeof nav.travelPlan, "undefined");
  assert.strictEqual(typeof nav.pathFromPoint, "undefined");
  assert.strictEqual(typeof nav.chamfer, "undefined");
  assert.ok(!nav.EDGES, "waypoint edges must not ship with the command center");
  assert.ok(!nav.NODES, "walk node graph must not ship with the command center");
})();

(function routesConnectStations() {
  assert.ok(nav.ROUTES.length >= 6, "need reporting + handoff traces");
  nav.ROUTES.forEach((r) => {
    assert.ok(nav.STATIONS[r.a] && nav.STATIONS[r.b], r.id + " must connect known stations");
    assert.ok(/^M /.test(r.d), r.id + " needs an SVG path");
  });
  const deep = nav.findRoute("coord", "deep");
  assert.ok(deep && deep.route && deep.reverse === false);
  const back = nav.findRoute("deep", "coord");
  assert.ok(back && back.route.id === deep.route.id && back.reverse === true);
})();

(function unchangedStatus() {
  const a = { id: "coord", state: "working", task: "Coordinate", desk: 0, stage: "A", progress: 0.4 };
  const b = { id: "coord", state: "working", task: "Coordinate", desk: 0, stage: "B", progress: 0.9 };
  assert.ok(nav.semanticEqual(a, b), "stage/progress-only must not count as a move");
  const c = { id: "coord", state: "done", task: "Coordinate", desk: 0 };
  assert.ok(!nav.semanticEqual(a, c), "state change is semantic");
})();

(function stationsUnchangedArray() {
  const a = [{ id: "coord", state: "working", task: "T", desk: 0, stage: "old" }];
  const b = [{ id: "coord", state: "working", task: "T", desk: 0, stage: "new" }];
  assert.ok(nav.stationsEqual(a, b));
})();

(function identicalDiffIsEmpty() {
  const row = { id: "coord", state: "working", task: "Coordinate", desk: 0, stage: "A", progress: 0.4 };
  assert.deepStrictEqual(nav.diffEvents([row], [{ ...row, progress: 0.9, stage: "B" }]), []);
})();

(function assignmentAndHandoff() {
  const prev = [
    { id: "coord", state: "working", task: "Coordinate", desk: 0 },
    { id: "deep", state: "idle", task: "", desk: 1 }
  ];
  const assigned = [
    { id: "coord", state: "working", task: "Coordinate", desk: 0 },
    { id: "deep", state: "working", task: "Watchlist packet review", desk: 1 }
  ];
  const ev = nav.diffEvents(prev, assigned);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].type, "assigned");
  assert.strictEqual(ev[0].from, "coord");
  assert.strictEqual(ev[0].to, "deep");

  const handed = [
    { id: "coord", state: "working", task: "Coordinate", desk: 0 },
    { id: "deep", state: "idle", task: "", desk: 1 },
    { id: "cluster", state: "working", task: "Watchlist packet review", desk: 2 }
  ];
  const prev2 = assigned.concat([{ id: "cluster", state: "idle", task: "", desk: 2 }]);
  const hv = nav.diffEvents(prev2, handed);
  const hand = hv.find((e) => e.type === "handoff");
  assert.ok(hand, "task moving between agents is a handoff");
  assert.strictEqual(hand.from, "deep");
  assert.strictEqual(hand.to, "cluster");
})();

(function completionApprovalBlockFail() {
  const base = { id: "lab", task: "Archive release", desk: 4 };
  assert.strictEqual(nav.diffEvents([{ ...base, state: "working" }], [{ ...base, state: "done" }])[0].type, "completed");
  assert.strictEqual(
    nav.diffEvents([{ ...base, state: "working" }], [{ ...base, state: "working", stage: "Awaiting approval" }])[0].type,
    "approval"
  );
  assert.strictEqual(nav.diffEvents([{ ...base, state: "working" }], [{ ...base, state: "blocked", stage: "Missing input" }])[0].type, "blocked");
  assert.strictEqual(nav.diffEvents([{ ...base, state: "working" }], [{ ...base, state: "failed", stage: "Tool error" }])[0].type, "failed");
  assert.strictEqual(
    nav.diffEvents([{ ...base, state: "working" }], [{ ...base, state: "working", stage: "running tool: indexer" }])[0].type,
    "tool_started"
  );
})();

(function deriveAndNeedsYou() {
  assert.strictEqual(nav.deriveAgentStatus({ state: "working", task: "X" }), "working");
  assert.strictEqual(nav.deriveAgentStatus({ state: "done" }), "done");
  assert.strictEqual(nav.deriveAgentStatus({ state: "working", stage: "reading source packet" }), "reading");
  const items = nav.needsYouItems([
    {
      id: "coord",
      character: "New Bot",
      state: "working",
      progress: 0.9,
      task: "Coordinate + report to Jack",
      stage: "Deep brief ready"
    }
  ]);
  assert.ok(items.some((it) => it.kind === "approval"), "high-progress coordinator report needs a human");
})();

(function metricsFromLiveShape() {
  const m = nav.commandMetrics([
    { id: "coord", state: "working", task: "A", progress: 0.9 },
    { id: "deep", state: "done", task: "B", progress: 1 },
    { id: "cluster", state: "done", task: "C", progress: 1 },
    { id: "watch", state: "idle", task: "D", progress: 1 },
    { id: "lab", state: "idle", task: "E", progress: 1 }
  ], "2026-09-13T21:16:00Z");
  assert.strictEqual(m.active, 1);
  assert.strictEqual(m.completed, 4);
  assert.strictEqual(m.blocked, 0);
  assert.strictEqual(m.health, "OPERATIONAL");
  assert.strictEqual(m.updatedAt, "2026-09-13T21:16:00Z");
})();

console.log("office-nav tests ok");
