// Progress chart range (lib/progress-range.ts). Run: npm run test:progress
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartRange } from "../lib/progress-range.ts";

const p = (start, accuracy) => ({ start, accuracy, fluency: accuracy + 1 });

test("no practice: no chart", () => {
  assert.equal(chartRange("2026-11-04", "", [], []), null);
});

test("2 days of practice: 2 daily points", () => {
  const r = chartRange("2026-11-04", "2026-11-03", [p("2026-11-03", 90), p("2026-11-04", 95)], []);
  assert.equal(r.unit, "day");
  assert.deepEqual(r.keys, ["2026-11-03", "2026-11-04"]);
  assert.deepEqual(r.accuracy, [90, 95]);
});

test("first day today: 1 point", () => {
  const r = chartRange("2026-11-04", "2026-11-04", [p("2026-11-04", 80)], []);
  assert.deepEqual(r.keys, ["2026-11-04"]);
});

test("14 days: daily with gaps; 15 days: weekly", () => {
  const d = chartRange("2026-11-14", "2026-11-01", [p("2026-11-01", 70), p("2026-11-14", 90)], []);
  assert.equal(d.unit, "day");
  assert.equal(d.keys.length, 14);
  assert.equal(d.accuracy[1], null);
  const w = chartRange("2026-11-15", "2026-11-01", [], [p("2026-10-26", 70), p("2026-11-09", 90)]);
  assert.equal(w.unit, "week");
  assert.deepEqual(w.keys, ["2026-10-26", "2026-11-02", "2026-11-09"]);
  assert.deepEqual(w.accuracy, [70, null, 90]);
});

test("months of practice: at most 10 latest weeks", () => {
  const w = chartRange("2026-11-04", "2026-03-01", [], [p("2026-11-02", 88)]);
  assert.equal(w.unit, "week");
  assert.equal(w.keys.length, 10);
  assert.equal(w.keys[0], "2026-08-31");
  assert.equal(w.keys[9], "2026-11-02");
  assert.equal(w.accuracy[9], 88);
});
