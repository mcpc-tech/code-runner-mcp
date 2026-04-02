import { spawn } from "node:child_process";
import { makeStream } from "../tool/py.ts";
import type { Buffer } from "node:buffer";
import path, { join } from "node:path";
import { mkdirSync } from "node:fs";
import process from "node:process";
import { tmpdir } from "node:os";

const projectRoot: string = tmpdir();
export const cwd: string = path.join(projectRoot, ".deno_runner_tmp");

mkdirSync(cwd, { recursive: true });

// const EXEC_TIMEOUT = 1000;
const EXEC_TIMEOUT = 1000 * 60 * 1;

const encoder = new TextEncoder();
const debug = (...args: unknown[]) => {
  if (process.env.DEBUG) console.log(...args);
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
 * Run arbitrary JavaScript using Deno and **stream**
 * its stdout / stderr.
 */
export function runJS(
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
