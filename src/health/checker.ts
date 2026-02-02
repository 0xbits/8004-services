import { db } from "../db/client";
import { agentHealth } from "../db/schema";
import { eq } from "drizzle-orm";

const INDEXER_API = process.env.INDEXER_API_URL ?? "https://agents-api.b1ts.dev";
const BATCH_SIZE = 10;
const CHECK_INTERVAL_MS = 1000; // 1 req/sec rate limit friendly

interface AgentService {
  name: string;
  endpoint: string;
}

interface AgentBasic {
  id: string;
  hasMCP: boolean;
  hasA2A: boolean;
}

interface AgentDetail {
  id: string;
  services?: AgentService[] | null;
}

interface HealthResult {
  agentId: number;
  status: "healthy" | "unhealthy" | "unreachable";
  latencyMs?: number;
  httpStatus?: number;
  errorMessage?: string;
  mcpValid?: boolean;
  mcpToolsCount?: number;
  mcpError?: string;
  a2aValid?: boolean;
  a2aSkillsCount?: number;
  a2aError?: string;
  x402Price?: string;
  x402Currency?: string;
}

async function fetchAgentIds(offset: number, limit: number): Promise<AgentBasic[]> {
  // Use search endpoint with mcp=true or a2a=true to get agents that have endpoints
  const res = await fetch(`${INDEXER_API}/search?q=&offset=${offset}&limit=${limit}&mcp=true`);
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
  const data = await res.json();
  return (data.results ?? []).map((a: { id: string; hasMCP?: boolean; hasA2A?: boolean }) => ({
    id: a.id,
    hasMCP: a.hasMCP ?? false,
    hasA2A: a.hasA2A ?? false,
  }));
}

