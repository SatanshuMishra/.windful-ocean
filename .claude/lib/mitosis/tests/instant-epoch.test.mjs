import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, epochMsFromCivil, epochMsFromIso } from '../instant-epoch.mjs';

test('DAY_MS is exactly the millisecond count of one civil day', () => {
  assert.equal(DAY_MS, 24 * 60 * 60 * 1000);
});

test('epochMsFromCivil agrees with Date.UTC on the last real day of every month in a non-leap year', () => {
  const NON_LEAP_YEAR = 2025;
  const lastDayByMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let month = 1; month <= 12; month += 1) {
    const day = lastDayByMonth[month - 1];
    const expected = Date.UTC(NON_LEAP_YEAR, month - 1, day);
    assert.equal(
      epochMsFromCivil(NON_LEAP_YEAR, month, day),
      expected,
      `month ${month} day ${day} did not match the independent Date.UTC oracle`,
    );
  }
});

test('epochMsFromCivil refuses the day immediately past the real end of every month in a non-leap year', () => {
  const NON_LEAP_YEAR = 2025;
  const lastDayByMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let month = 1; month <= 12; month += 1) {
    const oneDayPastEnd = lastDayByMonth[month - 1] + 1;
    assert.equal(
      epochMsFromCivil(NON_LEAP_YEAR, month, oneDayPastEnd),
      null,
      `month ${month} accepted day ${oneDayPastEnd}, one past its real length`,
    );
  }
});

test('a year divisible by 4 but not by 100 is a leap year, so February carries a 29th', () => {
  assert.equal(epochMsFromCivil(2024, 2, 29), Date.UTC(2024, 1, 29));
});

test('a year not divisible by 4 is not a leap year, so February refuses a 29th', () => {
  assert.equal(epochMsFromCivil(2023, 2, 29), null);
});

test('a year divisible by 100 but not by 400 is not a leap year, so February refuses a 29th', () => {
  assert.equal(epochMsFromCivil(1900, 2, 29), null);
});

test('a year divisible by 400 is a leap year, so February carries a 29th', () => {
  assert.equal(epochMsFromCivil(2000, 2, 29), Date.UTC(2000, 1, 29));
});

test('epochMsFromIso on a bare Z instant matches the independent Date.UTC oracle', () => {
  assert.equal(epochMsFromIso('2026-08-15T12:00:00Z'), Date.UTC(2026, 7, 15, 12, 0, 0));
});

test('epochMsFromIso on a positive offset resolves to the same instant as the equivalent Z form', () => {
  assert.equal(epochMsFromIso('2026-08-15T14:00:00+02:00'), epochMsFromIso('2026-08-15T12:00:00Z'));
});

test('epochMsFromIso on a negative offset resolves to the same instant as the equivalent Z form', () => {
  assert.equal(epochMsFromIso('2026-08-15T06:30:00-05:30'), epochMsFromIso('2026-08-15T12:00:00Z'));
});

test('epochMsFromIso on a positive offset that crosses midnight into the next civil day still resolves correctly', () => {
  assert.equal(epochMsFromIso('2026-08-16T01:00:00+02:00'), epochMsFromIso('2026-08-15T23:00:00Z'));
});

test('epochMsFromIso refuses an offset whose hour field is not a real UTC offset hour', () => {
  assert.equal(epochMsFromIso('2026-08-15T12:00:00+24:00'), null);
});

test('epochMsFromIso refuses an offset whose minute field is not a real UTC offset minute', () => {
  assert.equal(epochMsFromIso('2026-08-15T12:00:00+02:60'), null);
});

test('epochMsFromIso truncates a fractional-second field longer than three digits to millisecond precision', () => {
  assert.equal(epochMsFromIso('2026-08-15T12:00:00.123456789Z'), Date.UTC(2026, 7, 15, 12, 0, 0, 123));
});

test('epochMsFromIso on a date carrying no time component is midnight UTC that day', () => {
  assert.equal(epochMsFromIso('2026-08-15'), Date.UTC(2026, 7, 15));
});

test('epochMsFromIso refuses text that is not shaped like an ISO instant', () => {
  assert.equal(epochMsFromIso('not-a-date'), null);
  assert.equal(epochMsFromIso(''), null);
  assert.equal(epochMsFromIso(null), null);
});
