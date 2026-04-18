import { assertEquals } from "./setup.ts";

/**
 * Tests for the silent mode logger (src/log.ts).
 *
 * Silent mode is controlled via `log.silent = true/false`.
 * Users can also set it through `runJS({ silent: true })` / `runPy({ silent: true })`.
 */

import { log } from "../src/log.ts";

Deno.test("Logger - default is not silent", () => {
  try {
    assertEquals(log.silent, false);
  } finally {
    log.silent = false;
  }
});

Deno.test("Logger - silent property toggles mode", () => {
  try {
    assertEquals(log.silent, false);
    log.silent = true;
    assertEquals(log.silent, true);
    log.silent = false;
    assertEquals(log.silent, false);
  } finally {
    log.silent = false;
  }
});

Deno.test("Logger - log methods respect silent mode", async () => {
  // Use subprocess to avoid polluting this process's stdout/stderr
  const code = `
import { log } from "./src/log.ts";
log.silent = true;
log.error("should-not-appear");
log.warn("should-not-appear");
log.info("should-not-appear");
log.debug("should-not-appear");
log.silent = false;
log.error("should-appear");
`;
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    cwd: Deno.cwd(),
  });

  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(code));
  writer.releaseLock();
  await child.stdin.close();

  const { stderr } = await child.output();
  const output = new TextDecoder().decode(stderr);
  assertEquals(output.includes("should-not-appear"), false);
  assertEquals(output.includes("should-appear"), true);
});

Deno.test("Logger - runJS with silent option", async () => {
  const code = `
import { runJS, log } from "./mod.ts";
const stream = runJS("console.log('hi')", { silent: true });
const decoder = new TextDecoder();
let output = "";
for await (const chunk of stream) { output += decoder.decode(chunk); }
console.log("silent=" + log.silent + ",output=" + output.trim());
`;
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    cwd: Deno.cwd(),
  });

  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(code));
  writer.releaseLock();
  await child.stdin.close();

  const { stdout } = await child.output();
  const output = new TextDecoder().decode(stdout);
  assertEquals(output.includes("silent=true"), true);
  assertEquals(output.includes("hi"), true);
});
