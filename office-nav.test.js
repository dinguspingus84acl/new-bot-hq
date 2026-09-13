/* Node tests for the HQ waypoint graph and status comparison. */
const nav = require("./office-nav.js");
const assert = require("assert");

function pathPts(from, to) {
  return nav.chamfer(nav.nodePath(from, to));
}

(function pathCoordToReport() {
  const ids = nav.findPath("coord", "report");
  assert.deepStrictEqual(ids, ["coord", "coord_ap", "west", "hub", "report"]);
  const hit = nav.pathBlocked(pathPts("coord", "report"));
  assert.strictEqual(hit, null, "coord→report must stay in aisles, hit " + (hit && hit.hit));
})();

(function pathDeepToLab() {
  const ids = nav.findPath("deep", "lab");
  assert.ok(ids.includes("gap"), "north seats reach south seats via the desk gap");
  assert.ok(!ids.includes("coord"), "must not cut the SW desk");
  const hit = nav.pathBlocked(pathPts("deep", "lab"));
  assert.strictEqual(hit, null, "deep→lab blocked by " + (hit && hit.hit));
})();

(function pathAllHomesToReport() {
  ["coord", "deep", "cluster", "watch", "lab"].forEach((id) => {
    const hit = nav.pathBlocked(pathPts(id, "report"));
    assert.strictEqual(hit, null, id + "→report hit " + (hit && hit.hit));
  });
})();

(function seatsOutsideFurniture() {
  Object.keys(nav.STATIONS).forEach((id) => {
    const seat = nav.NODES[nav.STATIONS[id].seat];
    nav.BLOCKED.forEach((b) => {
      assert.ok(!nav.pointInPoly(seat, b.poly), id + " seat inside " + b.name);
    });
  });
})();

(function unchangedStatus() {
  const a = { id: "coord", state: "working", task: "Coordinate", desk: 0, stage: "A", progress: 0.4 };
  const b = { id: "coord", state: "working", task: "Coordinate", desk: 0, stage: "B", progress: 0.9 };
  assert.ok(nav.semanticEqual(a, b), "stage/progress-only must not count as a move");
  const c = { id: "coord", state: "done", task: "Coordinate", desk: 0 };
  assert.ok(!nav.semanticEqual(a, c), "state change is semantic");
})();

(function travelPlanCaps() {
  const short = nav.travelPlan(40);
  const long = nav.travelPlan(900);
  assert.ok(short.T < 1.2, "short hops stay brief");
  assert.ok(long.v >= 90 && long.v <= 130);
  assert.ok(Math.abs(nav.distanceAt(long, 0)) < 1e-6);
  assert.ok(Math.abs(nav.distanceAt(long, long.T) - long.length) < 0.5);
  const mid = nav.distanceAt(long, long.ta + 0.2);
  const mid2 = nav.distanceAt(long, long.ta + 0.4);
  const rate = (mid2 - mid) / 0.2;
  assert.ok(Math.abs(rate - long.v) < 1, "mid-route speed should be cruise");
})();

(function stationsUnchangedArray() {
  const a = [{ id: "coord", state: "working", task: "T", desk: 0, stage: "old" }];
  const b = [{ id: "coord", state: "working", task: "T", desk: 0, stage: "new" }];
  assert.ok(nav.stationsEqual(a, b));
})();

console.log("office-nav tests ok");
