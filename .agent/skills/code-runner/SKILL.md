---
name: code-runner
description: >
  Use this skill to execute JavaScript/TypeScript or Python code with any npm,
  JSR, or PyPI package — no local installation needed. Triggers on: "run code",
  "execute", "try package X", "test this snippet", "verify this logic".
---

# code-runner-mcp Skill

This skill helps you use the `code-runner-mcp` tools and CLI to execute
JavaScript/TypeScript (via Deno) or Python (via Pyodide/WASM) code in a secure,
isolated sandbox with on-demand package installation.

## Available Tools

Two MCP tools are registered when the server is running:

| Tool                     | Language | Runtime           |
| ------------------------ | -------- | ----------------- |
| `javascript-code-runner` | JS / TS  | Deno (subprocess) |
| `python-code-runner`     | Python   | Pyodide (WASM)    |

Both tools return combined stdout + stderr as text.

## CLI Usage

> **No Deno?**
>
> - Install: `npm i -g deno`
> - Or skip install entirely: replace `deno run --allow-all` with
>   `npx -y deno run --allow-all`
>
> **Silent mode** — suppress Deno's download/progress output:
>
> ```bash
> deno run --allow-all --quiet jsr:@mcpc/code-runner-mcp/cli js "console.log('hello')"
> ```

```bash
# Inline code
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli js "console.log('hello')"
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli py "print(1 + 2)"

# From a file
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli js --file ./script.ts
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli py --file ./analysis.py

# Piped from stdin
echo "print('piped')" | deno run --allow-all jsr:@mcpc/code-runner-mcp/cli py
cat app.ts | deno run --allow-all jsr:@mcpc/code-runner-mcp/cli js

# Python with package mapping
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli py --file analysis.py \
  --packages '{"sklearn":"scikit-learn","PIL":"Pillow"}'

# Python with host filesystem mount
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli py --file script.py \
  --nodefs-root /tmp --nodefs-mount /tmp
```

### CLI Flags

| Flag                   | Alias | Description                          |
| ---------------------- | ----- | ------------------------------------ |
| `--file <path>`        | `-f`  | Read code from a file                |
| `--packages <json>`    | `-p`  | Python: map import→PyPI names (JSON) |
| `--nodefs-root <dir>`  |       | Python: host dir to mount            |
| `--nodefs-mount <dir>` |       | Python: mount point in Pyodide FS    |
| `--help`               | `-h`  | Show help                            |

## JavaScript / TypeScript

### Key rules

- Use `console.log()` to produce output — no output = `(no output)` returned
- Import npm packages: `import { x } from "npm:package-name"`
- Import JSR packages: `import { y } from "jsr:@scope/pkg"`
- Node built-ins: `import fs from "node:fs"`
- Code runs server-side in Deno, not in a browser
- File system access is limited to the temp `cwd` directory unless
  `DENO_PERMISSION_ARGS=--allow-all` is set

### Example

```typescript
import { chunk } from "npm:lodash-es";
import { z } from "npm:zod";

const schema = z.object({ name: z.string(), age: z.number() });
const result = schema.safeParse({ name: "Alice", age: 30 });
console.log(result.success); // true
console.log(chunk([1, 2, 3, 4, 5], 2));
```

## Python

### Key rules

- Use `print()` to produce output
- Packages are auto-installed via `micropip` — just import them
- When the import name differs from the PyPI name, pass the `packages` map:
  `{"sklearn": "scikit-learn", "PIL": "Pillow", "cv2": "opencv-python"}`
- Runs in WASM (Pyodide) — not a real CPython; some C-extension packages won't
  be available
- Timeout: 3 minutes (heavy imports like pandas can take a moment on first run)

### Example

```python
import pandas as pd
import numpy as np

data = {"x": np.arange(5), "y": np.random.rand(5)}
df = pd.DataFrame(data)
print(df.describe())
```

### Packages map examples

| Import    | PyPI name        |
| --------- | ---------------- |
| `sklearn` | `scikit-learn`   |
| `PIL`     | `Pillow`         |
| `cv2`     | `opencv-python`  |
| `bs4`     | `beautifulsoup4` |
| `yaml`    | `PyYAML`         |

## Environment Variables

Set these when starting the MCP server or before running the CLI:

| Variable                    | Effect                                                      |
| --------------------------- | ----------------------------------------------------------- |
| `ALLOWED_TOOLS`             | `all` / `python` / `javascript` / `js`                      |
| `DENO_PERMISSION_ARGS`      | Extra Deno permissions, e.g. `--allow-net` or `--allow-all` |
| `NODEFS_ROOT`               | Host directory to expose to Python                          |
| `NODEFS_MOUNT_POINT`        | Where to mount it in Pyodide FS                             |
| `PYODIDE_PACKAGE_CACHE_DIR` | Custom cache dir for Pyodide packages                       |
| `PYODIDE_PACKAGE_BASE_URL`  | Custom CDN mirror for Pyodide packages                      |
| `DEBUG`                     | Set to any value to enable verbose runner logs              |

## Gotchas

### JavaScript

- **No output?** Always add `console.log()`. Bare expressions don't print.
- **Permission denied?** JS code can only write to the runner's temp `cwd`
  unless `DENO_PERMISSION_ARGS=--allow-all` is set.
- **`--allow-all` conflicts with other `--allow-*` flags** — set only one mode.
- **Imports must be ESM** — `require()` is not supported; use `import`.
- **TypeScript types** are erased at runtime; type errors won't block execution.

### Python

- **No output?** Always use `print()`. Expression results are not echoed.
- **Package not found?** Use the `packages` map when import name ≠ PyPI name.
- **Syntax errors?** Avoid triple-quoted strings when sending code as JSON. Use
  single quotes or string concatenation instead.
- **Slow first run?** Pyodide and packages are downloaded/cached on first use.
  Subsequent runs in the same session are fast.
- **C extensions unavailable** — packages like `torch` or `lxml` that require
  compiled C code may not work in Pyodide.
- **File access** — only accessible if `NODEFS_ROOT` is configured.
- **`await` at top-level** is supported (`runPythonAsync` is used internally).

### CLI specific

- Inline code with special shell characters should be **single-quoted**:
  `deno task cli py 'print(f"value: {1+1}")'`
- The `--packages` flag expects **valid JSON** — double-quote all keys/values.
- Piped stdin is only read when stdin is **not a TTY** (i.e. when actually
  piped), so interactive use won't hang waiting for input.

## Quick Reference

```bash
# JS: test an npm package
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli js 'import { format } from "npm:date-fns"; console.log(format(new Date(), "yyyy-MM-dd"))'

# Python: data analysis
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli py 'import pandas as pd; df = pd.DataFrame({"a":[1,2,3]}); print(df.sum())'

# Python: package with name mismatch
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli py --packages '{"sklearn":"scikit-learn"}' --file model.py

# JS: read/write a file in sandbox
deno run --allow-all jsr:@mcpc/code-runner-mcp/cli js 'import fs from "node:fs"; import os from "node:os"; const p = os.tmpdir()+"/.deno_runner_tmp/out.txt"; fs.writeFileSync(p,"hi"); console.log(fs.readFileSync(p,"utf8"))'
```
