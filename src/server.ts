/// <reference path="./types/dom.d.ts" />
/// <reference path="./types/dom.d.ts" />
import { OpenAPIHono } from "@hono/zod-openapi";
import { createApp } from "./app.ts";
// import process from "node:process"; // Use Deno.env instead

// Declare Deno global for TypeScript
declare const Deno: any;

const port = Number(Deno.env.get("PORT") || "9000");
const hostname = "0.0.0.0";

console.log(`[server] Starting Code Runner MCP Server...`);
console.log(`[server] Environment: ${Deno.env.get("NODE_ENV") || 'development'}`);
console.log(`[server] Port: ${port}`);
console.log(`[server] Hostname: ${hostname}`);

const app = new OpenAPIHono();

// Add request logging middleware
app.use('*', async (c: any, next: any) => {
  const start = Date.now();
  const { method, url } = c.req;
  
  await next();
  
  const elapsed = Date.now() - start;
  const { status } = c.res;
  
  console.log(`[${new Date().toISOString()}] ${method} ${url} - ${status} (${elapsed}ms)`);
});

// Mount routes at root path instead of /code-runner
app.route("/", createApp());

// Add a simple root endpoint for health check
app.get("/", (c: any) => {
  return c.json({ 
    message: "Code Runner MCP Server is running!", 
    version: "0.2.0",
    transport: "streamable-http",
    endpoints: {
      mcp: "/mcp",
      "mcp-test": "/mcp-test",
      "mcp-simple": "/mcp-simple", 
      health: "/health",
      messages: "/messages",
      tools: "/tools"
    },
    timestamp: new Date().toISOString(),
    debug: {
      port: port,
      hostname: hostname,
      env: Deno.env.get("NODE_ENV") || 'development'
    }
  });
});

// Global error handler
app.onError((err: any, c: any) => {
  console.error(`[server] Error: ${err.message}`);
  console.error(`[server] Stack: ${err.stack}`);
  
  return c.json({
    error: "Internal Server Error",
    message: err.message,
    timestamp: new Date().toISOString()
  }, 500);
});

console.log(`[server] Starting Deno server on ${hostname}:${port}...`);

try {
  Deno.serve(
    {
      port,
      hostname,
      onError: (error: any) => {
        console.error("[server] Server error:", error);
        return new Response("Internal Server Error", { status: 500 });
      },
    },
    app.fetch
  );
  
  console.log(`[server] ✅ Server started successfully on ${hostname}:${port}`);
  console.log(`[server] 🔗 Health check: http://${hostname}:${port}/health`);
  console.log(`[server] 🚀 MCP endpoint: http://${hostname}:${port}/mcp`);
} catch (error) {
  console.error("[server] ❌ Failed to start server:", error);
  Deno.exit(1);
}
