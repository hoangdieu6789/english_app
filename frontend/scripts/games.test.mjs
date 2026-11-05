// Vocabulary games logic (lib/games). Run: npm run test:games
import { test } from "node:test";
import assert from "node:assert/strict";
import { choices, lastAnswers, points, shuffle } from "../lib/games/core.ts";
import { answer, dueRetry, startClimb, LEVELS } from "../lib/games/level-climb.ts";

const card = (id, word, meaning, pos = "noun") => ({ id, word, meaning, pos, band: 5, ipa: "", exampleEn: "", exampleTranslation: "", missed: false });
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test("shuffle keeps every item", () => {
  const xs = [1, 2, 3, 4, 5, 6];
  assert.deepEqual([...shuffle(xs, seeded(7))].sort(), xs);
});

test("choices: the answer, same part of speech first, no duplicate text", () => {
  const ans = card("a", "house", "ngôi nhà");
  const pool = [
    card("b", "home", "ngôi nhà"), // same meaning as the answer: never a choice
    card("c", "run", "chạy", "verb"),
    card("d", "car", "xe hơi"),
    card("e", "tree", "cây"),
    card("f", "book", "sách"),
    card("g", "lamp", "xe hơi"), // same meaning as d: one of them only
    card("a", "house", "ngôi nhà"), // the answer itself
  ];
  for (let s = 1; s < 30; s++) {
    const cs = choices(ans, pool, 4, "word", seeded(s));
    assert.equal(cs.length, 4);
    assert.ok(cs.some((c) => c.id === "a"));
    assert.ok(!cs.some((c) => c.id === "b"));
    assert.ok(!cs.some((c) => c.id === "c"), "nouns are enough, no verb");
    assert.equal(new Set(cs.map((c) => c.meaning)).size, 4);
  }
  // A small pool gives fewer choices instead of duplicates.
  assert.equal(choices(ans, [card("x", "dog", "chó")], 4).length, 2);
});

test("points grow with the combo, capped", () => {
  assert.equal(points(0), 10);
  assert.equal(points(3), 16);
  assert.equal(points(50), 30);
});

test("lastAnswers: a word answered wrongly once stays wrong", () => {
  const got = lastAnswers([
    { wordId: "a", correct: false },
    { wordId: "b", correct: true },
    { wordId: "a", correct: true },
  ]);
  assert.deepEqual(got, [
    { wordId: "a", correct: false },
    { wordId: "b", correct: true },
  ]);
});

test("level climb: placement jumps 6, then 3 right = +1, wrong = -1", () => {
  const w = card("w", "x", "y");
  let s = startClimb(20, false);
  s = answer(s, w, true); // 26
  s = answer(s, w, true); // 32
  s = answer(s, w, false); // 26
  s = answer(s, w, true); // 32, placed
  assert.equal(s.level, 32);
  assert.equal(s.placementLeft, 0);
  s = answer(s, w, true);
  s = answer(s, w, true);
  assert.equal(s.level, 32);
  s = answer(s, w, true);
  assert.equal(s.level, 33);
  s = answer(s, w, false);
  assert.equal(s.level, 32);
  assert.equal(s.best, 33);
});

test("level climb: limits 1..60", () => {
  const w = card("w", "x", "y");
  let s = startClimb(58, false);
  for (let i = 0; i < 4; i++) s = answer(s, w, true);
  assert.equal(s.level, LEVELS);
  s = startClimb(2, true);
  s = answer(s, w, false);
  s = answer(s, w, false);
  assert.equal(s.level, 1);
});

test("level climb: a wrong word comes back 3 questions later", () => {
  const a = card("a", "a", "1");
  const b = card("b", "b", "2");
  let s = startClimb(10, true);
  s = answer(s, a, false); // turn 1, due at turn 4
  assert.equal(dueRetry(s), null);
  s = answer(s, b, true);
  s = answer(s, b, true);
  assert.equal(dueRetry(s), null);
  s = answer(s, b, true); // turn 4
  assert.equal(dueRetry(s)?.id, "a");
  s = answer(s, a, true);
  assert.equal(dueRetry(s), null);
  assert.equal(s.retry.length, 0);
});
