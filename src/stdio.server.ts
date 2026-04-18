import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { log } from "./log.ts";
import { server } from "./app.ts";

// Stdio mode: console output would corrupt the JSON-RPC stream, so silence it.
log.silent = true;

const transport = new StdioServerTransport();

(async () => {
  await server.connect(transport);
})();
