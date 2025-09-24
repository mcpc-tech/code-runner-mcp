/// <reference path="../types/hono.d.ts" />

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

// Simplified SSE handler for backward compatibility
export const sseHandler = (app: OpenAPIHono) =>
  app.openapi(
    createRoute({
      method: "get",
      path: "/sse",
      responses: {
        200: {
          content: {
            "text/event-stream": {
              schema: z.any(),
            },
          },
          description: "DEPRECATED: Use /mcp endpoint with Streamable HTTP instead",
        },
        400: {
          content: {
            "application/json": {
              schema: z.any(),
            },
          },
          description: "Returns an error",
        },
      },
    }),
    async (c: any) => {
      // Redirect to the new streamable HTTP endpoint
      return c.redirect("/mcp", 301);
    }
  );