async function fetchAgentDetail(id: string): Promise<AgentDetail | null> {
  try {
    const res = await fetch(`${INDEXER_API}/agents/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function findServiceEndpoint(services: AgentService[] | null | undefined, pattern: RegExp): string | null {
  if (!services) return null;
  const service = services.find(s => pattern.test(s.name));
  return service?.endpoint ?? null;
}

async function checkEndpoint(url: string, timeout = 10000): Promise<{ ok: boolean; status?: number; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const res = await fetch(url, { 
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "8004-health-checker/1.0" }
    });
    
    clearTimeout(timeoutId);
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkMcpEndpoint(url: string): Promise<{ valid: boolean; toolsCount?: number; error?: string }> {
  try {
    // Try to get MCP server info via initialize
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "8004-health-checker", version: "1.0" }
        }
      })
    });
    
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
    
    const data = await res.json();
    if (data.error) return { valid: false, error: data.error.message };
    
    // Try to list tools
    const toolsRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      })
    });
    
    if (toolsRes.ok) {
      const toolsData = await toolsRes.json();
      const toolsCount = toolsData.result?.tools?.length ?? 0;
      return { valid: true, toolsCount };
    }
    
    return { valid: true };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}

async function checkA2aEndpoint(url: string): Promise<{ valid: boolean; skillsCount?: number; error?: string }> {
  try {
    // A2A agent card endpoint
    const cardUrl = url.endsWith("/") ? `${url}.well-known/agent.json` : `${url}/.well-known/agent.json`;
    const res = await fetch(cardUrl, {
      headers: { "User-Agent": "8004-health-checker/1.0" }
    });
    
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
    
    const data = await res.json();
    const skillsCount = data.skills?.length ?? 0;
    return { valid: true, skillsCount };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}

async function checkAgent(agentBasic: AgentBasic): Promise<HealthResult | null> {
  const agentId = Number(agentBasic.id);
  const result: HealthResult = { agentId, status: "unreachable" };
  
  // Fetch full agent detail to get service endpoints
  const agent = await fetchAgentDetail(agentBasic.id);
  if (!agent || !agent.services || agent.services.length === 0) {
    return null; // No services to check
  }
  
  // Find MCP and A2A endpoints
  const mcpUrl = findServiceEndpoint(agent.services, /^mcp$/i);
  const a2aUrl = findServiceEndpoint(agent.services, /^a2a$/i);
  const webUrl = findServiceEndpoint(agent.services, /^web$/i);
  
  // Check primary URL first (prefer web, then mcp, then a2a)
  const primaryUrl = webUrl || mcpUrl || a2aUrl;
  if (primaryUrl) {
    const check = await checkEndpoint(primaryUrl);
    result.latencyMs = check.latencyMs;
    result.httpStatus = check.status;
    result.errorMessage = check.error;
    result.status = check.ok ? "healthy" : "unhealthy";
  }
  
  // Check MCP if available
  if (mcpUrl) {
    const mcp = await checkMcpEndpoint(mcpUrl);
    result.mcpValid = mcp.valid;
    result.mcpToolsCount = mcp.toolsCount;
    result.mcpError = mcp.error;
  }
  
  // Check A2A if available
  if (a2aUrl) {
    const a2a = await checkA2aEndpoint(a2aUrl);
    result.a2aValid = a2a.valid;
    result.a2aSkillsCount = a2a.skillsCount;
    result.a2aError = a2a.error;
  }
  
  return result;
}

async function saveHealthResult(result: HealthResult) {
  if (!db) return;
  
  const now = new Date();
  
  await db
    .insert(agentHealth)
    .values({
      agentId: result.agentId,
      status: result.status,
      lastCheckedAt: now,
      lastHealthyAt: result.status === "healthy" ? now : undefined,
      latencyMs: result.latencyMs,
      errorMessage: result.errorMessage,
      httpStatus: result.httpStatus,
      mcpValid: result.mcpValid,
      mcpToolsCount: result.mcpToolsCount,
      mcpError: result.mcpError,
      a2aValid: result.a2aValid,
      a2aSkillsCount: result.a2aSkillsCount,
      a2aError: result.a2aError,
      x402Price: result.x402Price,
      x402Currency: result.x402Currency
    })
    .onConflictDoUpdate({
      target: agentHealth.agentId,
      set: {
        status: result.status,
        lastCheckedAt: now,
        lastHealthyAt: result.status === "healthy" ? now : undefined,
        latencyMs: result.latencyMs,
        errorMessage: result.errorMessage,
        httpStatus: result.httpStatus,
        mcpValid: result.mcpValid,
        mcpToolsCount: result.mcpToolsCount,
        mcpError: result.mcpError,
        a2aValid: result.a2aValid,
        a2aSkillsCount: result.a2aSkillsCount,
        a2aError: result.a2aError,
        x402Price: result.x402Price,
        x402Currency: result.x402Currency
      }
    });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runHealthCheck(maxAgents = 100) {
  if (!db) {
    console.log("[health] DATABASE_URL not set, skipping health check");
    return;
  }
  
  console.log(`[health] Starting health check run (max ${maxAgents} agents)...`);
  let checked = 0;
  let offset = 0;
  
  while (checked < maxAgents) {
    const agents = await fetchAgentIds(offset, BATCH_SIZE);
    if (agents.length === 0) break;
    
    for (const agent of agents) {
      if (checked >= maxAgents) break;
      
      try {
        const result = await checkAgent(agent);
        if (result) {
          await saveHealthResult(result);
          console.log(`[health] Agent ${agent.id}: ${result.status} (${result.latencyMs ?? 0}ms)`);
          checked++;
        }
      } catch (err) {
        console.error(`[health] Error checking agent ${agent.id}:`, err);
      }
      
      // Rate limit
      await sleep(CHECK_INTERVAL_MS);
    }
    
    offset += BATCH_SIZE;
  }
  
  console.log(`[health] Completed. Checked ${checked} agents.`);
}

// Run as CLI
if (import.meta.main) {
  const maxAgents = Number(process.argv[2]) || 50;
  runHealthCheck(maxAgents).catch(console.error);
}
