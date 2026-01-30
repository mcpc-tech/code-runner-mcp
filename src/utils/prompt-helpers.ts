/**
 * Prompt helper functions for generating tool descriptions
 */

/**
 * Generate Python runner prompt
 */
export function getPythonPrompt(
  nodeFSRoot: string | undefined,
  nodeFSMountPoint: string | undefined,
): string {
  const mountPoint = nodeFSMountPoint || nodeFSRoot;
  const hasFS = !!mountPoint;

  return `Execute Python code in a Pyodide WebAssembly sandbox. Return stdout/stderr.

## When to Use
- Data analysis (pandas, numpy)
- Math/statistics
- Text processing
- Validate logic by execution
${
    hasFS
      ? `- File ops at \`${mountPoint}\` only`
      : "- No file system access (in-memory only)"
  }

## Parameters

**code** (required): Python code. MUST use \`print()\` to see results. **Tip:** Use single quotes and avoid f-strings/backticks to prevent JSON escaping issues.

**packages** (optional): Map import names to PyPI package names. Use when names differ (e.g., sklearn→scikit-learn) or for indirectly imported packages (e.g., openpyxl for pandas).
Example: {"sklearn": "scikit-learn", "openpyxl": "openpyxl"}

## File System
${
    hasFS
      ? `- ONLY \`${mountPoint}\` is accessible
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
Use \`packages: {"sklearn": "scikit-learn"}\`

## Common Errors
| Error | Fix |
|-------|-----|
| \`(no output)\` | Add \`print()\` statements |
| \`Permission denied\` | ${
    hasFS ? `Use \`${mountPoint}\` path only` : "File system not available"
  } |`;
}

/**
 * Generate JavaScript runner prompt
 */
export function getJavaScriptPrompt(
  cwd: string,
  args: string,
): string {
  const permissions = getJSPermissions(cwd, args);

  return `Execute a JavaScript/TypeScript snippet using Deno runtime and return the combined stdout/stderr(To see the results, make sure to write to stdout/stderr).
Send only valid JavaScript/TypeScript code compatible with Deno runtime (prefer ESM syntax).
** Runs on server-side, not browser. **

## When to Use
- Web development and API interactions
- File system operations and automation
- JSON/data manipulation and processing
- Building command-line utilities
- Testing TypeScript/JavaScript logic
- Working with modern web APIs and libraries
- Server-side scripting tasks

## Parameters

**code** (required): JavaScript/TypeScript code. MUST use \`console.log()\` to see results.

## Packages Support

**npm packages:** \`import { get } from "npm:lodash-es"\`

**Deno packages (JSR):** \`import { serve } from "jsr:@std/http"\`

**Node.js built-in:** \`import fs from "node:fs"\`

## Examples

\`\`\`javascript
import { chunk } from "npm:lodash-es";
const arr = [1, 2, 3, 4, 5, 6];
console.log(chunk(arr, 2));
\`\`\`

## Common Errors
| Error | Fix |
|-------|-----|
| \`(no output)\` | Add \`console.log()\` statements |

## Permissions
${permissions}
- Set \`DENO_PERMISSION_ARGS\` env var for more (e.g., \`--allow-net\`, \`--allow-all\`)`;
}

/**
 * Generate permission section for JavaScript runner
 */
function getJSPermissions(cwd: string, args: string): string {
  const hasAllowAll = args.includes("--allow-all");
  const current = `\`--allow-read=${cwd}/\` \`--allow-write=${cwd}/\`${
    args ? ` ${args}` : ""
  }`;

  if (hasAllowAll) {
    return `- Current: ${current}
- File system: Full access enabled`;
  }

  return `- Current: ${current}
- File system: ONLY \`${cwd}/\` is accessible
| \`Permission denied\` | Use \`${cwd}/\` path only |`;
}

/**
 * Check if a tool should be enabled based on ALLOWED_TOOLS env var
 */
export function shouldEnableTool(
  name: "python" | "javascript",
  allowedTools: string,
): boolean {
  if (allowedTools === "all" || allowedTools === "") return true;
  const tools = allowedTools.split(",").map((t) => t.trim().toLowerCase());
  if (tools.includes("all")) return true;
  if (name === "python") return tools.includes("python");
  if (name === "javascript") {
    return tools.includes("javascript") || tools.includes("js");
  }
  return false;
}
