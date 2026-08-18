import test from "node:test";
import assert from "node:assert/strict";
import { clamp, sum } from "../src/numbers.mjs";

test("clamp returns the value when it is inside the range", () => {
  assert.equal(clamp(5, 0, 10), 5);
});

test("clamp pins to the bounds", () => {
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(42, 0, 10), 10);
});

test("clamp rejects an inverted range", () => {
  assert.throws(() => clamp(1, 10, 0), RangeError);
});

test("clamp rejects a non-finite value", () => {
  assert.throws(() => clamp(Number.NaN, 0, 10), TypeError);
});

test("sum adds every element", () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
});

test("sum of an empty array is zero", () => {
  assert.equal(sum([]), 0);
});

test("sum rejects a non-array", () => {
  assert.throws(() => sum("123"), TypeError);
});

test("sum rejects a non-finite element", () => {
  assert.throws(() => sum([1, Number.POSITIVE_INFINITY]), TypeError);
});
