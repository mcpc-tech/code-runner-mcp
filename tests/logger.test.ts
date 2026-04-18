import { assertEquals } from "./setup.ts";

/**
 * Tests for the silent mode logger (src/log.ts).
 *
 * Since log.ts reads `SILENT` at module load time, we test the behavior
 * by spawning a subprocess with the environment variable set.
 */

Deno.test("Logger - normal mode outputs to console", async () => {
  const result = await runLogTest("false");
  assertEquals(result.hasOutput, true);
  assertEquals(result.output.includes("hello"), true);
});

Deno.test("Logger - SILENT=true suppresses console output", async () => {
  const result = await runLogTest("true");
  assertEquals(result.hasOutput, false);
});

Deno.test("Logger - SILENT=1 suppresses console output", async () => {
  const result = await runLogTest("1");
  assertEquals(result.hasOutput, false);
});

Deno.test("Logger - SILENT=false allows console output", async () => {
  const result = await runLogTest("false");
  assertEquals(result.hasOutput, true);
  assertEquals(result.output.includes("hello"), true);
});

/**
 * Spawn a subprocess that imports log.ts and calls log.error(),
 * capturing whether anything was written to stderr.
 */
async function runLogTest(
  silentValue: string,
): Promise<{ hasOutput: boolean; output: string }> {
  const code = `
import * as log from "./src/log.ts";
log.error("hello");
`;

  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    env: {
      ...Deno.env.toObject(),
      SILENT: silentValue,
    },
    cwd: Deno.cwd(),
  });

  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(code));
  writer.releaseLock();
  await child.stdin.close();

  const { stderr } = await child.output();
  const output = new TextDecoder().decode(stderr);

  return {
    hasOutput: output.trim().length > 0,
    output,
  };
}
