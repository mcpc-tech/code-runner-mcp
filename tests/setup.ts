// Test setup and utilities
export {
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert";

// Helper to create a timeout-based abort signal for testing
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

// Helper to read a ReadableStream to completion
export async function readStreamToString(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  let result = "";

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

// Helper to read a stream with a timeout
export function readStreamWithTimeout(
  stream: ReadableStream<Uint8Array>,
  timeoutMs: number = 5000,
): Promise<string> {
  let timeoutId: number;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Stream read timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([
    readStreamToString(stream),
    timeoutPromise,
  ]).finally(() => {
    // Clean up the timeout to prevent leaks
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

// Mock environment variables for testing
export function withEnv<T>(envVars: Record<string, string>, fn: () => T): T;
export function withEnv<T>(
  envVars: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T>;
export function withEnv<T>(
  envVars: Record<string, string>,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const originalEnv = { ...Deno.env.toObject() };

  // Set test environment variables
  for (const [key, value] of Object.entries(envVars)) {
    Deno.env.set(key, value);
  }

  const restoreEnv = () => {
    // Restore original environment
    for (const key of Object.keys(envVars)) {
      if (originalEnv[key] !== undefined) {
        Deno.env.set(key, originalEnv[key]);
      } else {
        Deno.env.delete(key);
      }
    }
  };

  try {
    const result = fn();

    // Handle async functions
    if (result instanceof Promise) {
      return result.finally(restoreEnv);
    }

    // Handle sync functions
    restoreEnv();
    return result;
  } catch (error) {
    restoreEnv();
    throw error;
  }
}
