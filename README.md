# Code Runner MCP

[![JSR](https://jsr.io/badges/@mcpc/code-runner-mcp)](https://jsr.io/@mcpc/code-runner-mcp)
[![npm](https://img.shields.io/npm/v/@mcpc-tech/code-runner-mcp)](https://www.npmjs.com/package/@mcpc-tech/code-runner-mcp)

Let AI execute JavaScript/Python code with any package imports!

<img src="./logo.png" width="200" height="200" alt="code-runner-logo">

## Core Value

- **Secure Sandbox**: Isolated execution environment protecting your host
  system
- **Install-on-Demand**: Dynamically import any npm/PyPI packages
- **Reduce Hallucinations**: Let AI verify logic by executing code
- **Quick Validation**: Test if packages meet your needs without local
  installation

## Installation

### JSR (Recommended)

```bash
deno add jsr:@mcpc/code-runner-mcp
```

Package: `@mcpc/code-runner-mcp`

### npm

```bash
npm install @mcpc-tech/code-runner-mcp
```

Package: `@mcpc-tech/code-runner-mcp`

## Quick Start

### Option 1: Using Deno (Recommended)

```json
{
  "mcpServers": {
    "code-runner": {
      "command": "deno",
      "args": ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
      "env": {
        "DENO_PERMISSION_ARGS": "--allow-net",
        "NODEFS_ROOT": "/tmp",
        "NODEFS_MOUNT_POINT": "/tmp"
      },
      "transportType": "stdio"
    }
  }
}
```

### Option 2: Using Node.js

```json
{
  "mcpServers": {
    "code-runner": {
      "command": "npx",
      "args": ["-y", "@mcpc-tech/code-runner-mcp"],
      "env": {
        "NODE_OPTIONS": "--experimental-wasm-stack-switching",
        "DENO_PERMISSION_ARGS": "--allow-net",
        "NODEFS_ROOT": "/tmp",
        "NODEFS_MOUNT_POINT": "/tmp"
      },
      "transportType": "stdio"
    }
  }
}
```

> **Note**: `NODE_OPTIONS=--experimental-wasm-stack-switching` is required for
> Pyodide (WebAssembly Python runtime) to work properly in Node.js.

## Use Cases

### JavaScript/TypeScript

```javascript
// Import npm packages directly to test functionality
import { z } from "npm:zod";
import { serve } from "jsr:@std/http";

const schema = z.object({ name: z.string() });
console.log(schema.parse({ name: "test" }));
```

### Python

```python
# Dynamically install and use Python packages
import requests
response = requests.get("https://api.github.com")
print(f"Status code: {response.status_code}")
```

#### Package Mapping

When import names differ from PyPI package names, use the `packages` parameter:

```python
# sklearn -> scikit-learn, PIL -> Pillow
from sklearn.datasets import load_iris
data = load_iris()
print(data.feature_names)
```

Use `packages: {"sklearn": "scikit-learn"}`

### File System Access

```python
# Access host file system (via NODEFS_ROOT and NODEFS_MOUNT_POINT)
import os
files = os.listdir('/tmp')  # List files at the mount point
print(f"Found {len(files)} files")
```

## Environment Variables

| Variable                        | Description                                                                                                   | Default |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- |
| **`ALLOWED_TOOLS`**             | Selectively enable tools: `all`, `python`, `javascript`, `js`, or comma-separated (e.g., `python,javascript`) | `all`   |
| **`DENO_PERMISSION_ARGS`**      | Additional Deno permissions for JS/TS execution (e.g., `--allow-net`, `--allow-all`)                          | -       |
| **`NODEFS_ROOT`**               | Host file system root directory path for Python access                                                        | -       |
| **`NODEFS_MOUNT_POINT`**        | Mount point path in Python environment (defaults to `NODEFS_ROOT`)                                            | -       |
| **`PYODIDE_PACKAGE_BASE_URL`**  | Custom package download source for Pyodide (e.g., private mirror CDN)                                         | -       |
| **`PYODIDE_PACKAGE_CACHE_DIR`** | Custom package cache directory for Pyodide packages (Pyodide v0.28.1+)                                        | -       |

### Tool Selection Examples

```json
// Enable only Python
{ "ALLOWED_TOOLS": "python" }

// Enable only JavaScript
{ "ALLOWED_TOOLS": "javascript" }

// Enable both (default)
{ "ALLOWED_TOOLS": "python,javascript" }
```

## Security Features

- **Deno Sandbox**: Strict permission control with explicit authorization
- **Pyodide WASM**: WebAssembly isolated environment
- **File System Isolation**: Controlled host file access

## Technical Architecture

- **JavaScript/TypeScript**: Powered by [Deno](https://deno.land/) runtime
- **Python**: Powered by [Pyodide](https://pyodide.org/) WebAssembly technology
- **Package Management**: Dynamic installation from npm, JSR, and PyPI

---

**Issues & Feedback**:
[GitHub Issues](https://github.com/mcpc-tech/code-runner-mcp/issues)  
**Repository**:
[GitHub Repository](https://github.com/mcpc-tech/code-runner-mcp)
