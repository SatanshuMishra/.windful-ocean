export function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("toIsoDate expects a valid date");
  }
  return date.toISOString().slice(0, 10);
}

export function addDays(value, days) {
  if (!Number.isInteger(days)) {
    throw new TypeError("addDays expects an integer number of days");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("addDays expects a valid date");
  }
  return new Date(date.getTime() + days * 86400000);
}
