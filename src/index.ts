import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { agentHealth } from "./db/schema";
import { createMcpServer } from "./mcp/server";
import { createMcpTransport } from "./mcp/transport";

const app = new Hono();

const mcpServer = createMcpServer();
const mcpTransport = createMcpTransport();
await mcpServer.connect(mcpTransport);

app.all("/mcp", (c) => mcpTransport.handleRequest(c.req.raw));

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

const port = Number(process.env.PORT ?? 3001);

Bun.serve({
  port,
  fetch: app.fetch
});

console.log(`8004-services listening on http://localhost:${port}`);
