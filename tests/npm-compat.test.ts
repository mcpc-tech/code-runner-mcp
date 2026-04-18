/**
 * npm compatibility tests
 *
 * These tests verify that @mcpc-tech/handle-sandbox works correctly when imported
 * as an npm package (`npm:@mcpc-tech/handle-sandbox`), which is the path
 * that matters after `@yaonyan/jsr2npm` bundles code-runner-mcp for npm.
 *
 * The jsr2npm bundler inlines all `@jsr/...` dependencies but keeps npm
 * packages external. By depending on the npm version of handle-sandbox,
 * we ensure the Sandbox class retains its own `import.meta` context and
 * can locate the runtime file at publish time.
 */

import { assertEquals, assertStringIncludes } from "./setup.ts";
import { readStreamWithTimeout } from "./setup.ts";
import { runJS } from "../src/service/js-runner.ts";

// ---------------------------------------------------------------------------
// Direct Sandbox import tests (npm path)
// ---------------------------------------------------------------------------

Deno.test({
  name: "npm-compat - Sandbox class is importable from npm package",
  async fn() {
    const { Sandbox } = await import("@mcpc-tech/handle-sandbox");
    assertEquals(typeof Sandbox, "function");
    const s = new Sandbox({ timeout: 5000 });
    assertEquals(typeof s.registerHandler, "function");
    assertEquals(typeof s.start, "function");
    assertEquals(typeof s.stop, "function");
    assertEquals(typeof s.execute, "function");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "npm-compat - Sandbox can start, execute, and stop",
  async fn() {
    const { Sandbox } = await import("@mcpc-tech/handle-sandbox");
    const logs: string[] = [];

    const sandbox = new Sandbox({
      timeout: 10000,
      onLog: (text: string) => logs.push(text),
    });

    sandbox.start();
    const result = await sandbox.execute('console.log("npm-sandbox-ok")');
    sandbox.stop();

    assertEquals(result.error, undefined);
    assertEquals(logs.some((l) => l.includes("npm-sandbox-ok")), true);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "npm-compat - Sandbox handler round-trip via npm package",
  async fn() {
    const { Sandbox } = await import("@mcpc-tech/handle-sandbox");
    const logs: string[] = [];

    const sandbox = new Sandbox({
      timeout: 10000,
      onLog: (text: string) => logs.push(text),
    });

    sandbox.registerHandler(
      "multiply",
      (a: unknown, b: unknown) =>
        Promise.resolve((a as number) * (b as number)),
    );

    sandbox.start();
    const result = await sandbox.execute(`
      const r = await multiply(6, 7);
      console.log("product:", r);
    `);
    sandbox.stop();

    assertEquals(result.error, undefined);
    assertEquals(logs.some((l) => l.includes("product: 42")), true);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ---------------------------------------------------------------------------
// runJS handler path (indirectly uses handle-sandbox npm package)
// ---------------------------------------------------------------------------

Deno.test({
  name: "npm-compat - runJS with handlers works end-to-end",
  async fn() {
    const stream = runJS(
      `
      const msg = await echo("hello from npm");
      console.log(msg);
    `,
      {
        handlers: {
          echo: (s: unknown) => Promise.resolve(`echo: ${s}`),
        },
      },
    );

    const output = await readStreamWithTimeout(stream, 30000);
    assertStringIncludes(output, "echo: hello from npm");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "npm-compat - runJS without handlers still works (raw path)",
  async fn() {
    const stream = runJS('console.log("raw-path-ok")');
    const output = await readStreamWithTimeout(stream, 30000);
    assertStringIncludes(output, "raw-path-ok");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
