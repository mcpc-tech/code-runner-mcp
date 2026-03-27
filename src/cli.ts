#!/usr/bin/env -S deno run --allow-all
/**
 * code-runner CLI
 *
 * Run JavaScript/TypeScript or Python code directly from the command line.
 *
 * Usage:
 *   deno run --allow-all src/cli.ts js "console.log('hello')"
 *   deno run --allow-all src/cli.ts py "print('hello')"
 *   deno run --allow-all src/cli.ts js --file script.js
 *   deno run --allow-all src/cli.ts py --file script.py
 *   echo "print('hello')" | deno run --allow-all src/cli.ts py
 *   cat script.js | deno run --allow-all src/cli.ts js
 */

import { parseArgs } from "@std/cli/parse-args";
import { runJS } from "./service/js-runner.ts";
import { runPy, type RunPyOptions } from "./service/py-runner.ts";
import { readFileSync } from "node:fs";
import process from "node:process";

const HELP = `
code-runner CLI — run JS/TS or Python code in a secure sandbox

USAGE:
  code-runner <lang> [options] [code]
  echo "<code>" | code-runner <lang> [options]

LANGUAGES:
  js, javascript    Run JavaScript/TypeScript via Deno
  py, python        Run Python via Pyodide (WASM)

OPTIONS:
  -f, --file <path>         Read code from a file instead of inline/stdin
  -p, --packages <map>      Python only: JSON map of import→PyPI names
                            e.g. '{"sklearn":"scikit-learn"}'
      --nodefs-root <dir>   Python only: host directory to mount
      --nodefs-mount <dir>  Python only: mount point inside Pyodide FS
  -h, --help                Show this help message

EXAMPLES:
  code-runner js "console.log('hello world')"
  code-runner py "print(1 + 2)"
  code-runner js --file ./script.ts
  code-runner py --file ./analysis.py --packages '{"sklearn":"scikit-learn"}'
  echo "print('piped')" | code-runner py
  cat app.ts | code-runner js
`.trim();

async function readStdin(): Promise<string | null> {
  // Only read stdin when it's actually piped (not a TTY)
  try {
    // deno-lint-ignore no-explicit-any
    const stdin = (globalThis as any).Deno?.stdin;
    if (stdin && !stdin.isTerminal()) {
      const buf = await new Response(stdin.readable).text();
      return buf.trim() || null;
    }
  } catch {
    // fall through
  }
  return null;
}

async function streamToStdout(
  stream: ReadableStream<Uint8Array>,
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    process.stdout.write(decoder.decode(chunk));
  }
}

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["file", "f", "packages", "p", "nodefs-root", "nodefs-mount"],
    boolean: ["help", "h"],
    alias: { h: "help", f: "file", p: "packages" },
  });

  if (args.help || args._.length === 0) {
    console.log(HELP);
    Deno.exit(0);
  }

  const lang = String(args._[0]).toLowerCase();
  const inlineCode = args._.slice(1).join(" ").trim() || null;

  if (!["js", "javascript", "py", "python"].includes(lang)) {
    console.error(`Unknown language: "${lang}". Use "js" or "py".`);
    console.error("Run with --help for usage.");
    Deno.exit(1);
  }

  // Resolve code: inline arg > --file > stdin
  let code: string;
  if (inlineCode) {
    code = inlineCode;
  } else if (args.file || args.f) {
    const filePath = (args.file || args.f) as string;
    try {
      code = readFileSync(filePath, "utf-8");
    } catch (err) {
      console.error(
        `Failed to read file "${filePath}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      Deno.exit(1);
    }
  } else {
    const piped = await readStdin();
    if (!piped) {
      console.error(
        "No code provided. Pass inline code, --file, or pipe via stdin.",
      );
      console.error("Run with --help for usage.");
      Deno.exit(1);
    }
    code = piped;
  }

  try {
    if (lang === "js" || lang === "javascript") {
      const stream = runJS(code);
      await streamToStdout(stream);
    } else {
      // Python
      const pyOptions: RunPyOptions = {};

      if (args["nodefs-root"]) {
        pyOptions.nodeFSRoot = args["nodefs-root"] as string;
        pyOptions.nodeFSMountPoint = (args["nodefs-mount"] as string) ||
          pyOptions.nodeFSRoot;
      }

      const packagesArg = (args.packages || args.p) as string | undefined;
      if (packagesArg) {
        try {
          pyOptions.packages = JSON.parse(packagesArg);
        } catch {
          console.error(
            `Invalid --packages JSON: "${packagesArg}"\nExpected format: '{"import_name":"pypi_name"}'`,
          );
          Deno.exit(1);
        }
      }

      const stream = await runPy(
        code,
        Object.keys(pyOptions).length ? pyOptions : undefined,
      );
      await streamToStdout(stream);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    Deno.exit(1);
  }
}

main();
