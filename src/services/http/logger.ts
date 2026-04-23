type LogLevel = "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

export function log(level: LogLevel, message: string, meta: LogMeta = {}) {
  const payload = {
    level,
    message,
    ts: new Date().toISOString(),
    ...meta
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
