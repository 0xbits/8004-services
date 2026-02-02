import { pgTable, text, timestamp, integer, boolean, bigint } from "drizzle-orm/pg-core";

export const agentHealth = pgTable("agent_health", {
  agentId: bigint("agent_id", { mode: "number" }).primaryKey(),
  status: text("status").notNull().default("unknown"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: false }),
  lastHealthyAt: timestamp("last_healthy_at", { withTimezone: false }),
  latencyMs: integer("latency_ms"),
  errorMessage: text("error_message"),
  httpStatus: integer("http_status"),
  mcpValid: boolean("mcp_valid"),
  mcpToolsCount: integer("mcp_tools_count"),
  mcpError: text("mcp_error"),
  a2aValid: boolean("a2a_valid"),
  a2aSkillsCount: integer("a2a_skills_count"),
  a2aError: text("a2a_error"),
  x402Price: text("x402_price"),
  x402Currency: text("x402_currency")
});
