import { db } from "../db/client";
import { agentHealth } from "../db/schema";

const INDEXER_API = process.env.INDEXER_API_URL ?? "https://agents-api.b1ts.dev";
const BATCH_SIZE = 10;
const CHECK_INTERVAL_MS = 1000; // 1 req/sec rate limit friendly
const FETCH_TIMEOUT_MS = 10000;

interface AgentService {
  name: string;
  endpoint: string;
}

interface AgentBasic {
  id: string;
  hasMCP: boolean;
  hasA2A: boolean;
  x402Support: boolean;
}

interface AgentDetail {
  id: string;
  x402Support?: boolean;
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

/**
 * Fetch agents that have metadata (likely to have services)
 * We fetch with metadata=true to get agents that have been enriched
 */
async function fetchAgentIds(offset: number, limit: number): Promise<AgentBasic[]> {
  // Fetch agents with metadata - these are the ones likely to have services
  const res = await fetch(`${INDEXER_API}/search?metadata=true&offset=${offset}&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
  const data = await res.json();
  return (data.results ?? []).map((a: { 
    id: string; 
    hasMCP?: boolean; 
    hasA2A?: boolean;
    x402Support?: boolean;
  }) => ({
    id: a.id,
    hasMCP: a.hasMCP ?? false,
    hasA2A: a.hasA2A ?? false,
    x402Support: a.x402Support ?? false,
  }));
}

async function fetchAgentDetail(id: string): Promise<AgentDetail | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    const res = await fetch(`${INDEXER_API}/agents/${id}`, {
      signal: controller.signal,
      headers: { "User-Agent": "8004-health-checker/1.0" }
    });
    
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function findService(services: AgentService[] | null | undefined, pattern: RegExp): AgentService | null {
  if (!services) return null;
  return services.find(s => pattern.test(s.name)) ?? null;
}

async function checkEndpoint(url: string, timeout = FETCH_TIMEOUT_MS): Promise<{ 
  ok: boolean; 
  status?: number; 
  latencyMs: number; 
  error?: string 
}> {
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

async function checkMcpEndpoint(url: string): Promise<{ 
  valid: boolean; 
  toolsCount?: number; 
  error?: string 
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    // Try to get MCP server info via initialize
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
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
    
    clearTimeout(timeoutId);
    
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
    
    const data = await res.json();
    if (data.error) return { valid: false, error: data.error.message };
    
    // Try to list tools
    const toolsController = new AbortController();
    const toolsTimeoutId = setTimeout(() => toolsController.abort(), FETCH_TIMEOUT_MS);
    
    const toolsRes = await fetch(url, {
      method: "POST",
      signal: toolsController.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      })
    });
    
    clearTimeout(toolsTimeoutId);
    
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

/**
 * Check A2A endpoint - use the actual endpoint URL from services
 * The endpoint IS the agent card URL, don't construct it
 */
async function checkA2aEndpoint(url: string): Promise<{ 
  valid: boolean; 
  skillsCount?: number; 
  error?: string 
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    // The URL from services IS the agent card URL - fetch it directly
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 
        "User-Agent": "8004-health-checker/1.0",
        "Accept": "application/json"
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
    
    const data = await res.json();
    
    // A2A agent card should have skills array
    const skillsCount = data.skills?.length ?? 0;
    
    // Basic validation - should have some agent card structure
    if (!data.name && !data.skills && !data.description) {
      return { valid: false, error: "Invalid agent card format" };
    }
    
    return { valid: true, skillsCount };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}

/**
 * Check x402 endpoint for payment info
 * x402 spec: endpoint returns HTTP 402 with payment headers
 */
async function checkX402Endpoint(url: string): Promise<{ 
  supported: boolean; 
  price?: string; 
  currency?: string;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "8004-health-checker/1.0" }
    });
    
    clearTimeout(timeoutId);
    
    // x402 returns 402 Payment Required
    if (res.status === 402) {
      // Parse payment headers (x402 spec variants)
      const price = 
        res.headers.get("X-Price") || 
        res.headers.get("X-Payment-Amount") ||
        res.headers.get("X-402-Price");
      const currency = 
        res.headers.get("X-Currency") || 
        res.headers.get("X-Payment-Currency") ||
        res.headers.get("X-402-Currency") ||
        res.headers.get("X-Payment-Token");
      
      // Also check response body for payment info
      try {
        const body = await res.json();
        return {
          supported: true,
          price: price || body.price || body.amount || body.cost,
          currency: currency || body.currency || body.token || body.asset
        };
      } catch {
        // Body might not be JSON
        return { 
          supported: true, 
          price: price || undefined, 
          currency: currency || undefined 
        };
      }
    }
    
    // Not a 402 response - check if endpoint works at all
    if (res.ok) {
      return { supported: false }; // Works but no payment required
    }
    
    return { supported: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { supported: false, error: String(err) };
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
  
  // Find service endpoints by name (case-insensitive)
  const mcpService = findService(agent.services, /^mcp$/i);
  const a2aService = findService(agent.services, /^a2a$/i);
  const x402Service = findService(agent.services, /^(x402|payment)$/i);
  const webService = findService(agent.services, /^web$/i);
  
  // Check primary URL first (prefer web, then mcp, then a2a)
  const primaryUrl = webService?.endpoint || mcpService?.endpoint || a2aService?.endpoint;
  if (primaryUrl) {
    const check = await checkEndpoint(primaryUrl);
    result.latencyMs = check.latencyMs;
    result.httpStatus = check.status;
    result.errorMessage = check.error;
    result.status = check.ok ? "healthy" : "unhealthy";
  }
  
  // Check MCP if available
  if (mcpService?.endpoint) {
    const mcp = await checkMcpEndpoint(mcpService.endpoint);
    result.mcpValid = mcp.valid;
    result.mcpToolsCount = mcp.toolsCount;
    result.mcpError = mcp.error;
  }
  
  // Check A2A if available - USE THE ACTUAL ENDPOINT
  if (a2aService?.endpoint) {
    const a2a = await checkA2aEndpoint(a2aService.endpoint);
    result.a2aValid = a2a.valid;
    result.a2aSkillsCount = a2a.skillsCount;
    result.a2aError = a2a.error;
  }
  
  // Check x402 if:
  // 1. There's an explicit x402/payment service, OR
  // 2. Agent has x402Support flag and we have a primary URL to test
  const x402Url = x402Service?.endpoint || (agentBasic.x402Support ? primaryUrl : null);
  if (x402Url) {
    const x402 = await checkX402Endpoint(x402Url);
    if (x402.supported) {
      result.x402Price = x402.price;
      result.x402Currency = x402.currency;
    }
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
  let skipped = 0;
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
          const extras = [];
          if (result.mcpValid) extras.push(`MCP:${result.mcpToolsCount ?? 0}tools`);
          if (result.a2aValid) extras.push(`A2A:${result.a2aSkillsCount ?? 0}skills`);
          if (result.x402Price) extras.push(`x402:${result.x402Price}${result.x402Currency || ''}`);
          const extrasStr = extras.length > 0 ? ` [${extras.join(', ')}]` : '';
          console.log(`[health] Agent ${agent.id}: ${result.status} (${result.latencyMs ?? 0}ms)${extrasStr}`);
          checked++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`[health] Error checking agent ${agent.id}:`, err);
      }
      
      // Rate limit
      await sleep(CHECK_INTERVAL_MS);
    }
    
    offset += BATCH_SIZE;
  }
  
  console.log(`[health] Completed. Checked ${checked} agents, skipped ${skipped} (no services).`);
}

// Run as CLI
if (import.meta.main) {
  const maxAgents = Number(process.argv[2]) || 50;
  runHealthCheck(maxAgents).catch(console.error);
}
