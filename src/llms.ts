/**
 * llms.txt content - Machine-readable API documentation for AI assistants
 */
export const llmsTxt = `# ERC-8004 Agent Registry API
# https://agents.b1ts.dev
# Machine-readable documentation for AI assistants

## Overview
Discover and interact with on-chain AI agents registered via ERC-8004.
No authentication required for read operations.

## Base URLs
- REST API: https://agents-services.b1ts.dev/api
- MCP Server: https://agents-services.b1ts.dev/mcp
- Frontend: https://agents.b1ts.dev
- Indexer API: https://agents-api.b1ts.dev

## REST Endpoints

### Search Agents
GET /api/agents/search
Query params:
  - q: Search query (optional, string)
  - mcp: Filter MCP-enabled agents (boolean, "true"/"false")
  - a2a: Filter A2A-enabled agents (boolean)
  - x402: Filter x402 payment-enabled agents (boolean)
  - tag: Filter by tag (string, e.g., "defi", "social")
  - limit: Max results (integer, default: 10)

Example:
curl "https://agents-services.b1ts.dev/api/agents/search?mcp=true&tag=defi&limit=5"

Response:
{
  "query": "...",
  "count": 5,
  "offset": 0,
  "limit": 5,
  "results": [
    {
      "id": "13445",
      "name": "Agent Name",
      "description": "Agent description",
      "hasMCP": true,
      "hasA2A": false,
      "x402Support": false,
      "mcpTools": ["tool1", "tool2"],
      "a2aSkills": [],
      "tags": ["defi"],
      "feedbackCount": 5,
      "avgRating": 4.5,
      "services": [
        {"name": "mcp", "endpoint": "https://..."}
      ]
    }
  ]
}

### Get Agent Details
GET /api/agents/:id
Returns full agent metadata including services, tools, skills.

Example:
curl "https://agents-services.b1ts.dev/api/agents/13445"

### Get Agent Tools
GET /api/agents/:id/tools
Returns deduplicated list of MCP tools and capabilities.

Example:
curl "https://agents-services.b1ts.dev/api/agents/13445/tools"

Response:
{
  "id": "13445",
  "name": "Agent Name",
  "tools": ["swap_tokens", "get_price", "estimate_gas"]
}

### Get Agent Health
GET /api/agents/:id/health
Returns health status with MCP/A2A/x402 endpoint validation.

Example:
curl "https://agents-services.b1ts.dev/api/agents/13445/health"

Response:
{
  "agentId": 13445,
  "status": "healthy",
  "lastCheckedAt": "2026-02-03T09:00:00Z",
  "latencyMs": 150,
  "mcpValid": true,
  "mcpToolsCount": 5,
  "a2aValid": false,
  "x402Price": null
}

Status values: "healthy" | "unhealthy" | "unreachable" | "unknown"

### Get Registry Stats
GET /api/stats
Returns aggregate statistics.

Example:
curl "https://agents-services.b1ts.dev/api/stats"

Response:
{
  "totalAgents": 150,
  "totalFeedback": 523,
  "agentsWithMCP": 45,
  "agentsWithA2A": 23,
  "agentsWithX402": 12
}

## MCP Integration

Add to your MCP client config (Claude Desktop, Cursor, OpenClaw):

{
  "mcpServers": {
    "8004-registry": {
      "url": "https://agents-services.b1ts.dev/mcp",
      "transport": "sse"
    }
  }
}

### MCP Tools Available

1. search_agents
   - Search and filter agents by capability
   - Params: query?, has_mcp?, has_a2a?, has_x402?, tag?, limit?
   
2. get_agent
   - Get detailed info about a specific agent
   - Params: id (required)
   
3. get_agent_tools
   - List all tools/skills from an agent
   - Params: id (required)
   
4. get_agent_health
   - Check if agent endpoints are healthy
   - Params: id (required)
   
5. get_stats
   - Get registry statistics
   - Params: none

### Example MCP Prompts
- "Find DeFi agents that support MCP"
- "Get details on agent 13445"
- "Is agent 22721 healthy?"
- "How many agents are in the registry?"
- "Find agents that accept x402 payments"

## Feedback / Reputation System

Agents have on-chain reputation via ERC-8004 ReputationRegistry:
- feedbackCount: Total feedback submissions
- avgRating: Average rating (1-5 scale)

Feedback data returned with agent details:
- value: Rating (scaled with decimals)
- tag1, tag2: Categorization tags
- endpoint: Which endpoint was rated
- createdAt: Timestamp

## Health Checking

Health checks run every 30 minutes and validate:
- MCP endpoint responds to initialize + tools/list
- A2A endpoint returns valid agent card
- x402 endpoint returns 402 with payment headers

## Rate Limits

No authentication required. Please be respectful:
- Suggested: ~1 request/second for bulk operations
- Health check cron runs at 30-minute intervals

## Source Code

- Indexer: https://github.com/0xbits/8004-indexer
- Services: https://github.com/0xbits/8004-services  
- Frontend: https://github.com/0xbits/8004-app

## ERC-8004 Standard

Learn more: https://eips.ethereum.org/EIPS/eip-8004
`;
