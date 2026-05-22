import { setUpMcpServer } from "./set-up-mcp.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const server: McpServer = setUpMcpServer(
  {
    name: "code-runner-mcp",
    version: "0.1.0",
  },
  { capabilities: { tools: {} } },
);
