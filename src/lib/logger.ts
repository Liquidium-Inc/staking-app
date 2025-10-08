export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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

export const logger = {
  debug: (...args: Parameters<typeof console.debug>) =>
    shouldLog('debug') && console.debug('[debug]', ...args),
  info: (...args: Parameters<typeof console.info>) =>
    shouldLog('info') && console.info('[info]', ...args),
  warn: (...args: Parameters<typeof console.warn>) =>
    shouldLog('warn') && console.warn('[warn]', ...args),
  error: (...args: Parameters<typeof console.error>) =>
    shouldLog('error') && console.error('[error]', ...args),
};
