import type { PyodideConfig, PyodideInterface } from "pyodide";
import { getPip, getPyodide, loadDeps, makeStream } from "../tool/py.ts";

// const EXEC_TIMEOUT = 1000;
const EXEC_TIMEOUT = 1000 * 60 * 3; // 3 minutes for heavy imports like pandas

// Cache pyodide instance
queueMicrotask(() => {
  getPyodide();
  getPip();
});

const encoder = new TextEncoder();

/**
 * Options for running Python code
 */
export interface RunPyOptions {
  /** Physical directory path to mount from the host file system */
  nodeFSRoot?: string;
  /** Virtual directory path in Pyodide's file system to mount to (defaults to nodeFSRoot if not specified) */
  nodeFSMountPoint?: string;
  /** Custom mapping from import names to package names for micropip installation */
  packages?: Record<string, string>;
  /** Custom JavaScript handlers to inject into Python environment */
  // deno-lint-ignore no-explicit-any
  handlers?: Record<string, (...args: any[]) => unknown>;
  /** Pyodide-specific configuration options (passed to loadPyodide) */
  pyodide?: PyodideConfig;
}

/**
 * Run arbitrary Python code (Pyodide) and **stream** its stdout / stderr.
 *
 * Optional `abortSignal` will interrupt execution via Pyodide's interrupt
 * buffer and close the resulting stream.
 */
