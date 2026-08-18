export function clamp(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new TypeError("clamp expects finite numbers");
  }
  if (min > max) {
    throw new RangeError("clamp expects min to be less than or equal to max");
  }
  return Math.min(Math.max(value, min), max);
}

export function sum(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("sum expects an array");
  }
  return values.reduce((total, value) => {
    if (!Number.isFinite(value)) {
      throw new TypeError("sum expects an array of finite numbers");
    }
    return total + value;
  }, 0);
}
