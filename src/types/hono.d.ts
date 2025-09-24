// Hono and MCP type declarations

// Basic Context and Next types
interface Context {
  req: Request;
  res: Response;
  json(data: any): Response;
  text(text: string): Response;
  status(status: number): Context;
  header(key: string, value: string): Context;
  set(key: string, value: any): void;
  get(key: string): any;
}

interface Next {
  (): Promise<void>;
}

// Basic Zod schema type
interface ZodSchema {
  parse(data: any): any;
  safeParse(data: any): { success: boolean; data?: any; error?: any };
}

declare module "@hono/zod-openapi" {
  export interface RouteConfig {
    method: "get" | "post" | "put" | "delete" | "patch";
    path: string;
    request?: {
      body?: {
        content: {
          "application/json": {
            schema: ZodSchema;
          };
        };
      };
      params?: ZodSchema;
      query?: ZodSchema;
    };
    responses: Record<string, {
      description: string;
      content?: {
        "application/json"?: {
          schema: ZodSchema;
        };
        "text/event-stream"?: {
          schema: ZodSchema;
        };
        "text/plain"?: {
          schema: ZodSchema;
        };
      };
    }>;
    tags?: string[];
    summary?: string;
    description?: string;
  }

  export function createRoute(config: RouteConfig): RouteConfig;

  export class OpenAPIHono {
    use(path: string, handler: (c: Context, next: Next) => Promise<void> | void): OpenAPIHono;
    get(path: string, handler: (c: Context) => Response | Promise<Response>): OpenAPIHono;
    post(path: string, handler: (c: Context) => Response | Promise<Response>): OpenAPIHono;
    put(path: string, handler: (c: Context) => Response | Promise<Response>): OpenAPIHono;
    delete(path: string, handler: (c: Context) => Response | Promise<Response>): OpenAPIHono;
    options(path: string, handler: (c: Context) => Response | Promise<Response>): OpenAPIHono;
    patch(path: string, handler: (c: Context) => Response | Promise<Response>): OpenAPIHono;
    openapi<T extends RouteConfig>(
      route: T,
      handler: (c: Context) => Response | Promise<Response>
    ): OpenAPIHono;
    route(path: string, app: OpenAPIHono): OpenAPIHono;
    onError(handler: (err: any, c: Context) => Response | Promise<Response>): OpenAPIHono;
    fetch: (request: Request, env?: any, executionContext?: any) => Response | Promise<Response>;
  }

  export const z: {
    object(shape: Record<string, any>): ZodSchema;
    string(): ZodSchema;
    number(): ZodSchema;
    boolean(): ZodSchema;
    array(schema: ZodSchema): ZodSchema;
    union(schemas: ZodSchema[]): ZodSchema;
    literal(value: any): ZodSchema;
    optional(): ZodSchema;
    nullable(): ZodSchema;
    any(): ZodSchema;
  };
}

declare module "@mcpc/core" {
  export function openApiDocsHandler(config?: any): (c: Context) => Response | Promise<Response>;
}