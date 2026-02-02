import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import {
  searchAgentsTool,
  getAgentTool,
  getAgentToolsTool,
  getAgentHealthTool,
  getStatsTool
} from "./tools";

export function createMcpServer() {
  const server = new McpServer({
    name: "8004-services",
    version: "0.1.0"
  });

  server.tool(
    "search_agents",
    {
      query: z.string().optional().describe("Search query"),
      has_mcp: z.boolean().optional().describe("Filter to MCP-enabled agents"),
      has_a2a: z.boolean().optional().describe("Filter to A2A-enabled agents"),
      has_x402: z.boolean().optional().describe("Filter to x402-enabled agents"),
      tag: z.string().optional().describe("Filter by tag"),
      limit: z.number().optional().describe("Max results (default 10)")
    },
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await searchAgentsTool(input), null, 2) }]
    })
  );

  server.tool(
    "get_agent",
    { id: z.string().describe("Agent ID") },
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await getAgentTool(input), null, 2) }]
    })
  );

  server.tool(
    "get_agent_tools",
    { id: z.string().describe("Agent ID") },
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await getAgentToolsTool(input), null, 2) }]
    })
  );

  server.tool(
    "get_agent_health",
    { id: z.string().describe("Agent ID") },
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await getAgentHealthTool(input), null, 2) }]
    })
  );

  server.tool(
    "get_stats",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify(await getStatsTool(), null, 2) }]
    })
  );

  return server;
}
