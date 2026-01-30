# Code Runner MCP

[![smithery badge](https://smithery.ai/badge/@mcpc-tech/mcpc)](https://smithery.ai/server/@mcpc-tech/mcpc)
[![JSR](https://jsr.io/badges/@mcpc/code-runner-mcp)](https://jsr.io/@mcpc/code-runner-mcp)

🚀 **Let AI execute JavaScript/Python code with any package imports!**

<img src="./logo.png" width="200" height="200" alt="code-runner-logo">

## ✨ Core Value

- **🔒 Secure Sandbox**: Isolated execution environment protecting your host
  system
- **📦 Install-on-Demand**: Dynamically import any npm/PyPI packages
- **🎯 Reduce Hallucinations**: Let AI verify logic by executing code
- **⚡ Quick Validation**: Test if packages meet your needs without local
  installation

> 🌐 Try it online:
> [smithery.ai](https://smithery.ai/server/@mcpc-tech/mcpc/tools)

## 🚀 Quick Start

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
      "args": [
        "-y",
        "deno",
        "run",
        "--allow-all",
        "jsr:@mcpc/code-runner-mcp/bin"
      ],
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

## 💡 Use Cases

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

### File System Access

```python
# Access host file system (via NODEFS_ROOT and NODEFS_MOUNT_POINT)
import os
files = os.listdir('/tmp')  # List files at the mount point
print(f"Found {len(files)} files")
```

## ⚙️ Environment Variables

- **`DENO_PERMISSION_ARGS`**: JS/TS execution permissions (e.g.,
  `--allow-env --allow-net`)
- **`NODEFS_ROOT`**: Host file system root directory path for Python access
- **`NODEFS_MOUNT_POINT`**: Mount point path in Python environment (defaults to
  NODEFS_ROOT if not specified)
- **`PYODIDE_PACKAGE_BASE_URL`**: Custom package download source for Pyodide
  (e.g., private mirror CDN)

## 🛡️ Security Features

- **Deno Sandbox**: Strict permission control with explicit authorization
- **Pyodide WASM**: WebAssembly isolated environment
- **File System Isolation**: Controlled host file access

## 📋 Technical Architecture

- **JavaScript/TypeScript**: Powered by [Deno](https://deno.land/) runtime
- **Python**: Powered by [Pyodide](https://pyodide.org/) WebAssembly technology
- **Package Management**: Dynamic installation from npm, JSR, and PyPI

---

💬 **Issues & Feedback**:
[GitHub Issues](https://github.com/mcpc-tech/code-runner-mcp/issues)\
🌟 **Repository**:
[GitHub Repository](https://github.com/mcpc-tech/code-runner-mcp)
