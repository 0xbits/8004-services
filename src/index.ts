import { Hono } from "hono";
import { cors } from "hono/cors";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { agentHealth } from "./db/schema";
import { createMcpServer } from "./mcp/server";
import { createMcpTransport } from "./mcp/transport";
import { runHealthCheck } from "./health/checker";
import { llmsTxt } from "./llms";
import { openAPISpec } from "./openapi";

const app = new Hono();

// Enable CORS for browser access
app.use("*", cors({
  origin: ["https://agents.b1ts.dev", "http://localhost:3000"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"]
}));

const mcpServer = createMcpServer();
const mcpTransport = createMcpTransport();
await mcpServer.connect(mcpTransport);

app.all("/mcp", (c) => mcpTransport.handleRequest(c.req.raw));

// =============================================================================
// REST API - Simple endpoints for agents to discover and query the registry
// =============================================================================

import { searchAgentsTool, getAgentTool, getAgentToolsTool, getAgentHealthTool, getStatsTool } from "./mcp/tools";

// Search agents
// GET /api/agents/search?q=defi&mcp=true&a2a=true&x402=true&tag=social&limit=10
app.get("/api/agents/search", async (c) => {
  try {
    const q = c.req.query("q");
    const mcp = c.req.query("mcp") === "true";
    const a2a = c.req.query("a2a") === "true";
    const x402 = c.req.query("x402") === "true";
    const tag = c.req.query("tag");
    const limit = Number(c.req.query("limit")) || 10;

    const result = await searchAgentsTool({
      query: q,
      has_mcp: mcp || undefined,
      has_a2a: a2a || undefined,
      has_x402: x402 || undefined,
      tag: tag || undefined,
      limit
    });

    return c.json(result);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Get agent details
// GET /api/agents/:id
app.get("/api/agents/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const result = await getAgentTool({ id });
    return c.json(result);
  } catch (e) {
    return c.json({ error: String(e) }, 404);
  }
});

// Get agent tools/capabilities
// GET /api/agents/:id/tools
app.get("/api/agents/:id/tools", async (c) => {
  try {
    const id = c.req.param("id");
    const result = await getAgentToolsTool({ id });
    return c.json(result);
  } catch (e) {
    return c.json({ error: String(e) }, 404);
  }
});

// Get agent health status
// GET /api/agents/:id/health
app.get("/api/agents/:id/health", async (c) => {
  try {
    const id = c.req.param("id");
    const result = await getAgentHealthTool({ id });
    return c.json(result);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Get registry stats
// GET /api/stats
app.get("/api/stats", async (c) => {
  try {
    const result = await getStatsTool();
    return c.json(result);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// =============================================================================
// Health Check Routes (existing)
// =============================================================================

// Specific routes BEFORE parameterized routes
app.get("/health/stats", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not set" }, 500);
  }

  const rows = await db
    .select({
      status: agentHealth.status,
      count: sql<number>`count(*)`.mapWith(Number)
    })
    .from(agentHealth)
    .groupBy(agentHealth.status);

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, {});

  return c.json({
    total: rows.reduce((sum, row) => sum + row.count, 0),
    counts
  });
});

app.get("/health/recent", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not set" }, 500);
  }

  const rows = await db
    .select()
    .from(agentHealth)
    .orderBy(desc(agentHealth.lastCheckedAt))
    .limit(20);

  return c.json(rows);
});

// Trigger manual health check run
app.post("/health/run", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not set" }, 500);
  }
  
  const count = Number(c.req.query("count")) || 50;
  
  // Run async, don't wait
  runHealthCheck(count).catch(console.error);
  
  return c.json({ message: `Health check started for up to ${count} agents` });
});

// Parameterized route AFTER specific routes
app.get("/health/:agentId", async (c) => {
  if (!db) {
    return c.json({ error: "DATABASE_URL is not set" }, 500);
  }

  const agentId = Number(c.req.param("agentId"));
  if (!Number.isFinite(agentId)) {
    return c.json({ error: "Invalid agent id" }, 400);
  }

  const rows = await db
    .select()
    .from(agentHealth)
    .where(eq(agentHealth.agentId, agentId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ agentId, status: "unknown" });
  }

  return c.json({
    agentId: row.agentId,
    status: row.status,
    lastCheckedAt: row.lastCheckedAt,
    lastHealthyAt: row.lastHealthyAt,
    latencyMs: row.latencyMs,
    errorMessage: row.errorMessage,
    httpStatus: row.httpStatus,
    mcpValid: row.mcpValid,
    mcpToolsCount: row.mcpToolsCount,
    mcpError: row.mcpError,
    a2aValid: row.a2aValid,
    a2aSkillsCount: row.a2aSkillsCount,
    a2aError: row.a2aError,
    x402Price: row.x402Price,
    x402Currency: row.x402Currency
  });
});

// =============================================================================
// Documentation Routes
// =============================================================================

// Machine-readable documentation for AI assistants
app.get("/llms.txt", (c) => {
  return new Response(llmsTxt, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
});

// OpenAPI specification
app.get("/api/openapi.json", (c) => c.json(openAPISpec));
app.get("/openapi.json", (c) => c.json(openAPISpec)); // alias at root

const port = Number(process.env.PORT ?? 3001);

Bun.serve({
  port,
  fetch: app.fetch
});

console.log(`8004-services listening on http://localhost:${port}`);

// Health check scheduler - runs every 30 minutes
const HEALTH_CHECK_INTERVAL = 30 * 60 * 1000;
const HEALTH_CHECK_BATCH_SIZE = 100;

async function scheduleHealthChecks() {
  if (!db) {
    console.log("[scheduler] DATABASE_URL not set, health checks disabled");
    return;
  }
  
  console.log("[scheduler] Health checker enabled, running every 30 minutes");
  
  // Run initial check after 1 minute startup delay
  setTimeout(() => {
    runHealthCheck(HEALTH_CHECK_BATCH_SIZE).catch(console.error);
  }, 60_000);
  
  // Schedule recurring checks
  setInterval(() => {
    runHealthCheck(HEALTH_CHECK_BATCH_SIZE).catch(console.error);
  }, HEALTH_CHECK_INTERVAL);
}

scheduleHealthChecks();
