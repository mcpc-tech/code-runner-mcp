import { spawn } from "node:child_process";
import { makeStream } from "../tool/py.ts";
import type { Buffer } from "node:buffer";
import path, { join } from "node:path";
import { mkdirSync } from "node:fs";
import process from "node:process";
import { tmpdir } from "node:os";
import { Sandbox } from "@mcpc-tech/handle-sandbox";
import * as log from "../log.ts";

const projectRoot: string = tmpdir();
export const cwd: string = path.join(projectRoot, ".deno_runner_tmp");

mkdirSync(cwd, { recursive: true });

// const EXEC_TIMEOUT = 1000;
const EXEC_TIMEOUT = 1000 * 60 * 1;

const encoder = new TextEncoder();
const debug = (...args: unknown[]) => {
  if (process.env.DEBUG) log.debug(...args);
};

type DenoRuntime = {
  command: string;
  prefixArgs: string[];
};

/**
 * Resolve how to invoke Deno.
 *
 * - Deno / JSR: use `Deno.execPath()` (the currently running binary)
 * - Node.js / npm: resolve the bundled `deno/bin.cjs` and run it via `node`
 */
function getDenoRuntime(): DenoRuntime {
  // deno-lint-ignore no-explicit-any
  const denoGlobal = (globalThis as any).Deno;
  if (denoGlobal) {
    return { command: denoGlobal.execPath(), prefixArgs: [] };
  }

  // Prefer Node's built-in module loader so npm users always use the bundled dependency.
  // deno-lint-ignore no-explicit-any
  const getBuiltinModule = (process as any).getBuiltinModule;
  const moduleBuiltin = getBuiltinModule?.("module") ??
    getBuiltinModule?.("node:module");
  const createRequire = moduleBuiltin?.createRequire;
  if (typeof createRequire === "function") {
    const nodeRequire = createRequire(import.meta.url);
    return {
      command: process.execPath,
      prefixArgs: [nodeRequire.resolve("deno/bin.cjs")],
    };
  }

  // Fallback for CJS bundles that expose `require` globally.
  // deno-lint-ignore no-explicit-any
  const nodeRequire = (globalThis as any).require;
  if (typeof nodeRequire?.resolve === "function") {
    return {
      command: process.execPath,
      prefixArgs: [nodeRequire.resolve("deno/bin.cjs")],
    };
  }

  throw new Error(
    'Failed to resolve bundled "deno" dependency. Please reinstall `@mcpc-tech/code-runner-mcp`.',
  );
}

/**
 * Options for running JavaScript code
 */
export interface RunJSOptions {
  /** Custom JavaScript handlers injected into the sandbox as global async functions */
  // deno-lint-ignore no-explicit-any
  handlers?: Record<string, (...args: any[]) => unknown>;
}

/**
 * Run arbitrary JavaScript using Deno and **stream** its stdout / stderr.
 *
 * When `options.handlers` is provided the sandbox uses JSON-RPC IPC
 * (via `@mcpc-tech/handle-sandbox`) so that handler functions defined in the host
 * process can be called from inside the sandboxed code as plain async globals.
 *
 * Without handlers the original sub-process pipe path is used, preserving
 * full stdout streaming and `--quiet` / permission behaviour.
 */
export function runJS(
  code: string,
  options?: RunJSOptions,
  abortSignal?: AbortSignal,
): ReadableStream<Uint8Array>;
export function runJS(
  code: string,
  abortSignal?: AbortSignal,
): ReadableStream<Uint8Array>;
export function runJS(
  code: string,
  optionsOrSignal?: RunJSOptions | AbortSignal,
  abortSignal?: AbortSignal,
): ReadableStream<Uint8Array> {
  // Normalise overloaded parameters
  let options: RunJSOptions | undefined;
  let signal: AbortSignal | undefined;

  if (optionsOrSignal instanceof AbortSignal) {
    signal = optionsOrSignal;
  } else {
    options = optionsOrSignal;
    signal = abortSignal;
  }

  if (options?.handlers && Object.keys(options.handlers).length > 0) {
    return runJSWithHandlers(code, options.handlers, signal);
  }

  return runJSRaw(code, signal);
}

// ---------------------------------------------------------------------------
// Path A: handler-capable sandbox (handle-sandbox JSON-RPC IPC)
// ---------------------------------------------------------------------------

