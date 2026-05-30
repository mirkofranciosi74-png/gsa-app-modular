import { appendFileSync, existsSync, mkdirSync, unlinkSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir   = dirname(fileURLToPath(import.meta.url));
export const LOG_DIR  = resolve(process.env.LOG_PATH || join(__dir, "..", "..", "..", "logs"));
export const LOG_FILE = join(LOG_DIR, "app.log");

let enabled = process.env.LOG_ENABLED === "true";

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

export function isEnabled() { return enabled; }

export function setEnabled(v) {
  enabled = !!v;
  if (enabled) _write("system", "Logging attivato");
  return enabled;
}

function _write(level, msg, data) {
  const line = JSON.stringify({
    ts: new Date().toISOString(), level, msg,
    ...(data !== undefined ? { data } : {}),
  }) + "\n";
  try { appendFileSync(LOG_FILE, line); } catch {}
}

export function log(level, msg, data) {
  if (!enabled) return;
  _write(level, msg, data);
}

export function clearLog() {
  try { if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE); } catch {}
}

export function logExists() { return existsSync(LOG_FILE); }

export function logSize() {
  try { return existsSync(LOG_FILE) ? statSync(LOG_FILE).size : 0; }
  catch { return 0; }
}
