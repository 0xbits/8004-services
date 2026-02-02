# Task: Health Checker v2 — Expanded Coverage & Fixes

## Overview
Improve the health checker to check more agents and fix validation issues.

## Current Issues
1. Only checks MCP-enabled agents (60 of 20k+)
2. A2A validation constructs wrong path instead of using actual endpoint
3. x402 price/currency never extracted

## Requirements

### 1. Expand Agent Selection
**File:** `src/health/checker.ts`

Change `fetchAgentIds()` to fetch agents that have ANY services, not just MCP:

```typescript
// BEFORE (too narrow)
const res = await fetch(`${INDEXER_API}/search?q=&offset=${offset}&limit=${limit}&mcp=true`);

// AFTER (any agent with services)
// Need to fetch from /agents endpoint and filter those with services
// OR add a "hasServices" filter to the API
// For now: fetch all agents with metadata and check if they have services in detail
```

**Approach:** 
- Fetch agents that have metadata (`metadata=true`)
- For each, fetch detail and check if `services` array is non-empty
- Cache which agents have services to avoid repeated detail fetches

### 2. Fix A2A Validation
**File:** `src/health/checker.ts`

Current broken code:
```typescript
async function checkA2aEndpoint(url: string): Promise<...> {
  // WRONG: constructs path
  const cardUrl = url.endsWith("/") ? `${url}.well-known/agent.json` : `${url}/.well-known/agent.json`;
}
```

Fix:
```typescript
async function checkA2aEndpoint(url: string): Promise<...> {
  // The URL from services IS the agent card URL
  // Just fetch it directly
  const res = await fetch(url, {
    headers: { "User-Agent": "8004-health-checker/1.0" }
  });
  
  if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
  
  const data = await res.json();
  // A2A card has "skills" array
  const skillsCount = data.skills?.length ?? 0;
  return { valid: true, skillsCount };
}
```

### 3. Add x402 Price Extraction
**File:** `src/health/checker.ts`

Add new function:
```typescript
async function checkX402Endpoint(url: string): Promise<{ 
  supported: boolean; 
  price?: string; 
  currency?: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "8004-health-checker/1.0" }
    });
    
    // x402 returns 402 Payment Required
    if (res.status === 402) {
      // Parse payment headers (x402 spec)
      // Common headers: X-Payment, X-Price, X-Currency, X-Payment-Address
      const price = res.headers.get("X-Price") || res.headers.get("X-Payment-Amount");
      const currency = res.headers.get("X-Currency") || res.headers.get("X-Payment-Currency");
      
      // Also check response body for payment info
      try {
        const body = await res.json();
        return {
          supported: true,
          price: price || body.price || body.amount,
          currency: currency || body.currency || body.token
        };
      } catch {
        return { supported: true, price: price || undefined, currency: currency || undefined };
      }
    }
    
    return { supported: false };
  } catch (err) {
    return { supported: false, error: String(err) };
  }
}
```

Update `checkAgent()` to:
1. Look for x402/payment service endpoints
2. Call `checkX402Endpoint()` 
3. Store results in `x402Price` and `x402Currency`

### 4. Update Agent Check Flow

```typescript
async function checkAgent(agentBasic: AgentBasic): Promise<HealthResult | null> {
  const agent = await fetchAgentDetail(agentBasic.id);
  if (!agent || !agent.services || agent.services.length === 0) {
    return null;
  }
  
  // Find service endpoints by name (case-insensitive)
  const mcpService = agent.services.find(s => /^mcp$/i.test(s.name));
  const a2aService = agent.services.find(s => /^a2a$/i.test(s.name));
  const x402Service = agent.services.find(s => /^(x402|payment)$/i.test(s.name));
  const webService = agent.services.find(s => /^web$/i.test(s.name));
  
  // Check primary endpoint (web > mcp > a2a)
  const primaryUrl = webService?.endpoint || mcpService?.endpoint || a2aService?.endpoint;
  // ... existing health check ...
  
  // Check MCP if available
  if (mcpService?.endpoint) {
    const mcp = await checkMcpEndpoint(mcpService.endpoint);
    // ...
  }
  
  // Check A2A if available - USE THE ACTUAL ENDPOINT
  if (a2aService?.endpoint) {
    const a2a = await checkA2aEndpoint(a2aService.endpoint);
    // ...
  }
  
  // Check x402 if available OR if agent has x402Support flag
  if (x402Service?.endpoint || agentBasic.x402Support) {
    const checkUrl = x402Service?.endpoint || primaryUrl;
    if (checkUrl) {
      const x402 = await checkX402Endpoint(checkUrl);
      result.x402Price = x402.price;
      result.x402Currency = x402.currency;
    }
  }
  
  return result;
}
```

## Testing

After implementation:
```bash
# Run health check on a few agents
bun run src/health/checker.ts 10

# Check an agent with x402
curl https://agents-services.b1ts.dev/health/13445

# Check stats
curl https://agents-services.b1ts.dev/health/stats
```

## Success Criteria
- [ ] Health checker checks agents with any services (not just MCP)
- [ ] A2A validation uses actual endpoint URL from services
- [ ] x402 price/currency extracted when available
- [ ] All existing functionality still works
- [ ] Stats show increased coverage

## Self-Review Prompts
After completing, review your work:
1. Are there any edge cases not handled (missing services, null endpoints)?
2. Is error handling comprehensive?
3. Could any of the fetch calls benefit from timeouts?
4. Is the code DRY - any repeated patterns that should be extracted?
5. Are the types accurate and complete?
