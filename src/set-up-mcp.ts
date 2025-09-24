import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runJS } from "./service/js-runner.ts";
import { runPy } from "./service/py-runner.ts";
import { z } from "zod";
// import process from "node:process"; // Use Deno.env instead

const nodeFSRoot = Deno.env.get("NODEFS_ROOT");
const nodeFSMountPoint = Deno.env.get("NODEFS_MOUNT_POINT");
const denoPermissionArgs = Deno.env.get("DENO_PERMISSION_ARGS") || "--allow-net";

export const INCOMING_MSG_ROUTE_PATH = "/messages";

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
    `Execute a Python snippet using pyodide and return the combined stdout/stderr (To see the results, make sure to write to stdout/stderr). 
Send only valid Python code compatible with pyodide runtime.
# Use When
- Data analysis and scientific computing tasks (e.g., using pandas to analyze JSON data)
- Machine learning and AI experiments
- Mathematical calculations and statistics
- Text processing and natural language tasks
- Prototyping algorithms or logic
- Educational demonstrations of Python concepts

# Parameters
This tool accepts two parameters:
**code** (required): Python source code to execute
- Send only valid Python code compatible with pyodide runtime
- Make sure to write to stdout/stderr to see results
- You can directly import pure Python packages with wheels as well as packages from PyPI, the JsDelivr CDN or from other URLs

**importToPackageMap** (optional but recommended): Package name mappings for imports
- **IMPORTANT**: Many popular packages have different import names vs package names
- **Always consider** if your imports need this mapping, especially for: sklearn, cv2, PIL, skimage, etc.
- Format: \`{"import_name": "package_name"}\`
- Common examples: \`{"sklearn": "scikit-learn", "cv2": "opencv-python", "PIL": "Pillow", "skimage": "scikit-image"}\`
- **When to use**: Import name differs from package name, or you need custom package versions
- **Default mappings included**: sklearn→scikit-learn, PIL→Pillow, cv2→opencv-python, skimage→scikit-image
- **Overrides**: Your mappings will override defaults for specified imports
- **Auto-handling**: Dotted imports work automatically (sklearn.model_selection → sklearn)

${
  nodeFSMountPoint || nodeFSRoot
    ? `# File System
You can **ONLY** access files at \`${
        nodeFSMountPoint || nodeFSRoot
      }\`, ALLWAYS use this path when working with files.`
    : ""
}`,
    z.object({
      code: z.string().describe("Python source code to execute"),
      importToPackageMap: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "HIGHLY RECOMMENDED for imports like sklearn, cv2, PIL, skimage, etc. " +
            "Mapping from import names to package names for micropip installation. " +
            "Common examples: {'sklearn': 'scikit-learn', 'cv2': 'opencv-python', 'PIL': 'Pillow', 'skimage': 'scikit-image'}. " +
            "Always consider if your imports need this mapping. Overrides default mappings for specified imports."
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
      
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          output += decoder.decode(value);
        }
      } finally {
        reader.releaseLock();
      }
      return {
        content: [{ type: "text", text: output || "(no output)" }],
      };
    }
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
      
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          output += decoder.decode(value);
        }
      } finally {
        reader.releaseLock();
      }
      return {
        content: [{ type: "text", text: output || "(no output)" }],
      };
    }
  );

  return server;
}