function runJSWithHandlers(
  code: string,
  // deno-lint-ignore no-explicit-any
  handlers: Record<string, (...args: any[]) => unknown>,
  abortSignal?: AbortSignal,
): ReadableStream<Uint8Array> {
  debug("[start][js/sandbox] spawn with handlers:", Object.keys(handlers));

  const userProvidedPermissions =
    process.env.DENO_PERMISSION_ARGS?.split(" ").filter(Boolean) ?? [];
  const selfPermissions = [`--allow-read=${cwd}/`, `--allow-write=${cwd}/`];
  const allowAll = userProvidedPermissions.includes("--allow-all");
  const permissions = allowAll
    ? userProvidedPermissions
    : selfPermissions.concat(userProvidedPermissions);

  let sandbox: Sandbox;
  let streamClosed = false;
  let timeoutId: ReturnType<typeof setTimeout>;

  return makeStream(
    abortSignal,
    (controller) => {
      const enqueue = (text: string) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          streamClosed = true;
        }
      };

      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        clearTimeout(timeoutId);
        try {
          controller.close();
        } catch { /* already closed */ }
      };

      const errorStream = (err: unknown) => {
        if (streamClosed) return;
        streamClosed = true;
        clearTimeout(timeoutId);
        try {
          controller.error(err);
        } catch { /* already closed */ }
      };

      sandbox = new Sandbox({
        timeout: EXEC_TIMEOUT,
        cwd,
        env: { ...process.env, DENO_DIR: join(cwd, ".deno") },
        permissions,
        extraArgs: ["--quiet"],
        onLog: (text, level) => {
          const prefix = level === "log" ? "" : `[${level}] `;
          enqueue(prefix + text + "\n");
        },
        onStderr: (text) => {
          // Detect permission errors and append helpful hint
          if (text.includes("Permission denied")) {
            enqueue(
              `[stderr] ${text}\n\n**Permission denied!** The Deno runtime restricts file system access.\n\n**Fix:** Use \`${cwd}/\` path only for file operations.`,
            );
          } else {
            enqueue("[stderr] " + text);
          }
        },
      });

      for (const [name, fn] of Object.entries(handlers)) {
        sandbox.registerHandler(
          name,
          fn as (...args: unknown[]) => Promise<unknown>,
        );
      }

      sandbox.start();

      timeoutId = setTimeout(() => {
        debug("[err][js/sandbox] timeout");
        enqueue("[err][js] timeout\n");
        sandbox.stop();
        closeStream();
      }, EXEC_TIMEOUT);

      sandbox.execute(code).then((result) => {
        clearTimeout(timeoutId);
        if (result.error) {
          enqueue(`[stderr] ${result.error}\n`);
        }
        sandbox.stop();
        closeStream();
      }).catch((err) => {
        sandbox?.stop();
        errorStream(err);
      });
    },
    () => {
      // abort
      sandbox?.stop();
    },
  );
}

// ---------------------------------------------------------------------------
// Path B: raw sub-process pipe (no handlers, original behaviour)
// ---------------------------------------------------------------------------

function runJSRaw(
  code: string,
  abortSignal?: AbortSignal,
): ReadableStream<Uint8Array> {
  debug("[start][js] spawn");
  const userProvidedPermissions =
    process.env.DENO_PERMISSION_ARGS?.split(" ") ?? [];
  const selfPermissions = [`--allow-read=${cwd}/`, `--allow-write=${cwd}/`];
  const allowAll = userProvidedPermissions.includes("--allow-all");

  let proc: ReturnType<typeof spawn>;
  let streamClosed = false;
  let errorBuffer = "";

  const forward =
    (controller: ReadableStreamDefaultController<Uint8Array>, prefix = "") =>
    (chunk: Buffer | string) => {
      if (streamClosed) return;

      try {
        const text = typeof chunk === "string" ? chunk : chunk.toString();

        // Detect permission errors and append helpful hint
        if (prefix === "[stderr] " && text.includes("Permission denied")) {
          if (!errorBuffer.includes("PermissionHintShown")) {
            errorBuffer += "PermissionHintShown";
            const enhancedMsg =
              `[stderr] ${text}\n\n**Permission denied!** The Deno runtime restricts file system access.\n\n**Fix:** Use \`${cwd}/\` path only for file operations.`;
            controller.enqueue(encoder.encode(enhancedMsg));
            return;
          }
        }

        // For stderr add prefix only once at beginning of line
        if (prefix) {
          controller.enqueue(encoder.encode(prefix));
        }

        const data = typeof chunk === "string"
          ? encoder.encode(chunk)
          : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        controller.enqueue(data);
      } catch {
        streamClosed = true;
      }
    };

  return makeStream(
    abortSignal,
    (controller) => {
      const runtime = getDenoRuntime();
      const commandArgs = [
        ...runtime.prefixArgs,
        "run",
        `--quiet`,
        ...(allowAll
          ? userProvidedPermissions
          : selfPermissions.concat(userProvidedPermissions)),
        "-",
      ];
      debug(`[start][js] command: ${runtime.command} ${commandArgs.join(" ")}`);
      debug(`[start][js] cwd: ${cwd}`);

      proc = spawn(
        runtime.command,
        commandArgs,
        {
          stdio: ["pipe", "pipe", "pipe"],
          cwd,
          env: {
            ...process.env,
            DENO_DIR: join(cwd, ".deno"),
          },
        },
      );

      proc.stdin!.write(code);
      proc.stdin!.end();

      const timeout = setTimeout(() => {
        debug(`[err][js] timeout`);
        forward(controller)("[err][js] timeout");
        controller.close();
        proc.kill();
      }, EXEC_TIMEOUT);

      proc.stdout!.on("data", forward(controller));
      proc.stderr!.on("data", forward(controller, "[stderr] "));
      proc.on("close", () => {
        clearTimeout(timeout);
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
      proc.on("error", (err) => {
        clearTimeout(timeout);
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.error(err);
        } catch {
          // Already closed
        }
      });
    },
    () => {
      proc?.kill();
    },
  );
}
