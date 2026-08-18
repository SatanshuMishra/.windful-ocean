import test from "node:test";
import assert from "node:assert/strict";
import { toIsoDate, addDays } from "../src/dates.mjs";

test("toIsoDate formats a Date as YYYY-MM-DD", () => {
  assert.equal(toIsoDate(new Date("2026-08-17T12:34:56.000Z")), "2026-08-17");
});

test("toIsoDate accepts an ISO string", () => {
  assert.equal(toIsoDate("2020-01-02T00:00:00.000Z"), "2020-01-02");
});

test("toIsoDate rejects an invalid date", () => {
  assert.throws(() => toIsoDate("not-a-date"), TypeError);
});

test("addDays moves the date forward", () => {
  assert.equal(toIsoDate(addDays(new Date("2026-08-17T00:00:00.000Z"), 5)), "2026-08-22");
});

test("addDays moves the date backward", () => {
  assert.equal(toIsoDate(addDays(new Date("2026-01-01T00:00:00.000Z"), -1)), "2025-12-31");
});

test("addDays does not mutate its input", () => {
  const input = new Date("2026-08-17T00:00:00.000Z");
  addDays(input, 10);
  assert.equal(input.toISOString(), "2026-08-17T00:00:00.000Z");
});

test("addDays rejects a non-integer offset", () => {
  assert.throws(() => addDays(new Date(), 1.5), TypeError);
});
