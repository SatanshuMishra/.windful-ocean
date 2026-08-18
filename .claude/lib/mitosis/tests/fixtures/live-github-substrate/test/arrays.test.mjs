import test from "node:test";
import assert from "node:assert/strict";
import { unique, chunk } from "../src/arrays.mjs";

test("unique drops duplicates and preserves order", () => {
  assert.deepEqual(unique([3, 1, 3, 2, 1]), [3, 1, 2]);
});

test("unique does not mutate its input", () => {
  const input = [1, 1, 2];
  unique(input);
  assert.deepEqual(input, [1, 1, 2]);
});

test("unique rejects a non-array", () => {
  assert.throws(() => unique("abc"), TypeError);
});

test("chunk splits into fixed-size groups", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("chunk of an empty array is empty", () => {
  assert.deepEqual(chunk([], 3), []);
});

test("chunk rejects a non-positive size", () => {
  assert.throws(() => chunk([1, 2], 0), RangeError);
});

test("chunk rejects a non-array", () => {
  assert.throws(() => chunk(null, 2), TypeError);
});
