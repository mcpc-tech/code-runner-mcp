import { assertStringIncludes } from "./setup.ts";
import { readStreamWithTimeout } from "./setup.ts";
import { runPy } from "../src/service/py-runner.ts";

Deno.test({
  name: "Handlers - Basic Function Call",
  async fn() {
    const code = `
result = greet("Python")
print(f"Result: {result}")
    `;

    const stream = await runPy(code, {
      handlers: {
        greet: (name: string) => `Hello, ${name}!`,
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Result: Hello, Python!");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Return Object",
  async fn() {
    const code = `
result = get_user()
print(f"Name: {result['name']}")
print(f"Age: {result['age']}")
print(f"Tags: {result['tags']}")
print(f"Type: {type(result).__name__}")
    `;

    const stream = await runPy(code, {
      handlers: {
        get_user: () => ({
          name: "Alice",
          age: 30,
          tags: ["developer", "python"],
        }),
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Name: Alice");
    assertStringIncludes(output, "Age: 30");
    assertStringIncludes(output, "Tags:");
    // Returns standard Python dict - use ['key'] syntax
    assertStringIncludes(output, "Type: dict");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Pass Python Data to JS (Auto-converted)",
  async fn() {
    const code = `
py_list = [1, 2, 3, 4, 5]
py_dict = {"key": "value", "num": 42}

result = process_data(py_list, py_dict)
print(f"Result: {result}")
    `;

    // deno-lint-ignore no-explicit-any
    let capturedList: any[] = [];
    // deno-lint-ignore no-explicit-any
    let capturedDict: Record<string, any> = {};

    const stream = await runPy(code, {
      handlers: {
        // deno-lint-ignore no-explicit-any
        process_data: (list: any[], dict: Record<string, any>) => {
          capturedList = list;
          capturedDict = dict;
          return `Received ${list.length} items, dict.key=${dict.key}`;
        },
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Received 5 items, dict.key=value");

    if (capturedList.length !== 5 || capturedList[0] !== 1) {
      throw new Error("List was not properly converted");
    }
    if (capturedDict.key !== "value" || capturedDict.num !== 42) {
      throw new Error("Dict was not properly converted");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Async Returns String",
  async fn() {
    const code = `
import asyncio

async def main():
    result = await async_fetch("https://api.example.com")
    print(f"Result: {result}")
    print(f"Type: {type(result).__name__}")

asyncio.run(main())
    `;

    const stream = await runPy(code, {
      handlers: {
        async_fetch: async (url: string) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `Fetched from ${url}`;
        },
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(
      output,
      "Result: Fetched from https://api.example.com",
    );
    assertStringIncludes(output, "Type: str");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Async Returns Object",
  async fn() {
    const code = `
import asyncio

async def main():
    result = await async_get_user(123)
    print(f"Name: {result['name']}")
    print(f"Email: {result['email']}")
    print(f"Active: {result['active']}")
    print(f"Type: {type(result).__name__}")

asyncio.run(main())
    `;

    const stream = await runPy(code, {
      handlers: {
        async_get_user: async (id: number) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            id,
            name: "Bob",
            email: "bob@example.com",
            active: true,
          };
        },
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Name: Bob");
    assertStringIncludes(output, "Email: bob@example.com");
    assertStringIncludes(output, "Active: True");
    // Returns standard Python dict - use ['key'] syntax
    assertStringIncludes(output, "Type: dict");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Async Returns Array",
  async fn() {
    const code = `
import asyncio

async def main():
    result = await async_get_items()
    print(f"Count: {len(result)}")
    print(f"First: {result[0]}")
    print(f"Type: {type(result).__name__}")

asyncio.run(main())
    `;

    const stream = await runPy(code, {
      handlers: {
        async_get_items: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return ["item1", "item2", "item3"];
        },
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Count: 3");
    assertStringIncludes(output, "First: item1");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Error Handling",
  async fn() {
    const code = `
try:
    result = failing_handler()
    print(f"Result: {result}")
except Exception as e:
    print(f"Caught: {type(e).__name__}")
    `;

    const stream = await runPy(code, {
      handlers: {
        failing_handler: () => {
          throw new Error("Something went wrong!");
        },
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Caught:");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Using asyncio.run()",
  async fn() {
    const code = `
# Method 1: Using asyncio.run() (recommended, best compatibility)
import asyncio

async def main():
    result = await async_fetch("https://example.com")
    print(f"Result: {result}")

asyncio.run(main())
    `;

    const stream = await runPy(code, {
      handlers: {
        async_fetch: async (url: string) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `Fetched: ${url}`;
        },
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Result: Fetched: https://example.com");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Async handler with await",
  async fn() {
    const code = `
# Use await with async handler (Python style)
import asyncio

async def main():
    result = await async_compute(5)
    print(f"Result: {result}")

asyncio.run(main())
    `;

    const stream = await runPy(code, {
      handlers: {
        async_compute: async (n: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return n * 2;
        },
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Result: 10");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Multiple async calls",
  async fn() {
    const code = `
# Test multiple async calls
import asyncio

async def main():
    # Parallel calls
    results = await asyncio.gather(
        async_task("A"),
        async_task("B"),
        async_task("C")
    )
    print(f"All results: {results}")

asyncio.run(main())
    `;

    const stream = await runPy(code, {
      handlers: {
        async_task: async (name: string) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `Task-${name}`;
        },
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "All results:");
    assertStringIncludes(output, "Task-A");
    assertStringIncludes(output, "Task-B");
    assertStringIncludes(output, "Task-C");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Return dict subscriptable with bracket notation",
  async fn() {
    const code = `
import asyncio

async def main():
    result = await get_data()
    # Test bracket notation (requires to_py conversion)
    success = result['data']['success']
    rate = result['data']['growth_rate']
    print(f"Success: {success}")
    print(f"Growth Rate: {rate}%")
    print(f"Type of result: {type(result).__name__}")

asyncio.run(main())
    `;

    const stream = await runPy(code, {
      handlers: {
        get_data: async () => ({
          data: {
            success: true,
            growth_rate: 111.1,
            reason: "Business is growing",
          },
          text: "Analysis report",
        }),
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Success: True");
    assertStringIncludes(output, "Growth Rate: 111.1%");
    // Returns standard Python dict - use ['key'] syntax
    assertStringIncludes(output, "Type of result: dict");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Handlers - Return nested dict accessible with brackets",
  async fn() {
    const code = `
# Test sync handler returning nested dict
result = get_nested()
print(f"Level1: {result['level1']}")
print(f"Level2: {result['level1']['level2']}")
print(f"Value: {result['level1']['level2']['value']}")
    `;

    const stream = await runPy(code, {
      handlers: {
        get_nested: () => ({
          level1: {
            level2: {
              value: 42,
            },
          },
        }),
      },
    });

    const output = await readStreamWithTimeout(stream, 10000);
    assertStringIncludes(output, "Level1:");
    assertStringIncludes(output, "Level2:");
    assertStringIncludes(output, "Value: 42");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
