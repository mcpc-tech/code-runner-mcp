/**
 * Logging utility with silent mode support.
 *
 * When the `SILENT` environment variable is set to "true" or "1",
 * all console output is suppressed. This is useful when running as
 * an MCP server where console noise can interfere with the protocol
 * or simply isn't needed.
 */

const isSilent = typeof process !== "undefined" &&
  (process.env.SILENT === "true" || process.env.SILENT === "1");

function noop(..._args: unknown[]): void {}

export const log = isSilent
  ? noop
  : (...args: unknown[]) => console.log(...args);
export const error = isSilent
  ? noop
  : (...args: unknown[]) => console.error(...args);
export const warn = isSilent
  ? noop
  : (...args: unknown[]) => console.warn(...args);
export const info = isSilent
  ? noop
  : (...args: unknown[]) => console.info(...args);
export const debug = isSilent
  ? noop
  : (...args: unknown[]) => console.debug(...args);
