export const DAY_MS = 86400000;

const MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];
}

function daysFromCivil(year, month, day) {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function epochMsFromCivil(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return daysFromCivil(year, month, day) * DAY_MS;
}

const ISO_INSTANT_SHAPE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function offsetMinutesOf(zone) {
  if (zone === undefined || zone === 'Z') return 0;
  const sign = zone[0] === '-' ? -1 : 1;
  const zoneHours = Number(zone.slice(1, 3));
  const zoneMinutes = Number(zone.slice(4, 6));
  if (zoneHours > 23 || zoneMinutes > 59) return null;
  return sign * (zoneHours * 60 + zoneMinutes);
}

export function epochMsFromIso(text) {
  const match = ISO_INSTANT_SHAPE.exec(String(text ?? ''));
  if (match === null) return null;
  const midnight = epochMsFromCivil(Number(match[1]), Number(match[2]), Number(match[3]));
  if (midnight === null) return null;
  const hours = match[4] === undefined ? 0 : Number(match[4]);
  const minutes = match[5] === undefined ? 0 : Number(match[5]);
  const seconds = match[6] === undefined ? 0 : Number(match[6]);
  const millis = match[7] === undefined ? 0 : Number(match[7].slice(0, 3).padEnd(3, '0'));
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const offsetMinutes = offsetMinutesOf(match[8]);
  if (offsetMinutes === null) return null;
  return midnight + hours * 3600000 + minutes * 60000 + seconds * 1000 + millis - offsetMinutes * 60000;
}
