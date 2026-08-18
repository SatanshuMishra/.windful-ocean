import test from "node:test";
import assert from "node:assert/strict";
import { capitalize, slugify } from "../src/strings.mjs";

test("capitalize uppercases the first character", () => {
  assert.equal(capitalize("hello"), "Hello");
});

test("capitalize returns an empty string unchanged", () => {
  assert.equal(capitalize(""), "");
});

test("capitalize rejects a non-string", () => {
  assert.throws(() => capitalize(7), TypeError);
});

test("slugify lowercases and hyphenates", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

test("slugify strips leading and trailing separators", () => {
  assert.equal(slugify("  --Mitosis E2E!!  "), "mitosis-e2e");
});

test("slugify rejects a non-string", () => {
  assert.throws(() => slugify(null), TypeError);
});
