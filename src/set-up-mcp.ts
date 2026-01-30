import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runJS } from "./service/js-runner.ts";
import { runPy } from "./service/py-runner.ts";
import { z } from "zod";
import process from "node:process";

const nodeFSRoot = process.env.NODEFS_ROOT;
const nodeFSMountPoint = process.env.NODEFS_MOUNT_POINT;
const denoPermissionArgs = process.env.DENO_PERMISSION_ARGS || "--allow-net";

export const INCOMING_MSG_ROUTE_PATH = "/code-runner/messages";

/**
 * TODO: Stream tool result;
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling#tool-call-id
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/issues/117
 */
export function setUpMcpServer(
  ...args: ConstructorParameters<typeof McpServer>
): InstanceType<typeof McpServer> {
  const server = new McpServer(...args);

  server.tool(
    "python-code-runner",
    `Execute Python code in a Pyodide WebAssembly sandbox. Return stdout/stderr.

## When to Use
- Data analysis (pandas, numpy)
- Math/statistics
- Text processing
- Validate logic by execution
${
      nodeFSMountPoint || nodeFSRoot
        ? `- File ops at \`${nodeFSMountPoint || nodeFSRoot}\` only`
        : "- No file system access (in-memory only)"
    }

## Parameters

**code** (required): Python code. MUST use \`print()\` to see results.

**importToPackageMap** (optional): Map import names → PyPI package names. Only needed when they differ.

**Needs mapping:** sklearn→scikit-learn, PIL→Pillow, cv2→opencv-python, skimage→scikit-image, docx→python-docx

**No mapping needed:** numpy, pandas, requests, matplotlib, openpyxl, PyPDF2, pdfplumber

**Missing dependencies:** If you get \`ModuleNotFoundError\`, install the package manually at the beginning of your code:
\`\`\`python
import micropip
await micropip.install('package-name')
\`\`\`

## File System
${
      nodeFSMountPoint || nodeFSRoot
        ? `- ONLY \`${nodeFSMountPoint || nodeFSRoot}\` is accessible
${nodeFSRoot ? `- Host path: \`${nodeFSRoot}\`` : ""}`
        : "- File system access is NOT available. Only in-memory operations are supported."
    }

## Examples

**Basic:**
\`\`\`python
import pandas as pd
df = pd.DataFrame({"a": [1,2,3]})
print(df.describe())
\`\`\`

**With mapping:**
\`\`\`python
from sklearn.datasets import load_iris
data = load_iris()
print(data.feature_names)
\`\`\`
Use \`importToPackageMap: {"sklearn": "scikit-learn"}\`

## Common Errors
| Error | Fix |
|-------|-----|
| \`(no output)\` | Add \`print()\` statements |
| \`ModuleNotFoundError\` | Add importToPackageMap |
| \`Permission denied\` | ${
      nodeFSMountPoint || nodeFSRoot
        ? `Use \`${nodeFSMountPoint || nodeFSRoot}\` path only`
        : "File system not available"
    } |
`,
    z.object({
      code: z.string().describe(
        "Python code to execute. MUST use print() to see results.",
      ),
      importToPackageMap: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Map import names to PyPI package names when they differ. " +
            "Required: sklearn→scikit-learn, PIL→Pillow, cv2→opencv-python, skimage→scikit-image, docx→python-docx. " +
            "Not needed: numpy, pandas, requests, matplotlib, openpyxl, PyPDF2, pdfplumber",
        ),
    }).shape,
    async ({ code, importToPackageMap }, extra) => {
      const options = nodeFSRoot
        ? {
          nodeFSRoot,
          ...(nodeFSMountPoint && { nodeFSMountPoint }),
          ...(importToPackageMap && { importToPackageMap }),
        }
        : importToPackageMap
        ? { importToPackageMap }
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

  server.tool(
    "javascript-code-runner",
    `Execute a JavaScript/TypeScript snippet using Deno runtime and return the combined stdout/stderr(To see the results, make sure to write to stdout/stderr ). 
Send only valid JavaScript/TypeScript code compatible with Deno runtime (prefer ESM syntax).
** Runs on server-side, not browser. **
# Use When
- Web development and API interactions
- File system operations and automation
- JSON/data manipulation and processing
- Building command-line utilities
- Testing TypeScript/JavaScript logic
- Working with modern web APIs and libraries
- Server-side scripting tasks
# Packages Support
1. For npm packages (ESM preferred):
    import { get } from "npm:lodash-es"
    import { z } from "npm:zod"
2. For Deno packages from JSR:
    import { serve } from "jsr:@std/http"
    import { join } from "jsr:@std/path"
3. Support NodeJS built-in modules:
    import fs from "node:fs"
    import path from "node:path"
# Strict Deno Permissions
- By default, Deno runs with strict permissions.
- Current permissions are: ${denoPermissionArgs}
`,
    z.object({
      code: z.string().describe("JavaScript/TypeScript source code to execute"),
    }).shape,
    async ({ code }, extra) => {
      const stream = await runJS(code, extra.signal);
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

  return server;
}
