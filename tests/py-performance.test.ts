import { assertStringIncludes } from "./setup.ts";
import { readStreamWithTimeout } from "./setup.ts";
import { runPy } from "../src/service/py-runner.ts";

Deno.test({
  name: "Python Runner - Performance Test with Complex Dependencies",
  async fn() {
    const startTime = performance.now();

    const code = `
# Complex code with multiple imports and sub-imports
import requests
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
import matplotlib.pyplot as plt
from bs4 import BeautifulSoup
import json

# Test functionality
print("All imports successful!")

# Quick functionality test
data = {'a': [1, 2, 3], 'b': [4, 5, 6]}
df = pd.DataFrame(data)
arr = np.array([1, 2, 3])

print(f"DataFrame shape: {df.shape}")
print(f"NumPy array: {arr}")
print("Performance test completed successfully!")
    `;

    const stream = await runPy(code);
    const output = await readStreamWithTimeout(stream, 60000);

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`[Performance] Test completed in ${duration.toFixed(2)}ms`);

    assertStringIncludes(output, "All imports successful!");
    assertStringIncludes(output, "DataFrame shape: (3, 2)");
    assertStringIncludes(output, "NumPy array: [1 2 3]");
    assertStringIncludes(output, "Performance test completed successfully!");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Python Runner - Cached Dependencies Performance",
  async fn() {
    const startTime = performance.now();

    // This should be faster since dependencies are already installed
    const code = `
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression

# Quick test
df = pd.DataFrame({'x': [1, 2, 3], 'y': [2, 4, 6]})
model = LinearRegression().fit(df[['x']], df['y'])
print(f"Coefficient: {model.coef_[0]:.1f}")
print("Cached dependencies test successful!")
    `;

    const stream = await runPy(code);
    const output = await readStreamWithTimeout(stream, 30000);

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(
      `[Performance] Cached test completed in ${duration.toFixed(2)}ms`,
    );

    assertStringIncludes(output, "Coefficient: 2.0");
    assertStringIncludes(output, "Cached dependencies test successful!");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
