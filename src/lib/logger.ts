export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const CIRCULAR_REFERENCE_MARKER = '[Circular]';

// Basic logger wrapper. In development, all levels are printed. In production, only `info` and above.
const getLogLevelPriority = (level: LogLevel): number => {
  switch (level) {
    case 'debug':
      return 0;
    case 'info':
      return 1;
    case 'warn':
      return 2;
    case 'error':
      return 3;
    default:
      return 1;
  }
};

const currentLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

const shouldLog = (level: LogLevel) =>
  getLogLevelPriority(level) >= getLogLevelPriority(currentLevel);

function sanitizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    const error = value as Error & { code?: unknown; status?: unknown };
    return {
      name: error.name,
      message: error.message,
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return CIRCULAR_REFERENCE_MARKER;
  seen.add(value);

  try {
    if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, seen));

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeLogValue(item, seen)]),
    );
  } finally {
    seen.delete(value);
  }
}

const sanitizeLogArgs = (args: unknown[]) => args.map((arg) => sanitizeLogValue(arg));

export const logger = {
  debug: (...args: unknown[]) =>
    shouldLog('debug') && console.debug('[debug]', ...sanitizeLogArgs(args)),
  info: (...args: unknown[]) =>
    shouldLog('info') && console.info('[info]', ...sanitizeLogArgs(args)),
  warn: (...args: unknown[]) =>
    shouldLog('warn') && console.warn('[warn]', ...sanitizeLogArgs(args)),
  error: (...args: unknown[]) =>
    shouldLog('error') && console.error('[error]', ...sanitizeLogArgs(args)),
};
