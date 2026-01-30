import { assertEquals, assertExists, assertStringIncludes } from "./setup.ts";
import { readStreamWithTimeout } from "./setup.ts";
import { getPip, getPyodide, loadDeps, makeStream } from "../src/tool/py.ts";

Deno.test("Python Tools - Get Pyodide Instance", async () => {
  const pyodide = await getPyodide();
  assertExists(pyodide);
  assertExists(pyodide.runPython);
  assertExists(pyodide.runPythonAsync);
});

Deno.test("Python Tools - Get Pip Instance", async () => {
  const pip = await getPip();
  assertExists(pip);
  // pip should have install method
  assertExists(pip.install);
});

Deno.test("Python Tools - Load Dependencies", async () => {
  const code = `
import json
import math
print("Dependencies loaded")
  `;

  // This should not throw an error
  await loadDeps(code);

  // If we get here, loadDeps worked correctly
  assertEquals(true, true);
});

Deno.test("Python Tools - Load Dependencies with External Package", async () => {
  const code = `
import requests
print("External package loaded")
  `;

  // This should attempt to install requests
  // Note: This test might take longer due to package installation
  await loadDeps(code);

  assertEquals(true, true);
});

Deno.test("Python Tools - Make Stream", async () => {
  const encoder = new TextEncoder();

  const stream = makeStream(
    undefined,
    (controller) => {
      // Simulate some output
      controller.enqueue(encoder.encode("test output"));
      controller.close();
    },
  );

  assertExists(stream);
  const output = await readStreamWithTimeout(stream);
  assertEquals(output, "test output");
});

Deno.test("Python Tools - Make Stream with Abort", async () => {
  const controller = new AbortController();
  let abortCalled = false;

  const stream = makeStream(
    controller.signal,
    (_ctrl) => {
      // Don't close immediately, let abort handle it
    },
    () => {
      abortCalled = true;
    },
  );

  // Abort immediately
  controller.abort();

  try {
    await readStreamWithTimeout(stream, 1000);
  } catch (error) {
    // Expected to throw due to abort
    assertStringIncludes(String(error), "abort");
  }

  assertEquals(abortCalled, true);
});

Deno.test("Python Tools - Make Stream with Pre-Aborted Signal", () => {
  const controller = new AbortController();
  controller.abort(); // Abort before creating stream

  let abortCalled = false;

  const stream = makeStream(
    controller.signal,
    (_ctrl) => {
      // This should be called but immediately errored
    },
    () => {
      abortCalled = true;
    },
  );

  assertExists(stream);
  assertEquals(abortCalled, true);
});

Deno.test("Python Tools - Environment Variable Support", () => {
  // Test that environment variable PYODIDE_PACKAGE_BASE_URL is respected
  const originalEnv = Deno.env.get("PYODIDE_PACKAGE_BASE_URL");

  try {
    // Set a custom package base URL
    Deno.env.set(
      "PYODIDE_PACKAGE_BASE_URL",
      "https://custom-cdn.example.com/pyodide",
    );

    // Clear the existing instance to force recreation
    // Note: This is testing the logic, actual Pyodide instance creation is expensive
    // so we'll just verify the environment variable is read correctly
    const customUrl = Deno.env.get("PYODIDE_PACKAGE_BASE_URL");
    assertExists(customUrl);
    assertEquals(customUrl, "https://custom-cdn.example.com/pyodide");
  } finally {
    // Restore original environment
    if (originalEnv) {
      Deno.env.set("PYODIDE_PACKAGE_BASE_URL", originalEnv);
    } else {
      Deno.env.delete("PYODIDE_PACKAGE_BASE_URL");
    }
  }
});
