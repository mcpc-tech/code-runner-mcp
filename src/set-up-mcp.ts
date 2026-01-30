import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { cwd as jsCwd, runJS } from "./service/js-runner.ts";
import { runPy } from "./service/py-runner.ts";
import {
  getJavaScriptPrompt,
  getPythonPrompt,
  shouldEnableTool,
} from "./utils/prompt-helpers.ts";
import { z } from "zod";
import process from "node:process";

const nodeFSRoot = process.env.NODEFS_ROOT;
const nodeFSMountPoint = process.env.NODEFS_MOUNT_POINT;
const denoPermissionArgs = process.env.DENO_PERMISSION_ARGS || "";
const allowedTools = process.env.ALLOWED_TOOLS || "all"; // "all" | "python" | "javascript" | "js"

export const INCOMING_MSG_ROUTE_PATH = "/code-runner/messages";

export function setUpMcpServer(
  ...args: ConstructorParameters<typeof McpServer>
): InstanceType<typeof McpServer> {
  const server = new McpServer(...args);

  if (shouldEnableTool("python", allowedTools)) {
    server.tool(
      "python-code-runner",
      getPythonPrompt(nodeFSRoot, nodeFSMountPoint),
      z.object({
        code: z.string().describe(
          "Python code to execute. MUST use print() to see results.",
        ),
        packages: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Map import names to PyPI package names. Use when names differ or for indirectly imported packages. Example: {"sklearn": "scikit-learn", "openpyxl": "openpyxl"}',
          ),
      }).shape,
      async ({ code, packages }, extra) => {
        const options = nodeFSRoot
          ? {
            nodeFSRoot,
            ...(nodeFSMountPoint && { nodeFSMountPoint }),
            ...(packages && { packages }),
          }
          : packages
          ? { packages }
          : undefined;

        const stream = await runPy(code, options, extra.signal);
        const decoder = new TextDecoder();
        let output = "";
        for await (const chunk of stream) {
          output += decoder.decode(chunk);
        }
        return {
          content: [{ type: "text", text: output || "(no output)" }],
        };
      },
    );
  }

  if (shouldEnableTool("javascript", allowedTools)) {
    server.tool(
      "javascript-code-runner",
      getJavaScriptPrompt(jsCwd, denoPermissionArgs),
      z.object({
        code: z.string().describe(
          "JavaScript/TypeScript code to execute. MUST use console.log() to see results.",
        ),
      }).shape,
      async ({ code }, extra) => {
        const stream = await runJS(code, extra.signal);
        const decoder = new TextDecoder();
        let output = "";
        for await (const chunk of stream) {
          output += decoder.decode(chunk);
        }
        const finalOutput = output ||
          "(no output)\n\n**Tip:** Use `console.log()` to see results. Make sure to write output to stdout.";
        return {
          content: [{ type: "text", text: finalOutput }],
        };
      },
    );
  }

  return server;
}
