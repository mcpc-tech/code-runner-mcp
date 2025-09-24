/// <reference path="../types/pyodide.d.ts" />

import type { PyodideInterface } from "pyodide";
import { getPyodide, getPip, loadDeps, makeStream } from "../tool/py.ts";

// const EXEC_TIMEOUT = 1000;
const EXEC_TIMEOUT = 1000 * 60 * 3; // 3 minutes for heavy imports like pandas
const INIT_TIMEOUT = 1000 * 60; // 1 minute for initialization

// Cache pyodide instance with lazy initialization
let initializationPromise: Promise<void> | null = null;

const initializePyodide = async () => {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      try {
        console.log("[py] Starting background Pyodide initialization...");
        await getPyodide();
        // Don't load micropip here - load it only when needed
        console.log("[py] Background Pyodide initialization completed");
      } catch (error) {
        console.error("[py] Background initialization failed:", error);
        initializationPromise = null; // Reset to allow retry
        throw error;
      }
    })();
  }
  return initializationPromise;
};

// Export the initialization function for health checks
export { initializePyodide };

// Start initialization in background but don't wait for it
queueMicrotask(() => {
  initializePyodide().catch((error) => {
    console.warn("[py] Background initialization failed, will retry on first use:", error);
  });
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
  importToPackageMap?: Record<string, string>;
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
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>>;
export async function runPy(
  code: string,
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>>;
export async function runPy(
  code: string,
  optionsOrAbortSignal?: RunPyOptions | AbortSignal,
  abortSignal?: AbortSignal
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

  // Initialize Pyodide with timeout protection
  let pyodide: any; // Use any type to avoid PyodideInterface type issues
  try {
    console.log("[py] Ensuring Pyodide is initialized...");
    
    // Use initialization timeout to prevent hanging
    const initPromise = Promise.race([
      (async () => {
        await initializePyodide();
        return await getPyodide();
      })(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Pyodide initialization timeout"));
        }, INIT_TIMEOUT);
      })
    ]);
    
    pyodide = await initPromise;
    console.log("[py] Pyodide initialization completed");
  } catch (initError) {
    console.error("[py] Pyodide initialization failed:", initError);
    
    // Return an error stream immediately
    return new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const errorMessage = `[ERROR] Python runtime initialization failed: ${initError instanceof Error ? initError.message : 'Unknown error'}\n`;
        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      }
    });
  }

  // Set up file system if options provided
  if (options) {
    try {
      setupPyodideFileSystem(pyodide, options);
    } catch (fsError) {
      console.error("[py] File system setup error:", fsError);
      // Continue execution even if FS setup fails
    }
  }

  // Re-enabled smart package loading with hybrid Pyodide/micropip approach
  // This now properly handles both Pyodide packages and micropip packages
  let dependencyLoadingFailed = false;
  let dependencyError: Error | null = null;
  
  try {
    console.log("[py] Starting smart package loading...");
    await loadDeps(code, options?.importToPackageMap);
    console.log("[py] Package loading completed successfully");
  } catch (depError) {
    console.error("[py] Dependency loading error:", depError);
    dependencyLoadingFailed = true;
    dependencyError = depError instanceof Error ? depError : new Error('Unknown dependency error');
    // Continue execution - some packages might still work
  }

  // Interrupt buffer to be set when aborting
  const interruptBuffer = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  );

  pyodide.setInterruptBuffer(interruptBuffer);

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let streamClosed = false;

  const push =
    (prefix: string) =>
    (data: string): void => {
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
          err instanceof Error ? err.message : String(err)
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
              err instanceof Error ? err.message : String(err)
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
          const lines = data.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line || i < lines.length - 1) { // Include empty lines except the last one
              push("")(line + (i < lines.length - 1 ? '\n' : ''));
            }
          }
        }
      });
      
      pyodide.setStderr({ 
        batched: (data: string) => {
          // Process stderr output in smaller chunks too
          const lines = data.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line || i < lines.length - 1) {
              push("[stderr] ")(line + (i < lines.length - 1 ? '\n' : ''));
            }
          }
        }
      });

      // Defer execution so that `start()` returns immediately
      queueMicrotask(async () => {
        try {
          // If an abort happened before execution – don't run
          if (signal?.aborted) return;

          // Show warning if dependency loading failed
          if (dependencyLoadingFailed && dependencyError) {
            const warningMsg = `[WARNING] Package installation failed due to network/micropip issues.\nSome imports (like nltk, sklearn) may not be available.\nError: ${dependencyError.message}\n\nAttempting to run code anyway...\n\n`;
            push("")(warningMsg);
          }

          // Validate code before execution
          if (!code || typeof code !== 'string') {
            throw new Error("Invalid code: must be a non-empty string");
          }

          // Clean up any existing state
          try {
            pyodide.runPython("import sys; sys.stdout.flush(); sys.stderr.flush()");
          } catch (cleanupError) {
            console.warn("[py] Cleanup warning:", cleanupError);
          }

          console.log("[py] Executing code:", code.substring(0, 100) + (code.length > 100 ? "..." : ""));
          
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
          console.error("[py] Execution error:", err);
          clearTimeout(timeout);
          if (!streamClosed) {
            // Try to send error info to the stream before closing
            try {
              const errorMessage = err instanceof Error ? err.message : String(err);
              controller.enqueue(encoder.encode(`[ERROR] ${errorMessage}\n`));
            } catch (streamError) {
              console.error("[py] Error sending error message:", streamError);
            }
            controller.error(err);
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
    }
  );

  return stream;
}

/**
 * Set up Pyodide file system based on options
 */
function setupPyodideFileSystem(
  pyodide: PyodideInterface,
  options: RunPyOptions
) {
  // Mount Node.js file system if requested
  if (options.nodeFSRoot) {
    const mountPoint = options.nodeFSMountPoint || options.nodeFSRoot;
    try {
      pyodide.FS.mkdirTree(mountPoint);
      pyodide.FS.mount(
        pyodide.FS.filesystems.NODEFS,
        { root: options.nodeFSRoot },
        mountPoint
      );
      console.log(`[py] Mounted Node.js FS from ${options.nodeFSRoot} to ${mountPoint}`);
    } catch (err) {
      console.warn(`[py] Failed to mount Node.js FS:`, err);
    }
  }
}
