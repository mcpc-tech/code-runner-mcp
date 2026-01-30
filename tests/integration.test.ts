import { assertStringIncludes } from "./setup.ts";
import { readStreamWithTimeout } from "./setup.ts";
import { runJS } from "../src/service/js-runner.ts";
import { runPy } from "../src/service/py-runner.ts";

Deno.test("Integration - JavaScript and Python Data Exchange", async () => {
  // Test that both runners can process the same data format
  const testData = { name: "Alice", age: 30, scores: [95, 87, 92] };

  // JavaScript test
  const jsCode = `
    const data = ${JSON.stringify(testData)};
    console.log("JS Processing:", JSON.stringify(data));
    console.log("Average score:", data.scores.reduce((a, b) => a + b) / data.scores.length);
  `;

  const jsStream = runJS(jsCode);
  const jsOutput = await readStreamWithTimeout(jsStream);

  assertStringIncludes(jsOutput, "JS Processing:");
  assertStringIncludes(jsOutput, "Alice");
  assertStringIncludes(jsOutput, "Average score: 91.33333333333333");

  // Python test
  const pyCode = `
import json
data = ${JSON.stringify(testData)}
print("Python Processing:", json.dumps(data))
average = sum(data["scores"]) / len(data["scores"])
print(f"Average score: {average}")
  `;

  const pyStream = await runPy(pyCode);
  const pyOutput = await readStreamWithTimeout(pyStream);

  assertStringIncludes(pyOutput, "Python Processing:");
  assertStringIncludes(pyOutput, "Alice");
  assertStringIncludes(pyOutput, "Average score: 91.33333333333333");
});

Deno.test("Integration - Complex Data Processing", async () => {
  // Test more complex data processing scenarios

  // JavaScript: Array manipulation and filtering
  const jsCode = `
    const numbers = Array.from({length: 100}, (_, i) => i + 1);
    const primes = numbers.filter(n => {
      if (n < 2) return false;
      for (let i = 2; i <= Math.sqrt(n); i++) {
        if (n % i === 0) return false;
      }
      return true;
    });
    console.log("First 10 primes:", primes.slice(0, 10));
    console.log("Total primes under 100:", primes.length);
  `;

  const jsStream = runJS(jsCode);
  const jsOutput = await readStreamWithTimeout(jsStream);

  // Check for the essential content rather than exact formatting
  assertStringIncludes(jsOutput, "First 10 primes:");
  assertStringIncludes(jsOutput, "2");
  assertStringIncludes(jsOutput, "3");
  assertStringIncludes(jsOutput, "5");
  assertStringIncludes(jsOutput, "7");
  assertStringIncludes(jsOutput, "11");
  assertStringIncludes(jsOutput, "Total primes under 100: 25");

  // Python: Similar computation
  const pyCode = `
def is_prime(n):
    if n < 2:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True

numbers = list(range(1, 101))
primes = [n for n in numbers if is_prime(n)]
print("First 10 primes:", primes[:10])
print("Total primes under 100:", len(primes))
  `;

  const pyStream = await runPy(pyCode);
  const pyOutput = await readStreamWithTimeout(pyStream);

  assertStringIncludes(
    pyOutput,
    "First 10 primes: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]",
  );
  assertStringIncludes(pyOutput, "Total primes under 100: 25");
});

Deno.test("Integration - Error Handling Comparison", async () => {
  // Test how both runners handle errors

  // JavaScript error
  const jsCode = `
    console.log("Before error");
    try {
      throw new Error("Test JS error");
    } catch (e) {
      console.log("Caught error:", e.message);
    }
    console.log("After error handling");
  `;

  const jsStream = runJS(jsCode);
  const jsOutput = await readStreamWithTimeout(jsStream);

  assertStringIncludes(jsOutput, "Before error");
  assertStringIncludes(jsOutput, "Caught error: Test JS error");
  assertStringIncludes(jsOutput, "After error handling");

  // Python error
  const pyCode = `
print("Before error")
try:
    raise ValueError("Test Python error")
except ValueError as e:
    print(f"Caught error: {e}")
print("After error handling")
  `;

  const pyStream = await runPy(pyCode);
  const pyOutput = await readStreamWithTimeout(pyStream);

  assertStringIncludes(pyOutput, "Before error");
  assertStringIncludes(pyOutput, "Caught error: Test Python error");
  assertStringIncludes(pyOutput, "After error handling");
});

Deno.test("Integration - Package Import Capabilities", async () => {
  // Test package importing in both environments

  // JavaScript: Import and use a utility library
  const jsCode = `
    // Import from npm
    const { z } = await import("npm:zod");
    
    const UserSchema = z.object({
      name: z.string(),
      age: z.number().min(0).max(120),
    });
    
    try {
      const user = UserSchema.parse({ name: "Bob", age: 25 });
      console.log("Valid user:", JSON.stringify(user));
    } catch (e) {
      console.log("Validation failed:", e.message);
    }
  `;

  const jsStream = runJS(jsCode);
  const jsOutput = await readStreamWithTimeout(jsStream, 15000);

  assertStringIncludes(jsOutput, "Valid user:");
  assertStringIncludes(jsOutput, "Bob");

  // Python: Import and use a package
  const pyCode = `
import json
import sys

# Test built-in modules
data = {"test": "value", "number": 42}
json_str = json.dumps(data)
print("JSON serialization works:", json_str)

# Test system info
print("Python version:", sys.version.split()[0])
  `;

  const pyStream = await runPy(pyCode);
  const pyOutput = await readStreamWithTimeout(pyStream);

  assertStringIncludes(pyOutput, "JSON serialization works:");
  assertStringIncludes(pyOutput, "Python version:");
});

Deno.test("Integration - Performance and Timeout Behavior", async () => {
  // Test that both runners can handle reasonable computational loads

  // JavaScript: Fibonacci calculation
  const jsCode = `
    function fibonacci(n) {
      if (n <= 1) return n;
      return fibonacci(n - 1) + fibonacci(n - 2);
    }
    
    const start = Date.now();
    const result = fibonacci(30);
    const end = Date.now();
    
    console.log(\`Fibonacci(30) = \${result}\`);
    console.log(\`Calculation took \${end - start}ms\`);
  `;

  const jsStream = runJS(jsCode);
  const jsOutput = await readStreamWithTimeout(jsStream, 10000);

  assertStringIncludes(jsOutput, "Fibonacci(30) = 832040");
  assertStringIncludes(jsOutput, "Calculation took");

  // Python: Similar calculation
  const pyCode = `
import time

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

start = time.time()
result = fibonacci(30)
end = time.time()

print(f"Fibonacci(30) = {result}")
print(f"Calculation took {(end - start) * 1000:.2f}ms")
  `;

  const pyStream = await runPy(pyCode);
  const pyOutput = await readStreamWithTimeout(pyStream, 10000);

  assertStringIncludes(pyOutput, "Fibonacci(30) = 832040");
  assertStringIncludes(pyOutput, "Calculation took");
});
