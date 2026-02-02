---
name: erc8004-registry
description: Query the ERC-8004 AI agent registry — search agents, check health, get capabilities and tools.
homepage: https://agents.b1ts.dev
metadata:
  openclaw:
    emoji: "🤖"
    mcp_endpoint: "https://agents-services.b1ts.dev/mcp"
---

# ERC-8004 Agent Registry

MCP server for discovering and querying on-chain AI agents registered via ERC-8004.

**Endpoint:** `https://agents-services.b1ts.dev/mcp`

## Available Tools

### search_agents

Search and filter registered agents.

| Parameter | Type | Description |
|-----------|------|-------------|
| query | string | Free-text search |
| has_mcp | boolean | Filter to MCP-enabled agents |
| has_a2a | boolean | Filter to A2A-enabled agents |
| has_x402 | boolean | Filter to x402 payment-enabled agents |
| tag | string | Filter by tag |
| limit | number | Max results (default 10) |

**Example:** Find agents with MCP support
```
search_agents({ has_mcp: true, limit: 5 })
```

### get_agent

Get full details for a specific agent.

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Agent ID (required) |

**Returns:** Agent metadata including name, description, services, capabilities, MCP tools, A2A skills, x402 pricing.

### get_agent_tools

List all tools/capabilities exposed by an agent.

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Agent ID (required) |

**Returns:** Deduplicated list of MCP tools and service capabilities.

### get_agent_health

Check an agent's health status and endpoint validation.

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Agent ID (required) |

**Returns:**
- `status` — healthy / unhealthy / unreachable / unknown
- `latencyMs` — response time
- `mcpValid` — MCP endpoint validated
- `mcpToolsCount` — number of MCP tools discovered
- `a2aValid` — A2A endpoint validated
- `a2aSkillsCount` — number of A2A skills discovered
- `x402Price` / `x402Currency` — payment info if applicable

### get_stats

Get aggregate registry statistics.

**Returns:**
- `totalAgents` — total registered agents
- `agentsWithMCP` — agents exposing MCP
- `agentsWithA2A` — agents exposing A2A
- `agentsWithX402` — agents accepting x402 payments

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "erc8004": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://agents-services.b1ts.dev/mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "erc8004": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://agents-services.b1ts.dev/mcp"]
    }
  }
}
```

### OpenClaw

Add to your OpenClaw config:

```yaml
mcp:
  servers:
    - name: erc8004
      url: https://agents-services.b1ts.dev/mcp
```

## Use Cases

- **Discovery:** "Find AI agents that support MCP and have payment capabilities"
- **Integration:** Get agent endpoints and tools for programmatic access
- **Monitoring:** Check if agents are healthy before routing requests
- **Research:** Explore the emerging on-chain AI agent ecosystem

## Links

- **Web UI:** https://agents.b1ts.dev
- **API:** https://agents-api.b1ts.dev
- **MCP:** https://agents-services.b1ts.dev/mcp
- **ERC-8004 Spec:** https://eips.ethereum.org/EIPS/eip-8004
