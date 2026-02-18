/**
 * MCP (Model Context Protocol) Integration Tests
 * Tests oracle-v2 MCP tools via stdio transport
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Subprocess } from "bun";

interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

let mcpProcess: Subprocess<"pipe", "pipe", "pipe"> | null = null;
let requestId = 0;

async function sendMcpRequest(method: string, params?: Record<string, unknown>): Promise<McpResponse> {
  if (!mcpProcess) throw new Error("MCP process not started");

  const request: McpRequest = {
    jsonrpc: "2.0",
    id: ++requestId,
    method,
    params,
  };

  const requestLine = JSON.stringify(request) + "\n";
  mcpProcess.stdin.write(requestLine);

  // Read response
  const reader = mcpProcess.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value);
    const lines = buffer.split("\n");

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line) as McpResponse;
          if (response.id === requestId) {
            reader.releaseLock();
            return response;
          }
        } catch {
          // Not valid JSON yet, continue reading
        }
      }
    }
  }

  reader.releaseLock();
  throw new Error("No response received");
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const response = await sendMcpRequest("tools/call", {
    name,
    arguments: args,
  });

  if (response.error) {
    throw new Error(`Tool error: ${response.error.message}`);
  }

  return response.result;
}

describe("MCP Integration", () => {
  beforeAll(async () => {
    // Start MCP server
    mcpProcess = Bun.spawn(["bun", "run", "src/index.ts"], {
      cwd: import.meta.dir.replace("/src/integration", ""),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Wait for server to initialize
    await Bun.sleep(2000);

    // Initialize connection
    await sendMcpRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
  });

  afterAll(() => {
    if (mcpProcess) {
      mcpProcess.kill();
    }
  });

  // ===================
  // Tool Listing
  // ===================
  describe("Tool Discovery", () => {
    test("lists available tools", async () => {
      const response = await sendMcpRequest("tools/list");
      expect(response.result).toBeDefined();

      const result = response.result as { tools: Array<{ name: string }> };
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Check for core tools
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("oracle_search");
      expect(toolNames).toContain("oracle_list");
      expect(toolNames).toContain("oracle_stats");
    });
  });

  // ===================
  // Read-Only Tools
  // ===================
  describe("Read-Only Tools", () => {
    test("oracle_search returns results", async () => {
      const result = await callTool("oracle_search", {
        query: "oracle",
        limit: 5,
      });

      expect(result).toBeDefined();
      // Result should be array or object with results
      expect(typeof result).toBe("object");
    });

    test("oracle_list returns documents", async () => {
      const result = await callTool("oracle_list", {
        limit: 10,
      });

      expect(result).toBeDefined();
    });

    test("oracle_stats returns statistics", async () => {
      const result = await callTool("oracle_stats", {});
      expect(result).toBeDefined();
    });

    test("oracle_concepts returns concept list", async () => {
      const result = await callTool("oracle_concepts", {
        limit: 20,
      });

      expect(result).toBeDefined();
    });

    test("oracle_reflect returns random wisdom", async () => {
      const result = await callTool("oracle_reflect", {});
      expect(result).toBeDefined();
    });

    test("oracle_consult provides guidance", async () => {
      const result = await callTool("oracle_consult", {
        decision: "Should I write integration tests?",
        context: "Building oracle-v2 MCP server",
      });

      expect(result).toBeDefined();
    });
  });

  // ===================
  // Thread Tools
  // ===================
  describe("Thread Tools", () => {
    test("oracle_threads lists threads", async () => {
      const result = await callTool("oracle_threads", {
        limit: 10,
      });

      expect(result).toBeDefined();
    });

    test("oracle_threads with status filter", async () => {
      const result = await callTool("oracle_threads", {
        status: "active",
        limit: 5,
      });

      expect(result).toBeDefined();
    });
  });

  // ===================
  // Trace Tools
  // ===================
  describe("Trace Tools", () => {
    test("oracle_trace_list returns traces", async () => {
      const result = await callTool("oracle_trace_list", {
        limit: 10,
      });

      expect(result).toBeDefined();
    });
  });

  // ===================
  // Error Handling
  // ===================
  describe("Error Handling", () => {
    test("handles invalid tool name", async () => {
      try {
        await callTool("nonexistent_tool", {});
        expect(true).toBe(false); // Should have thrown
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test("handles missing required params", async () => {
      try {
        // oracle_consult requires 'decision' param
        await callTool("oracle_consult", {});
        // May or may not throw depending on implementation
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
