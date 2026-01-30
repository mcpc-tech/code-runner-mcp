#!/usr/bin/env -S deno run --allow-all

/**
 * Test runner script for the code-runner-mcp project
 * This script runs all tests in the tests/ directory
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const args = parseArgs(Deno.args, {
  boolean: ["help", "watch", "coverage", "parallel"],
  string: ["filter", "reporter"],
  alias: {
    h: "help",
    w: "watch",
    c: "coverage",
    f: "filter",
    r: "reporter",
    p: "parallel",
  },
  default: {
    reporter: "pretty",
    parallel: true,
  },
});

if (args.help) {
  console.log(`
Code Runner MCP Test Runner

Usage: deno run --allow-all run-tests.ts [options]

Options:
  -h, --help         Show this help message
  -w, --watch        Watch for file changes and re-run tests
  -c, --coverage     Generate coverage report
  -f, --filter       Filter tests by name pattern
  -r, --reporter     Test reporter (pretty, dot, json, tap)
  -p, --parallel     Run tests in parallel (default: true)

Examples:
  deno run --allow-all run-tests.ts
  deno run --allow-all run-tests.ts --watch
  deno run --allow-all run-tests.ts --coverage
  deno run --allow-all run-tests.ts --filter "JavaScript"
  `);
  Deno.exit(0);
}

// Build the test command
const testCommand = ["deno", "test"];

// Add common flags
testCommand.push("--allow-all");

if (args.watch) {
  testCommand.push("--watch");
}

if (args.coverage) {
  testCommand.push("--coverage");
}

if (args.reporter && args.reporter !== "pretty") {
  testCommand.push("--reporter", args.reporter);
}

if (args.parallel) {
  testCommand.push("--parallel");
} else {
  testCommand.push("--no-parallel");
}

if (args.filter) {
  testCommand.push("--filter", args.filter);
}

// Add test directory
testCommand.push("tests/");

console.log("Running tests with command:", testCommand.join(" "));
console.log("=".repeat(50));

// Execute the test command
const process = new Deno.Command(testCommand[0], {
  args: testCommand.slice(1),
  stdout: "inherit",
  stderr: "inherit",
});

const { code } = await process.output();

if (args.coverage && code === 0) {
  console.log("\n" + "=".repeat(50));
  console.log("Generating coverage report...");

  const coverageProcess = new Deno.Command("deno", {
    args: ["coverage", "--html"],
    stdout: "inherit",
    stderr: "inherit",
  });

  await coverageProcess.output();
}

Deno.exit(code);
