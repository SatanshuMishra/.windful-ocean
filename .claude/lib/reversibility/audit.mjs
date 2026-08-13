import { appendFileSync, mkdirSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export function auditRecord(fields) {
  return Object.freeze({ ts: new Date().toISOString(), ...fields });
}

export function appendAudit(record, config) {
  const line = `${JSON.stringify(record)}\n`;
  try {
    mkdirSync(dirname(config.auditLogPath), { recursive: true });
    appendFileSync(config.auditLogPath, line);
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    try {
      writeSync(2, `reversibility audit log unavailable (${detail}): ${line}`);
    } catch {
      return { ok: false, error: detail };
    }
    return { ok: false, error: detail };
  }
}
