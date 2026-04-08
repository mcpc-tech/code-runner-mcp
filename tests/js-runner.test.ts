import { assertEquals, assertStringIncludes } from "./setup.ts";
import { readStreamWithTimeout } from "./setup.ts";
import { runJS } from "../src/service/js-runner.ts";

Deno.test({
  name: "JavaScript Runner - Basic Execution",
  async fn() {
    const code = `console.log("Hello, World!");`;
    const stream = runJS(code);
    const output = await readStreamWithTimeout(stream, 10000);

    assertStringIncludes(output, "Hello, World!");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - TypeScript Support",
  async fn() {
    const code = `
      interface Person {
        name: string;
        age: number;
      }
      
      const person: Person = { name: "Alice", age: 30 };
      console.log(\`Name: \${person.name}, Age: \${person.age}\`);
    `;

    const stream = runJS(code);
    const output = await readStreamWithTimeout(stream, 10000);

    assertStringIncludes(output, "Name: Alice, Age: 30");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Import npm package",
  async fn() {
    const code = `
      import { z } from "npm:zod";
      
      const UserSchema = z.object({
        name: z.string(),
        age: z.number(),
      });
      
      const user = UserSchema.parse({ name: "Bob", age: 25 });
      console.log("User validated:", JSON.stringify(user));
    `;

    const stream = runJS(code);
    const output = await readStreamWithTimeout(stream, 15000); // Longer timeout for package download

    assertStringIncludes(output, "User validated:");
    assertStringIncludes(output, "Bob");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Import JSR package",
  async fn() {
    const code = `
      import { join } from "jsr:@std/path";
      
      const fullPath = join("home", "user", "documents");
      console.log("Full path:", fullPath);
    `;

    const stream = runJS(code);
    const output = await readStreamWithTimeout(stream, 10000);

    assertStringIncludes(output, "Full path:");
    assertStringIncludes(output, "home");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Error Handling",
  async fn() {
    const code = `
      console.log("Before error");
      throw new Error("Test error");
      console.log("After error"); // This should not execute
    `;

    const stream = runJS(code);
    const output = await readStreamWithTimeout(stream, 10000);

    assertStringIncludes(output, "Before error");
    assertStringIncludes(output, "Test error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Stderr Output",
  async fn() {
    const code = `
      console.log("stdout message");
      console.error("stderr message");
    `;

    const stream = runJS(code);
    const output = await readStreamWithTimeout(stream, 10000);

    assertStringIncludes(output, "stdout message");
    assertStringIncludes(output, "[stderr] stderr message");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Abort Signal",
  async fn() {
    const code = `
      console.log("Starting...");
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
      console.log("This should not appear");
    `;

    const controller = new AbortController();
    const stream = runJS(code, controller.signal);

    // Abort after a short delay
    setTimeout(() => controller.abort(), 100);

    try {
      await readStreamWithTimeout(stream, 1000);
    } catch (error) {
      // Expected to throw due to abort
      assertStringIncludes(String(error), "abort");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Node.js Built-in Modules",
  async fn() {
    const code = `
      console.log("Testing Node.js modules");
      console.log("typeof process:", typeof process);
    `;

    const stream = runJS(code);
    const output = await readStreamWithTimeout(stream, 10000);

    assertStringIncludes(output, "Testing Node.js modules");
    assertStringIncludes(output, "typeof process:");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ---------------------------------------------------------------------------
// Handler tests (uses handle-sandbox JSON-RPC IPC path)
// ---------------------------------------------------------------------------

Deno.test({
  name: "JavaScript Runner - Handler: basic call",
  async fn() {
    const stream = runJS(
      `
      const result = await double(21);
      console.log("result:", result);
    `,
      {
        handlers: {
          double: (n: unknown) => Promise.resolve((n as number) * 2),
        },
      },
    );

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "result: 42");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Handler: streaming logs arrive in order",
  async fn() {
    const received: string[] = [];

    const stream = runJS(
      `
      console.log("one");
      console.log("two");
      console.log("three");
    `,
      {
        handlers: {
          // dummy handler to force sandbox path
          noop: () => Promise.resolve(null),
        },
      },
    );

    const decoder = new TextDecoder();
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value).trim();
      if (text) received.push(text);
    }

    assertEquals(received, ["one", "two", "three"]);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Handler: multiple handlers",
  async fn() {
    const stream = runJS(
      `
      const sum = await add(3, 4);
      const greeting = await greet("world");
      console.log(sum, greeting);
    `,
      {
        handlers: {
          add: (a: unknown, b: unknown) =>
            Promise.resolve((a as number) + (b as number)),
          greet: (name: unknown) => Promise.resolve(`hello ${name}`),
        },
      },
    );

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "7");
    assertStringIncludes(output, "hello world");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Handler: async handler with delay",
  async fn() {
    const stream = runJS(
      `
      const r = await slowDouble(6);
      console.log("delayed result:", r);
    `,
      {
        handlers: {
          slowDouble: async (n: unknown) => {
            await new Promise((res) => setTimeout(res, 150));
            return (n as number) * 2;
          },
        },
      },
    );

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "delayed result: 12");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Handler: error in code is captured",
  async fn() {
    const stream = runJS(
      `
      console.log("before");
      throw new Error("boom");
    `,
      {
        handlers: {
          noop: () => Promise.resolve(null),
        },
      },
    );

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "before");
    assertStringIncludes(output, "boom");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "JavaScript Runner - Handler: abort signal stops execution",
  async fn() {
    const controller = new AbortController();

    const stream = runJS(
      `
      console.log("started");
      await slowNoop();
      console.log("should not appear");
    `,
      {
        handlers: {
          slowNoop: () => new Promise((res) => setTimeout(res, 10000)),
        },
      },
      controller.signal,
    );

    setTimeout(() => controller.abort(), 100);

    try {
      await readStreamWithTimeout(stream, 2000);
    } catch (err) {
      assertStringIncludes(String(err), "abort");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
