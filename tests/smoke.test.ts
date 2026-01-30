import { assertEquals } from "./setup.ts";

// Simple smoke tests to verify basic functionality without complex resource management

Deno.test({
  name: "Smoke Test - JavaScript Import",
  async fn() {
    const { runJS } = await import("../src/service/js-runner.ts");
    assertEquals(typeof runJS, "function");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Smoke Test - Python Import",
  async fn() {
    const { runPy } = await import("../src/service/py-runner.ts");
    assertEquals(typeof runPy, "function");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Smoke Test - Python Tools Import",
  async fn() {
    const tools = await import("../src/tool/py.ts");
    assertEquals(typeof tools.getPyodide, "function");
    assertEquals(typeof tools.getPip, "function");
    assertEquals(typeof tools.loadDeps, "function");
    assertEquals(typeof tools.makeStream, "function");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
