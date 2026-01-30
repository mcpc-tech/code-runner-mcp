import { assertStringIncludes } from "./setup.ts";
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
