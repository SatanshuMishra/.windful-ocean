export function unique(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("unique expects an array");
  }
  return [...new Set(values)];
}

export function chunk(values, size) {
  if (!Array.isArray(values)) {
    throw new TypeError("chunk expects an array");
  }
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("chunk expects a positive integer size");
  }
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
