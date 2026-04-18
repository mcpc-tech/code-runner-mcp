/**
 * Logging utility with silent mode support.
 *
 * Set `log.silent = true` to suppress all console output.
 * Useful when running as an MCP server where console noise
 * can interfere with the protocol or simply isn't needed.
 */

export interface Logger {
  /** Whether console output is suppressed. */
  silent: boolean;
  /** Log to console (unless silent). */
  log(...args: unknown[]): void;
  /** Log error to console (unless silent). */
  error(...args: unknown[]): void;
  /** Log warning to console (unless silent). */
  warn(...args: unknown[]): void;
  /** Log info to console (unless silent). */
  info(...args: unknown[]): void;
  /** Log debug to console (unless silent). */
  debug(...args: unknown[]): void;
}

let _silent = false;

export const log: Logger = {
  get silent(): boolean {
    return _silent;
  },
  set silent(value: boolean) {
    _silent = value;
  },
  log(...args: unknown[]): void {
    if (!_silent) console.log(...args);
  },
  error(...args: unknown[]): void {
    if (!_silent) console.error(...args);
  },
  warn(...args: unknown[]): void {
    if (!_silent) console.warn(...args);
  },
  info(...args: unknown[]): void {
    if (!_silent) console.info(...args);
  },
  debug(...args: unknown[]): void {
    if (!_silent) console.debug(...args);
  },
};
