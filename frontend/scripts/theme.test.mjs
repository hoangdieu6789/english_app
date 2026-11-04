// Theme rules (lib/theme/boot.ts): sunrise/sunset and dark/light per mode.
// Run: npm run test:theme  (Node >= 22.6, TypeScript stripped by Node)
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDark, sunTimes } from "../lib/theme/boot.ts";

const hanoi = { lat: 21.0, lon: 105.9 };
const at = (iso) => Date.parse(iso);
const utcHm = (ms) => new Date(ms).toISOString().slice(11, 16);

test("sunrise and sunset match published times (about a minute)", () => {
  const london = sunTimes(at("2026-06-21T12:00:00Z"), 51.5, -0.13);
  assert.equal(utcHm(london.rise), "03:43");
  assert.equal(utcHm(london.set), "20:21");
  const hn = sunTimes(at("2026-11-04T12:00:00+07:00"), hanoi.lat, hanoi.lon);
  assert.equal(utcHm(hn.rise), "23:00"); // 06:00 in Hanoi
  assert.equal(utcHm(hn.set), "10:19"); // 17:19 in Hanoi
});

test("by time: light between sunrise and sunset", () => {
  assert.equal(isDark("time", at("2026-11-04T05:30:00+07:00"), false, hanoi), true);
  assert.equal(isDark("time", at("2026-11-04T07:00:00+07:00"), false, hanoi), false);
  assert.equal(isDark("time", at("2026-11-04T17:10:00+07:00"), false, hanoi), false);
  assert.equal(isDark("time", at("2026-11-04T17:30:00+07:00"), false, hanoi), true);
});

test("polar day and night", () => {
  assert.equal(sunTimes(at("2026-12-21T12:00:00Z"), 69.6, 18.9).polar, "night");
  assert.equal(sunTimes(at("2026-06-21T12:00:00Z"), 69.6, 18.9).polar, "day");
  assert.equal(isDark("time", at("2026-06-21T23:00:00Z"), false, { lat: 69.6, lon: 18.9 }), false);
});

test("no location: light 06:00-18:00 local", () => {
  assert.equal(isDark("time", new Date(2026, 10, 4, 5).getTime(), false, null), true);
  assert.equal(isDark("time", new Date(2026, 10, 4, 12).getTime(), false, null), false);
  assert.equal(isDark("time", new Date(2026, 10, 4, 18).getTime(), false, null), true);
});

test("system, light and dark modes", () => {
  assert.equal(isDark("system", Date.now(), true, null), true);
  assert.equal(isDark("system", Date.now(), false, null), false);
  assert.equal(isDark("light", Date.now(), true, hanoi), false);
  assert.equal(isDark("dark", Date.now(), false, hanoi), true);
});
