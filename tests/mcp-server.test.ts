import { assertEquals, assertExists } from "./setup.ts";
import { withEnv } from "./setup.ts";
import { setUpMcpServer } from "../src/set-up-mcp.ts";
import { getPyodide } from "../src/tool/py.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Helper function to ensure Pyodide initialization completes before test
// This helps avoid timing issues with async Pyodide initialization
async function ensurePyodideReady() {
  // Wait for any pending microtasks to execute (includes queueMicrotask from py-runner)
  await new Promise((resolve) => setTimeout(resolve, 10));

  try {
    await getPyodide();
    // Also wait a bit more to ensure all initialization is complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch {
    // Ignore errors, we just want to wait for initialization to complete
  }
}

Deno.test({
  name: "MCP Server Setup - Basic Initialization",
  async fn() {
    await ensurePyodideReady();

    const server = setUpMcpServer(
      { name: "test-server", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    assertExists(server);
    assertEquals(server instanceof McpServer, true);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "MCP Server Setup - Tools Registration",
  async fn() {
    await ensurePyodideReady();

    const server = setUpMcpServer(
      { name: "test-server", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    // The server should have tools registered
    // We can't directly access the tools, but we can verify the server exists
    assertExists(server);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "MCP Server Setup - With Environment Variables",
  async fn() {
    await withEnv({
      "NODEFS_ROOT": "/tmp/test",
      "NODEFS_MOUNT_POINT": "/mnt/test",
      "DENO_PERMISSION_ARGS": "--allow-net --allow-env",
    }, async () => {
      await ensurePyodideReady();

      const server = setUpMcpServer(
        { name: "test-server", version: "0.1.0" },
        { capabilities: { tools: {} } },
      );

      assertExists(server);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "MCP Server Setup - Default Environment",
  async fn() {
    // Test with minimal environment (should still work)
    await withEnv({}, async () => {
      await ensurePyodideReady();

      const server = setUpMcpServer(
        { name: "test-server", version: "0.1.0" },
        { capabilities: { tools: {} } },
      );

      assertExists(server);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
