# toolkit

A small, dependency-free ESM utility library for Node.js. It exists as a disposable target substrate for end-to-end runs of the mitosis engine; it is not published and carries no stability guarantee.

## Requirements

Node.js 22 or newer. There are no runtime or development dependencies, so no install step is required.

## Layout

| Path | Contents |
| --- | --- |
| `index.mjs` | Re-exports every public function from the four modules |
| `src/strings.mjs` | `capitalize`, `slugify` |
| `src/numbers.mjs` | `clamp`, `sum` |
| `src/arrays.mjs` | `unique`, `chunk` |
| `src/dates.mjs` | `toIsoDate`, `addDays` |
| `test/` | One `node:test` file per module |

## API

### strings

- `capitalize(value)` returns `value` with its first character uppercased. Throws `TypeError` when `value` is not a string.
- `slugify(value)` lowercases `value`, collapses every run of non-alphanumeric characters to a single hyphen, and trims leading and trailing hyphens. Throws `TypeError` when `value` is not a string.

### numbers

- `clamp(value, min, max)` returns `value` pinned to the inclusive range. Throws `TypeError` on a non-finite argument and `RangeError` when `min > max`.
- `sum(values)` returns the total of an array of finite numbers, `0` for an empty array. Throws `TypeError` on a non-array or a non-finite element.

### arrays

- `unique(values)` returns a new array with duplicates removed, first-occurrence order preserved. Throws `TypeError` on a non-array.
- `chunk(values, size)` returns a new array of `size`-length slices, the final slice possibly shorter. Throws `TypeError` on a non-array and `RangeError` when `size` is not a positive integer.

### dates

- `toIsoDate(value)` accepts a `Date` or anything the `Date` constructor accepts and returns the `YYYY-MM-DD` portion of its ISO representation. Throws `TypeError` on an invalid date.
- `addDays(value, days)` returns a new `Date` offset by an integer number of days, leaving the input untouched. Throws `TypeError` on an invalid date or a non-integer offset.

Every function returns a new value; nothing in this library mutates its arguments.

## Usage

```js
import { slugify, chunk, addDays } from "toolkit";

slugify("Hello World");
chunk([1, 2, 3, 4, 5], 2);
addDays(new Date("2026-08-17T00:00:00.000Z"), 5);
```

## Testing

```sh
npm test
```

Runs the `node:test` suite over `test/**/*.test.mjs`. For the lcov report consumed by the receipts G13 gate:

```sh
npm run coverage
```

## CI

- `.github/workflows/ci.yml` runs `npm test` on every push and pull request.
- `.github/workflows/receipts.yml` runs the receipts enforcer on pull requests, configured by `receipts.config.json`.
