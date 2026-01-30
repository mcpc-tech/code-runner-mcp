#!/usr/bin/env -S deno run --allow-all

/**
 * Simple test runner that just runs basic tests without the complex ones
 * Use this for quick verification of the test setup
 */

console.log("Running basic tests only...");

const basicTests = [
  "tests/basic.test.ts",
  "tests/smoke.test.ts",
];

for (const testFile of basicTests) {
  console.log(`\nRunning ${testFile}...`);

  const process = new Deno.Command("deno", {
    args: ["test", "--allow-all", testFile],
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await process.output();

  if (code !== 0) {
    console.log(`❌ ${testFile} failed`);
    Deno.exit(1);
  } else {
    console.log(`✅ ${testFile} passed`);
  }
}

console.log("\n🎉 All basic tests passed!");
