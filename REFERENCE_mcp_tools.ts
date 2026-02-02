// REFERENCE: Current MCP tools implementation from 8004-app
// Adapt this for the new Bun/Hono service - call indexer API directly

const INDEXER_API = process.env.INDEXER_API_URL || "https://agents-api.b1ts.dev";

export interface Agent {
  id: string;
  owner: string;
  uri?: string | null;
  wallet?: string | null;
  name?: string | null;
  description?: string | null;
  image?: string | null;
  externalUrl?: string | null;
  active?: boolean;
  x402Support?: boolean;
  hasMCP?: boolean;
  hasA2A?: boolean;
  mcpCapabilities?: string[] | null;
  mcpTools?: string[] | null;
  a2aSkills?: string[] | null;
  tags?: string[] | null;
  protocols?: string[] | null;
  chain?: string | null;
  chainId?: number | null;
  feedbackCount: number;
  avgRating?: number | null;
  services?: {
    name: string;
    endpoint: string;
    version?: string | null;
    description?: string | null;
    tools?: string[] | null;
    skills?: string[] | null;
  }[] | null;
}

export interface SearchResponse {
  query: string;
  count: number;
  offset: number;
  limit: number;
  results: Agent[];
}

export interface StatsResponse {
  totalAgents: number;
  totalFeedback: number;
  agentsWithURI?: number;
  agentsWithMetadata?: number;
  agentsWithMCP?: number;
  agentsWithA2A?: number;
  agentsWithX402?: number;
}

// API calls to indexer
export async function searchAgents(params: {
  query?: string;
  limit?: number;
  offset?: number;
  tag?: string;
  mcp?: boolean;
  a2a?: boolean;
  x402?: boolean;
}): Promise<SearchResponse> {
  const url = new URL(`${INDEXER_API}/search`);
  if (params.query) url.searchParams.set("q", params.query);
  if (params.limit) url.searchParams.set("limit", params.limit.toString());
  if (params.offset) url.searchParams.set("offset", params.offset.toString());
  if (params.tag) url.searchParams.set("tag", params.tag);
  if (params.mcp) url.searchParams.set("mcp", "true");
  if (params.a2a) url.searchParams.set("a2a", "true");
  if (params.x402) url.searchParams.set("x402", "true");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to search agents");
  return res.json();
}

export async function getAgent(id: string): Promise<Agent> {
  const res = await fetch(`${INDEXER_API}/agents/${id}`);
  if (!res.ok) throw new Error("Agent not found");
  return res.json();
}

export async function getStats(): Promise<StatsResponse> {
  const res = await fetch(`${INDEXER_API}/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

// Tool implementations for MCP
export async function searchAgentsTool(input: {
  query?: string;
  has_mcp?: boolean;
  has_a2a?: boolean;
  has_x402?: boolean;
  tag?: string;
  limit?: number;
}) {
  return searchAgents({
    query: input.query,
    limit: input.limit ?? 10,
    tag: input.tag,
    mcp: input.has_mcp,
    a2a: input.has_a2a,
    x402: input.has_x402,
  });
}

export async function getAgentTool(input: { id: string }) {
  return getAgent(input.id);
}

export async function getAgentToolsTool(input: { id: string }) {
  const agent = await getAgent(input.id);
  const serviceTools = agent.services?.flatMap((s) => s.tools ?? []) ?? [];
  const allTools = [...(agent.mcpTools ?? []), ...(agent.mcpCapabilities ?? []), ...serviceTools];
  return {
    id: agent.id,
    name: agent.name ?? null,
    tools: [...new Set(allTools.filter(Boolean))],
  };
}

export async function getMcpConfigTool(input: { id: string }) {
  const agent = await getAgent(input.id);
  
  // Find MCP endpoint
  let endpoint: string | null = null;
  if (agent.hasMCP && agent.services) {
    const mcpService = agent.services.find((s) => 
      /mcp/i.test(`${s.name} ${s.description ?? ""} ${s.endpoint}`)
    );
    endpoint = mcpService?.endpoint ?? agent.uri ?? null;
  }

  if (!endpoint) {
    return {
      id: agent.id,
      name: agent.name ?? null,
      config: null,
      error: "MCP endpoint not found for this agent.",
    };
  }

  const agentKey = agent.name
    ? agent.name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "")
    : `agent-${agent.id}`;

  return {
    id: agent.id,
    name: agent.name ?? null,
    config: {
      mcpServers: {
        [agentKey]: { url: endpoint, transport: "sse" },
      },
    },
  };
}

export async function getStatsTool() {
  return getStats();
}
