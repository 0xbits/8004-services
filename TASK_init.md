# TASK: Initialize 8004-services

Build a performant service layer for agents.b1ts.dev that handles:
1. MCP server (Model Context Protocol) with SSE transport
2. Health checker for agent endpoints
3. Shared Postgres with the Ponder indexer

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono (fast, lightweight)
- **Database**: Postgres via Drizzle ORM (same DB as indexer, different tables)
- **MCP**: @modelcontextprotocol/sdk

## Project Structure

```
8004-services/
├── src/
│   ├── index.ts           # Main entry, Hono app
│   ├── db/
│   │   ├── client.ts      # Drizzle client
│   │   └── schema.ts      # Our tables (agent_health, etc.)
│   ├── mcp/
│   │   ├── server.ts      # MCP server setup
│   │   ├── transport.ts   # SSE transport implementation
│   │   └── tools.ts       # Tool implementations
│   ├── health/
│   │   ├── checker.ts     # Health check logic
│   │   └── scheduler.ts   # Cron scheduler
│   └── api/
│       └── routes.ts      # REST endpoints for health data
├── drizzle/
│   └── migrations/        # DB migrations
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── .env.example
```

## Database Tables (we own these, Ponder owns the rest)

```sql
-- Health check results
CREATE TABLE agent_health (
  agent_id BIGINT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'unknown',  -- healthy, degraded, down, unknown
  last_checked_at TIMESTAMP,
  last_healthy_at TIMESTAMP,
  latency_ms INTEGER,
  error_message TEXT,
  http_status INTEGER,
  -- MCP validation
  mcp_valid BOOLEAN,
  mcp_tools_count INTEGER,
  mcp_error TEXT,
  -- A2A validation  
  a2a_valid BOOLEAN,
  a2a_skills_count INTEGER,
  a2a_error TEXT,
  -- x402 info
  x402_price TEXT,
  x402_currency TEXT
);

-- Health check history (last 7 days)
CREATE TABLE agent_health_history (
  id SERIAL PRIMARY KEY,
  agent_id BIGINT NOT NULL,
  checked_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  http_status INTEGER,
  error_message TEXT
);
```

## MCP Server

Endpoint: `GET /mcp` (SSE) and `POST /mcp` (messages)

### Tools to implement:

1. **search_agents** - Search agents by query, filters (has_mcp, has_a2a, has_x402, tag)
2. **get_agent** - Get full agent details by ID
3. **get_agent_tools** - Get MCP tools for an agent
4. **get_agent_health** - Get health status for an agent
5. **get_stats** - Get registry statistics

### SSE Transport

```typescript
// GET /mcp - Establish SSE stream
// Returns: event: endpoint with session URL
// Client then POSTs messages to /mcp?sessionId=xxx

// Session management - in-memory Map is fine for single instance
const sessions = new Map<string, Session>();
```

## Health Checker

- Runs every 5 minutes
- Samples ~100 agents per run (round-robin through all)
- Max 1 request/second to avoid overload
- Checks:
  - HTTP reachability of agentURI
  - MCP endpoint validation (if hasMCP)
  - A2A endpoint validation (if hasA2A)
  - x402 header extraction

```typescript
// Pseudo-code
async function checkAgentHealth(agent: Agent): Promise<HealthResult> {
  const start = Date.now();
  try {
    const res = await fetch(agent.agentURI, { timeout: 5000 });
    const latency = Date.now() - start;
    
    return {
      status: latency > 3000 ? 'degraded' : 'healthy',
      latency_ms: latency,
      http_status: res.status,
    };
  } catch (e) {
    return {
      status: 'down',
      error_message: e.message,
    };
  }
}
```

## REST API Endpoints

```
GET /health/:agentId     - Get health for single agent
GET /health/stats        - Aggregate health stats
GET /health/recent       - Recently checked agents
```

## Environment Variables

```
DATABASE_URL=postgresql://...  # Same as indexer
PORT=3001
INDEXER_API_URL=https://agents-api.b1ts.dev
```

## Implementation Order

1. Project setup (bun init, deps, tsconfig)
2. Database schema + Drizzle setup
3. Basic Hono server with health endpoints
4. MCP server with SSE transport
5. Health checker logic
6. Scheduler (setInterval for MVP, can add proper cron later)

## Queries Against Ponder Tables

We need to READ from Ponder's tables to get agent data. Drizzle can do this:

```typescript
// Read-only access to Ponder tables
const agents = await db.execute(sql`
  SELECT id, agent_uri, has_mcp, has_a2a 
  FROM agent 
  WHERE agent_uri IS NOT NULL
  LIMIT 100 OFFSET ${offset}
`);
```

## Success Criteria

- [ ] `bun run dev` starts server on port 3001
- [ ] `GET /mcp` returns SSE stream with session endpoint
- [ ] `POST /mcp?sessionId=x` accepts JSON-RPC messages
- [ ] MCP tools return real data from Ponder tables
- [ ] Health checker runs and populates agent_health table
- [ ] `GET /health/:id` returns health data