export async function runPy(
  code: string,
  options?: RunPyOptions,
  abortSignal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>>;
export async function runPy(
  code: string,
  abortSignal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>>;
export async function runPy(
  code: string,
  optionsOrAbortSignal?: RunPyOptions | AbortSignal,
  abortSignal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  // Handle overloaded parameters
  let options: RunPyOptions | undefined;
  let signal: AbortSignal | undefined;

  if (optionsOrAbortSignal instanceof AbortSignal) {
    signal = optionsOrAbortSignal;
  } else {
    options = optionsOrAbortSignal;
    signal = abortSignal;
  }

  const pyodide = await getPyodide(options?.pyodide);

  // Set up file system if options provided
  if (options) {
    setupPyodideFileSystem(pyodide, options);
  }

  // Inject custom handlers into Python environment
  if (options?.handlers) {
    // deno-lint-ignore no-explicit-any
    const wrapHandler = (fn: (...args: any[]) => any) => {
      return (...args: unknown[]) => {
        // Convert PyProxy args to JS
        // deno-lint-ignore no-explicit-any
        const jsArgs = args.map((a) => (a as any)?.toJs?.() ?? a);
        return fn(...jsArgs);
      };
    };

    // Python wrapper: convert return value to Python dict
    const pythonWrap = pyodide.runPython(`
from pyodide.ffi import JsProxy
import inspect

def wrap(fn):
    def wrapper(*args):
        result = fn(*args)
        if inspect.isawaitable(result):
            return result.then(lambda r: r.to_py() if isinstance(r, JsProxy) else r)
        return result.to_py() if isinstance(result, JsProxy) else result
    return wrapper
wrap
    `);

    for (const [name, fn] of Object.entries(options.handlers)) {
      pyodide.globals.set(name, pythonWrap(wrapHandler(fn)));
    }
  }

  // Load packages
  await loadDeps(code, options?.packages);

  // Interrupt buffer to be set when aborting
  const interruptBuffer = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
  );

  pyodide.setInterruptBuffer(interruptBuffer);

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let streamClosed = false;

  const push = (prefix: string) => (data: string): void => {
    try {
      if (!streamClosed && data) {
        // Split large output into smaller chunks to avoid buffer overflow
        const maxChunkSize = 8192; // 8KB chunks
        if (data.length > maxChunkSize) {
          // Split the data into smaller chunks
          for (let i = 0; i < data.length; i += maxChunkSize) {
            const chunk = data.slice(i, i + maxChunkSize);
            controller.enqueue(encoder.encode(prefix + chunk));
            prefix = ""; // Only add prefix to the first chunk
          }
        } else {
          controller.enqueue(encoder.encode(prefix + data));
        }
      }
    } catch (err) {
      // Stream is already closed or errored, ignore
      console.warn(
        "[py] Stream already closed, ignoring output:",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  // Build the stream with proper abort behaviour
  const stream = makeStream(
    signal,
    (ctrl) => {
      console.log("[start][py] streaming & timeout");
      const timeout = setTimeout(() => {
        console.log(`[err][py] timeout`);
        if (!streamClosed) {
          try {
            controller.enqueue(encoder.encode("[err][py] timeout"));
            controller.close();
            streamClosed = true;
            // Clear handlers to prevent further writes
            pyodide.setStdout({});
            pyodide.setStderr({});
          } catch (err) {
            console.warn(
              "[py] Error closing stream on timeout:",
              err instanceof Error ? err.message : String(err),
            );
          }
        }
        interruptBuffer[0] = 3;
      }, EXEC_TIMEOUT);

      controller = ctrl;

      // Use non-batched output to avoid buffer overflow issues
      // This sends output immediately instead of batching it
      pyodide.setStdout({
        batched: (data: string) => {
          // Process output in smaller chunks to prevent OSError
          const lines = data.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line || i < lines.length - 1) { // Include empty lines except the last one
              push("")(line + (i < lines.length - 1 ? "\n" : ""));
            }
          }
        },
      });

      pyodide.setStderr({
        batched: (data: string) => {
          // Process stderr output in smaller chunks too
          const lines = data.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line || i < lines.length - 1) {
              push("[stderr] ")(line + (i < lines.length - 1 ? "\n" : ""));
            }
          }
        },
      });

      // Defer execution so that `start()` returns immediately
      queueMicrotask(async () => {
        try {
          // If an abort happened before execution – don't run
          if (signal?.aborted) return;

          // Pre-validate Python code to catch syntax errors early
          try {
            pyodide.runPython(
              `compile(${JSON.stringify(code)}, '<string>', 'exec')`,
            );
          } catch (compileErr) {
            const errMsg = compileErr instanceof Error
              ? compileErr.message
              : String(compileErr);
            if (
              errMsg.includes("unterminated string literal") ||
              errMsg.includes("SyntaxError")
            ) {
              const enhancedMsg =
                `${errMsg}\n\n**Syntax Error Detected!** This often happens when Python code is not properly escaped for JSON transmission.\n\n**Tips:**\n- Avoid using triple quotes (\`\`\` or \`\`\`python)\n- Use single quotes for strings: \`'hello'\` instead of \`"hello"\`\n- For multi-line strings, concatenate: \`'line1' + '\\n' + 'line2'\`\n- Avoid backticks (\`) and dollar signs (\$) in code`;
              throw new Error(enhancedMsg);
            }
            throw compileErr;
          }

          await pyodide.runPythonAsync(code);
          clearTimeout(timeout);
          if (!streamClosed) {
            controller.close();
            streamClosed = true;
            // Clear handlers to prevent further writes
            pyodide.setStdout({});
            pyodide.setStderr({});
          }
        } catch (err) {
          clearTimeout(timeout);
          if (!streamClosed) {
            const errMsg = err instanceof Error ? err.message : String(err);

            // Detect ModuleNotFoundError and append helpful hint
            if (
              errMsg.includes("ModuleNotFoundError") ||
              errMsg.includes("No module named")
            ) {
              // Extract package name from error message
              const match = errMsg.match(/No module named ['"]([^'"]+)['"]/);
              const pkgName = match ? match[1] : "package-name";

              const enhancedMsg =
                `${errMsg}\n\n**Missing dependency detected!** To install it, add this at the beginning of your code:\n\`\`\`python\nimport micropip\nawait micropip.install('${pkgName}')\n\`\`\``;
              controller.error(new Error(enhancedMsg));
            } else {
              controller.error(err);
            }
            streamClosed = true;
            // Clear handlers to prevent further writes
            pyodide.setStdout({});
            pyodide.setStderr({});
          }
        }
      });
    },
    () => {
      streamClosed = true;
      interruptBuffer[0] = 2;
      // Clear handlers to prevent further writes
      pyodide.setStdout({});
      pyodide.setStderr({});
    },
  );

  return stream;
}

/**
 * Set up Pyodide file system based on options
 */
function setupPyodideFileSystem(
  pyodide: PyodideInterface,
  options: RunPyOptions,
) {
  // Mount Node.js file system if requested
  if (options.nodeFSRoot) {
    const mountPoint = options.nodeFSMountPoint || options.nodeFSRoot;
    try {
      pyodide.FS.mkdirTree(mountPoint);
      pyodide.FS.mount(
        pyodide.FS.filesystems.NODEFS,
        { root: options.nodeFSRoot },
        mountPoint,
      );
      console.log(
        `[py] Mounted Node.js FS from ${options.nodeFSRoot} to ${mountPoint}`,
      );
    } catch (err) {
      console.warn(`[py] Failed to mount Node.js FS:`, err);
    }
  }
}
