export interface Logger {
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
}

function write(level: string, message: string, fields?: Record<string, unknown>): void {
  const event = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(fields ?? {})
  };
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export function createLogger(service: string): Logger {
  return {
    info: (message, fields) => write("info", message, { service, ...(fields ?? {}) }),
    warn: (message, fields) => write("warn", message, { service, ...(fields ?? {}) }),
    error: (message, fields) => write("error", message, { service, ...(fields ?? {}) })
  };
}
