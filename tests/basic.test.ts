import { assertEquals } from "./setup.ts";

Deno.test("Test Setup - Basic Assertions", () => {
  assertEquals(1 + 1, 2);
  assertEquals("hello".toUpperCase(), "HELLO");
  assertEquals([1, 2, 3].length, 3);
});

Deno.test("Test Setup - Environment Check", () => {
  // Check that we're running in Deno
  assertEquals(typeof Deno, "object");
  assertEquals(typeof Deno.test, "function");
});

Deno.test("Test Setup - Async Operations", async () => {
  const result = await Promise.resolve(42);
  assertEquals(result, 42);
});

Deno.test("Test Setup - Stream Creation", () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });

  assertEquals(stream instanceof ReadableStream, true);
});
