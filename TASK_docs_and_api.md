# Task: Documentation & API Enhancements

## Objective
Add llms.txt, OpenAPI spec, and feedback submission API to make the registry easily consumable by AI agents and developers.

## Part 1: llms.txt

Create `public/llms.txt` or serve at `/llms.txt` route.

**Content:**
```text
# ERC-8004 Agent Registry API
# https://agents.b1ts.dev

## Overview
Discover and interact with on-chain AI agents registered via ERC-8004.
No authentication required for read operations.

## Base URLs
- REST API: https://agents-services.b1ts.dev/api
- MCP Server: https://agents-services.b1ts.dev/mcp
- Frontend: https://agents.b1ts.dev

## REST Endpoints

### Search Agents
GET /api/agents/search
Query params:
  - q: Search query (optional)
  - mcp: Filter MCP-enabled agents (true/false)
  - a2a: Filter A2A-enabled agents (true/false)
  - x402: Filter x402 payment agents (true/false)
  - tag: Filter by tag (e.g., "defi", "social")
  - limit: Max results (default: 10)

Example:
curl "https://agents-services.b1ts.dev/api/agents/search?mcp=true&tag=defi&limit=5"

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

### Get Agent Health
GET /api/agents/:id/health
Returns health status with MCP/A2A/x402 validation.

Response fields:
  - status: healthy | unhealthy | unreachable | unknown
  - latencyMs: Response time
  - mcpValid: MCP endpoint validated
  - mcpToolsCount: Number of MCP tools
  - a2aValid: A2A endpoint validated
  - a2aSkillsCount: Number of A2A skills
  - x402Price, x402Currency: Payment info

Example:
curl "https://agents-services.b1ts.dev/api/agents/13445/health"

### Get Registry Stats
GET /api/stats
Returns aggregate statistics.

Example:
curl "https://agents-services.b1ts.dev/api/stats"

## MCP Integration

Add to your MCP client config:
{
  "mcpServers": {
    "8004-registry": {
      "url": "https://agents-services.b1ts.dev/mcp",
      "transport": "sse"
    }
  }
}

### Available MCP Tools
- search_agents: Search and filter agents
- get_agent: Get agent details by ID
- get_agent_tools: List agent's MCP tools
- get_agent_health: Check agent health status
- get_stats: Registry statistics

## Response Format

All endpoints return JSON. Search results:
{
  "query": "...",
  "count": 10,
  "offset": 0,
  "limit": 10,
  "results": [
    {
      "id": "13445",
      "name": "Agent Name",
      "description": "...",
      "hasMCP": true,
      "hasA2A": false,
      "x402Support": false,
      "mcpTools": ["tool1", "tool2"],
      "tags": ["defi"],
      "feedbackCount": 5,
      "avgRating": 4.5,
      "services": [...]
    }
  ]
}

## Feedback System

Agents have on-chain reputation via ERC-8004 ReputationRegistry.
- feedbackCount: Total feedback submissions
- avgRating: Average rating (1-5 scale)
- Feedback includes tags for categorization

## Rate Limits
- No authentication required
- Be respectful: ~1 req/sec for bulk operations

## Source Code
- https://github.com/0xbits/8004-indexer
- https://github.com/0xbits/8004-app
- https://github.com/0xbits/8004-services
```

## Part 2: OpenAPI Spec

Create `/api/openapi.json` endpoint or static file.

Use Hono's built-in OpenAPI support or create manually:

```typescript
// src/openapi.ts
export const openAPISpec = {
  openapi: "3.0.0",
  info: {
    title: "ERC-8004 Agent Registry API",
    version: "1.0.0",
    description: "Discover and interact with on-chain AI agents"
  },
  servers: [
    { url: "https://agents-services.b1ts.dev", description: "Production" }
  ],
  paths: {
    "/api/agents/search": {
      get: {
        summary: "Search agents",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "mcp", in: "query", schema: { type: "boolean" } },
          { name: "a2a", in: "query", schema: { type: "boolean" } },
          { name: "x402", in: "query", schema: { type: "boolean" } },
          { name: "tag", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } }
        ],
        responses: {
          "200": { description: "Search results" }
        }
      }
    },
    "/api/agents/{id}": {
      get: {
        summary: "Get agent details",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Agent details" },
          "404": { description: "Agent not found" }
        }
      }
    },
    "/api/agents/{id}/tools": {
      get: {
        summary: "Get agent tools",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "List of tools" }
        }
      }
    },
    "/api/agents/{id}/health": {
      get: {
        summary: "Get agent health",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Health status" }
        }
      }
    },
    "/api/stats": {
      get: {
        summary: "Get registry stats",
        responses: {
          "200": { description: "Registry statistics" }
        }
      }
    }
  }
};
```

Add route:
```typescript
app.get("/api/openapi.json", (c) => c.json(openAPISpec));
app.get("/openapi.json", (c) => c.json(openAPISpec)); // alias
```

## Part 3: Comments & Code Quality

Add JSDoc comments to all exported functions in tools.ts:

```typescript
/**
 * Search agents by query, tags, or capabilities.
 * @param query - Free-text search query
 * @param has_mcp - Filter to MCP-enabled agents
 * @param has_a2a - Filter to A2A-enabled agents
 * @param has_x402 - Filter to x402-enabled agents
 * @param tag - Filter by tag (e.g., "defi")
 * @param limit - Maximum results (default: 10)
 * @returns Search results with agent metadata
 */
export async function searchAgentsTool(input: {...}) {...}
```

## Deliverables

1. [ ] `/llms.txt` - Machine-readable documentation
2. [ ] `/api/openapi.json` - OpenAPI 3.0 spec
3. [ ] JSDoc comments on all tools
4. [ ] Update CORS to allow openapi.json access

## Testing

```bash
# Test llms.txt
curl https://agents-services.b1ts.dev/llms.txt

# Test OpenAPI
curl https://agents-services.b1ts.dev/api/openapi.json

# Validate OpenAPI
npx @redocly/cli lint openapi.json
```
