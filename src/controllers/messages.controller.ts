/// <reference path="../types/hono.d.ts" />
/// <reference path="../types/dom.d.ts" />

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { CONFIG, createLogger } from "../config.ts";

const logger = createLogger("messages");

export const messageHandler = (app: OpenAPIHono) => {
  // CORS preflight handler
  app.options("/messages", (c: any) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    return c.text("", 200);
  });

  // Main messages handler
  app.openapi(
    createRoute({
      method: "post",
      path: `/messages`,
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                message: z.string(),
                redirectTo: z.string(),
                method: z.string(),
              }),
            },
          },
          description: "Message processed successfully",
        },
        400: {
          content: {
            "application/json": {
              schema: z.object({
                code: z.number(),
                message: z.string(),
              }),
            },
          },
          description: "Bad request",
        },
      },
    }),
    async (c: any) => {
      const startTime = Date.now();
      const requestId = Math.random().toString(36).substring(7);
      
      logger.info(`Message handler started [${requestId}]`);
      
      try {
        // Add CORS headers for cross-origin requests
        c.header("Access-Control-Allow-Origin", "*");
        c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
        c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
        c.header("Content-Type", "application/json");
        
        const body = await c.req.json();
        logger.info(`Message body [${requestId}]:`, JSON.stringify(body, null, 2));
        
        // For now, redirect to main MCP endpoint since this is a generic message handler
        const elapsed = Date.now() - startTime;
        logger.info(`Message redirected to MCP endpoint in ${elapsed}ms [${requestId}]`);
        
        return c.json({
          message: "Use /mcp endpoint for MCP protocol communication",
          redirectTo: "/mcp",
          method: "POST"
        });
        
      } catch (error) {
        const elapsed = Date.now() - startTime;
        logger.error(`Message handler error after ${elapsed}ms [${requestId}]:`, error);
        
        return c.json(
          {
            code: 400,
            message: error instanceof Error ? error.message : "Invalid message format",
          },
          400
        );
      }
    }
  );
};
