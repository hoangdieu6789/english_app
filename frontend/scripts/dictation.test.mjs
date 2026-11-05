// Dictation word diff (lib/dictation.ts). Run: npm run test:dictation
import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, hint, words } from "../lib/dictation.ts";

const kinds = (r) => r.tokens.map((t) => (t.kind === "extra" ? `+${t.typed}` : t.kind === "ok" ? t.word : `${t.kind}:${t.word}${t.kind === "wrong" ? `/${t.typed}` : ""}`)).join(" ");

test("perfect line: case, punctuation and quotes do not count", () => {
  const r = compare("Honestly, I love it — it’s great!", "honestly i love it it's great");
  assert.equal(r.accuracy, 100);
  assert.equal(r.correct, r.total);
});

test("wrong, missing and extra words", () => {
  const r = compare("I work from home three days a week.", "I walk from home three day a week now");
  assert.equal(kinds(r), "I wrong:work/walk from home three wrong:days/day a week +now");
  assert.equal(r.total, 8);
  assert.equal(r.correct, 6);
  assert.equal(r.accuracy, 75);
  const m = compare("We save time and money.", "We save money.");
  assert.equal(kinds(m), "We save missing:time missing:and money");
});

test("numbers and contractions match their other form", () => {
  assert.equal(compare("I have 3 cats.", "I have three cats").accuracy, 100);
  const c = compare("I don't know.", "I do not know");
  assert.equal(c.accuracy, 100);
  assert.equal(kinds(c), "I don't know"); // the contraction is shown once
  // a half-right contraction is wrong once, not twice
  const r = compare("I don't know.", "I do know");
  assert.equal(r.total, 3);
  assert.equal(r.correct, 2);
});

test("empty input scores zero, words() drops punctuation-only tokens", () => {
  assert.equal(compare("Hello there.", "").accuracy, 0);
  assert.deepEqual(words("Well — okay!").map((w) => w.key), ["well", "okay"]);
});

test("hint keeps first letters", () => {
  assert.equal(hint("I want to go, now."), "I w___ t_ g_, n__.");
});
