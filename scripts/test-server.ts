#!/usr/bin/env -S deno run --allow-net
/// <reference path="../src/types/deno.d.ts" />

/**
 * Quick test script to validate the MCP server is working
 */

export {}; // Make this file a module

const SERVER_URL = "http://localhost:9000";

async function testEndpoint(path: string, method: string = "GET", body?: any) {
  try {
    console.log(`🔍 Testing ${method} ${path}...`);
    
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    };
    
    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${SERVER_URL}${path}`, options);
    const text = await response.text();
    
    if (response.ok) {
      console.log(`✅ ${path} - Status: ${response.status}`);
      try {
        const json = JSON.parse(text);
        console.log(`   Response:`, JSON.stringify(json, null, 2));
      } catch {
        console.log(`   Response:`, text.substring(0, 200));
      }
    } else {
      console.log(`❌ ${path} - Status: ${response.status}`);
      console.log(`   Error:`, text.substring(0, 500));
    }
    
    return response.ok;
  } catch (error) {
    console.log(`💥 ${path} - Error:`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function testMCPProtocol() {
  console.log("🧪 Testing MCP Protocol...");
  
  // Test initialize
  const initResult = await testEndpoint("/mcp", "POST", {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  });
  
  if (!initResult) return false;
  
  // Test tools list
  const toolsResult = await testEndpoint("/mcp", "POST", {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });
  
  if (!toolsResult) return false;
  
  // Test JavaScript execution
  const jsResult = await testEndpoint("/mcp", "POST", {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "javascript-code-runner",
      arguments: {
        code: "console.log('Hello from JavaScript!');"
      }
    }
  });
  
  if (!jsResult) return false;
  
  // Test simple Python execution (might timeout on first run)
  console.log("⏰ Testing Python (this might take a while for first run)...");
  const pyResult = await testEndpoint("/mcp", "POST", {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "python-code-runner",
      arguments: {
        code: "print('Hello from Python!')"
      }
    }
  });
  
  return pyResult;
}

async function main() {
  console.log("🚀 Testing Code Runner MCP Server");
  console.log(`📍 Server URL: ${SERVER_URL}`);
  console.log("");
  
  // Test basic endpoints
  await testEndpoint("/");
  await testEndpoint("/health");
  await testEndpoint("/tools");
  
  console.log("");
  
  // Test MCP protocol
  const mcpSuccess = await testMCPProtocol();
  
  console.log("");
  if (mcpSuccess) {
    console.log("🎉 All tests passed! Server is working correctly.");
  } else {
    console.log("⚠️  Some tests failed. Check the logs for details.");
  }
}

// Run the main function if this script is executed directly
if ((import.meta as any).main) {
  await main();
}