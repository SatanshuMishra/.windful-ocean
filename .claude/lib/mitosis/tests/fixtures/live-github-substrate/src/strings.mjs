export function capitalize(value) {
  if (typeof value !== "string") {
    throw new TypeError("capitalize expects a string");
  }
  if (value.length === 0) {
    return value;
  }
  return value[0].toUpperCase() + value.slice(1);
}

export function slugify(value) {
  if (typeof value !== "string") {
    throw new TypeError("slugify expects a string");
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
