import fs from "node:fs";
import path from "node:path";

export const RETENTION_MONTHS = 3;

export const RETENTION_REASON = "RETENTION_MONTHS is three: the observer corpus keeps the current calendar month and the two before it. The number trades readable history against how long a stored search pattern survives. A human calibrating the went_back signal reads real signatures out of the corpus, and the audit questions need a population large enough to answer, so at least two complete months plus the month in progress stay readable. A Grep or Glob pattern is stored verbatim, and one typed while hunting a leaked credential must age out rather than persist forever in an append-only log, so three months bounds any single row's life at between roughly fifty-nine and ninety-two days depending on where in its month it was written.";

export const FLOOR_REASON = "The horizon is read from the system clock, and a clock set forward by a year would turn a retention pass into a total wipe of an append-only log that has no backup. The horizon is therefore clamped to the corpus: a deletion never reaches more than RETENTION_MONTHS months below the newest month file present. On a machine in use with a correct clock the newest present month is the current month, so the clamp changes nothing, and an ancient file still ages out whenever any newer file is present, because the newer file is what sets the clamp. The clamp tracks a filename and not a trusted date, and the observer names every file from that same clock, so a clock skewed forward by RETENTION_MONTHS or more writes a filename that carries the clamp with it and the months below are removed. Closing that needs a floor persisted between passes, which this pass does not have.";

export const MONTH_FILE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])\.jsonl$/;

export const RETENTION_STATE_FILE = "retention.json";

export const REMOVED_LIST_MAX = 24;

export function monthKeyOf(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function addUtcMonths(date, delta) {
  const totalMonthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth() + delta;
  const year = Math.floor(totalMonthIndex / 12);
  const month = totalMonthIndex - year * 12;
  const result = new Date(Date.UTC(2000, month, 1));
  result.setUTCFullYear(year);
  return result;
}

export function oldestRetainedMonth(now) {
  return monthKeyOf(addUtcMonths(now, -(RETENTION_MONTHS - 1)));
}

function dateOfMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(2000, month - 1, 1));
  date.setUTCFullYear(year);
  return date;
}

function corpusFloorMonth(newestPresentMonthKey) {
  if (newestPresentMonthKey === "") {
    return "";
  }
  return monthKeyOf(addUtcMonths(dateOfMonthKey(newestPresentMonthKey), -(RETENTION_MONTHS - 1)));
}

function assertValidRoot(observerRoot) {
  if (typeof observerRoot !== "string" || observerRoot.length === 0 || !path.isAbsolute(observerRoot)) {
    throw new TypeError(
      `pruneCorpus: observerRoot must be a non-empty absolute path string, got ${JSON.stringify(observerRoot)}`,
    );
  }
}

function assertValidNow(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError(`pruneCorpus: now must be a valid Date, got ${JSON.stringify(now)}`);
  }
}

function emptyResult(horizonMonth, skipped = [], floorMonth = "") {
  return Object.freeze({
    horizon_month: horizonMonth,
    retention_months: RETENTION_MONTHS,
    floor_month: floorMonth,
    removed: Object.freeze([]),
    kept: Object.freeze([]),
    skipped: Object.freeze(skipped),
    state_written: false,
    state_error: null,
  });
}

function writeRetentionState(observerRoot, now, horizonMonth, removed, floorMonth) {
  const statePath = path.join(observerRoot, RETENTION_STATE_FILE);
  const state = {
    ran_at: now.toISOString(),
    retention_months: RETENTION_MONTHS,
    horizon_month: horizonMonth,
    reason: RETENTION_REASON,
    floor_month: floorMonth,
    floor_reason: FLOOR_REASON,
    removed: removed.slice(0, REMOVED_LIST_MAX),
  };
  try {
    fs.writeFileSync(statePath, JSON.stringify(state), { flag: "w" });
    return { state_written: true, state_error: null };
  } catch (error) {
    return { state_written: false, state_error: error.message };
  }
}

export function pruneCorpus(observerRoot, now = new Date()) {
  assertValidRoot(observerRoot);
  assertValidNow(now);

  const horizonMonth = oldestRetainedMonth(now);
  const eventsDir = path.resolve(observerRoot, "events");

  let entries;
  try {
    entries = fs.readdirSync(eventsDir, { withFileTypes: true });
  } catch {
    return emptyResult(horizonMonth);
  }

  let realEventsDir;
  try {
    realEventsDir = fs.realpathSync(eventsDir);
  } catch (error) {
    return emptyResult(horizonMonth, [
      Object.freeze({ path: eventsDir, reason: `failed to resolve events directory: ${error.message}` }),
    ]);
  }

  const skipped = [];
  const candidates = [];

  for (const dirent of entries) {
    const fullPath = path.join(eventsDir, dirent.name);

    if (!dirent.isFile()) {
      skipped.push(Object.freeze({ path: fullPath, reason: "not a regular file" }));
      continue;
    }

    if (!MONTH_FILE_PATTERN.test(dirent.name)) {
      skipped.push(Object.freeze({ path: fullPath, reason: "does not match the month file pattern" }));
      continue;
    }

    let realFilePath;
    try {
      realFilePath = fs.realpathSync(fullPath);
    } catch (error) {
      skipped.push(Object.freeze({ path: fullPath, reason: `failed to resolve real path: ${error.message}` }));
      continue;
    }

    if (path.dirname(realFilePath) !== realEventsDir) {
      skipped.push(Object.freeze({ path: fullPath, reason: "resolved target escapes the events directory" }));
      continue;
    }

    candidates.push({ fullPath, monthKey: dirent.name.slice(0, 7) });
  }

  const distinctMonthKeys = [...new Set(candidates.map((candidate) => candidate.monthKey))].sort();
  const newestPresentMonthKey = distinctMonthKeys.length > 0 ? distinctMonthKeys[distinctMonthKeys.length - 1] : "";
  const floorMonth = corpusFloorMonth(newestPresentMonthKey);

  const removed = [];
  const kept = [];

  for (const candidate of candidates) {
    const { fullPath, monthKey } = candidate;
    if (monthKey < horizonMonth && monthKey < floorMonth) {
      try {
        fs.unlinkSync(fullPath);
        removed.push(fullPath);
      } catch (error) {
        skipped.push(Object.freeze({ path: fullPath, reason: `failed to remove: ${error.message}` }));
      }
    } else {
      kept.push(fullPath);
    }
  }

  const frozenRemoved = Object.freeze(removed);
  const frozenKept = Object.freeze(kept);
  const frozenSkipped = Object.freeze(skipped.map((entry) => Object.freeze(entry)));

  let stateOutcome = { state_written: false, state_error: null };
  if (frozenRemoved.length > 0) {
    stateOutcome = writeRetentionState(observerRoot, now, horizonMonth, removed, floorMonth);
  }

  return Object.freeze({
    horizon_month: horizonMonth,
    retention_months: RETENTION_MONTHS,
    floor_month: floorMonth,
    removed: frozenRemoved,
    kept: frozenKept,
    skipped: frozenSkipped,
    state_written: stateOutcome.state_written,
    state_error: stateOutcome.state_error,
  });
}
