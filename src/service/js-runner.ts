import { spawn } from "node:child_process";
import { makeStream } from "../tool/py.ts";
import type { Buffer } from "node:buffer";
import path, { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
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

/**
 * Get Deno binary path.
 *
 * - Node.js (npx): resolve via `createRequire` from the bundled `deno` npm package
 * - Deno / JSR: use `Deno.execPath()` (the currently running binary)
 */
function getDenoBinaryPath(): string {
  // deno-lint-ignore no-explicit-any
  const denoGlobal = (globalThis as any).Deno;
  if (denoGlobal) {
    return denoGlobal.execPath();
  }
  // Node.js environment: resolve from bundled deno npm package
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve("deno/package.json");
  return path.join(path.dirname(pkgJson), "bin.cjs");
}

/**
 * Run arbitrary JavaScript using Deno and **stream**
 * its stdout / stderr.
 */
export function runJS(
  code: string,
  abortSignal?: AbortSignal,
): ReadableStream<Uint8Array> {
  // Launch Deno: `deno run --quiet -` reads the script from stdin
  debug("[start][js] spawn");
  const userProvidedPermissions =
    process.env.DENO_PERMISSION_ARGS?.split(" ") ?? [];
  const selfPermissions = [`--allow-read=${cwd}/`, `--allow-write=${cwd}/`];

  // Note: --allow-* cannot be used with '--allow-all'
  const allowAll = userProvidedPermissions.includes("--allow-all");
  const denoBinary = getDenoBinaryPath();
  const proc = spawn(
    denoBinary,
    [
      "run",
      `--quiet`,
      ...(allowAll
        ? userProvidedPermissions
        : selfPermissions.concat(userProvidedPermissions)),
      "-",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env: {
        ...process.env,
        DENO_DIR: join(cwd, ".deno"),
      },
    },
  );

  // Log the actual command being run
  debug(
    `[start][js] command: ${denoBinary} run --quiet --allow-read="${cwd}/" --allow-write="${cwd}/" -`,
  );

  // Feed provided code to Deno
  proc.stdin.write(code);
  proc.stdin.end();

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
        // Stream is already closed, ignore
        streamClosed = true;
      }
    };

  const stream = makeStream(
    abortSignal,
    (controller) => {
      debug(`[start][js] cwd: ${cwd}`);
      const timeout = setTimeout(() => {
        debug(`[err][js] timeout`);
        forward(controller)("[err][js] timeout");
        controller.close();
        proc.kill();
      }, EXEC_TIMEOUT);

      proc.stdout.on("data", forward(controller));
      proc.stderr.on("data", forward(controller, "[stderr] "));
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
      // Abort cleanup – kill the subprocess
      proc.kill();
    },
  );

  return stream;
}
