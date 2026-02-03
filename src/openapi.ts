/**
 * OpenAPI 3.0 specification for the ERC-8004 Agent Registry API
 */
export const openAPISpec = {
  openapi: "3.0.0",
  info: {
    title: "ERC-8004 Agent Registry API",
    version: "1.0.0",
    description: "Discover and interact with on-chain AI agents registered via ERC-8004. No authentication required for read operations.",
    contact: {
      name: "Bits",
      url: "https://b1ts.dev"
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT"
    }
  },
  servers: [
    { 
      url: "https://agents-services.b1ts.dev", 
      description: "Production" 
    },
    {
      url: "http://localhost:3001",
      description: "Local development"
    }
  ],
  tags: [
    { name: "Agents", description: "Agent discovery and details" },
    { name: "Health", description: "Agent health status" },
    { name: "Stats", description: "Registry statistics" }
  ],
  paths: {
    "/api/agents/search": {
      get: {
        tags: ["Agents"],
        summary: "Search agents",
        description: "Search and filter agents by query, capabilities, and tags",
        operationId: "searchAgents",
        parameters: [
          { 
            name: "q", 
            in: "query", 
            description: "Free-text search query",
            schema: { type: "string" },
            example: "defi swap"
          },
          { 
            name: "mcp", 
            in: "query", 
            description: "Filter to MCP-enabled agents",
            schema: { type: "boolean" },
            example: true
          },
          { 
            name: "a2a", 
            in: "query", 
            description: "Filter to A2A-enabled agents",
            schema: { type: "boolean" } 
          },
          { 
            name: "x402", 
            in: "query", 
            description: "Filter to x402 payment-enabled agents",
            schema: { type: "boolean" } 
          },
          { 
            name: "tag", 
            in: "query", 
            description: "Filter by tag",
            schema: { type: "string" },
            example: "defi"
          },
          { 
            name: "limit", 
            in: "query", 
            description: "Maximum number of results",
            schema: { type: "integer", default: 10, minimum: 1, maximum: 100 } 
          }
        ],
        responses: {
          "200": { 
            description: "Search results",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SearchResponse" }
              }
            }
          },
          "500": { description: "Server error" }
        }
      }
    },
    "/api/agents/{id}": {
      get: {
        tags: ["Agents"],
        summary: "Get agent details",
        description: "Retrieve full metadata for a specific agent",
        operationId: "getAgent",
        parameters: [
          { 
            name: "id", 
            in: "path", 
            required: true, 
            description: "Agent ID",
            schema: { type: "string" },
            example: "13445"
          }
        ],
        responses: {
          "200": { 
            description: "Agent details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Agent" }
              }
            }
          },
          "404": { description: "Agent not found" }
        }
      }
    },
    "/api/agents/{id}/tools": {
      get: {
        tags: ["Agents"],
        summary: "Get agent tools",
        description: "List all MCP tools and capabilities for an agent",
        operationId: "getAgentTools",
        parameters: [
          { 
            name: "id", 
            in: "path", 
            required: true, 
            description: "Agent ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": { 
            description: "List of tools",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AgentTools" }
              }
            }
          },
          "404": { description: "Agent not found" }
        }
      }
    },
    "/api/agents/{id}/health": {
      get: {
        tags: ["Health"],
        summary: "Get agent health",
        description: "Check health status of agent endpoints (MCP, A2A, x402)",
        operationId: "getAgentHealth",
        parameters: [
          { 
            name: "id", 
            in: "path", 
            required: true, 
            description: "Agent ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": { 
            description: "Health status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AgentHealth" }
              }
            }
          }
        }
      }
    },
    "/api/stats": {
      get: {
        tags: ["Stats"],
        summary: "Get registry stats",
        description: "Retrieve aggregate statistics for the registry",
        operationId: "getStats",
        responses: {
          "200": { 
            description: "Registry statistics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Stats" }
              }
            }
          }
        }
      }
    },
    "/health/stats": {
      get: {
        tags: ["Health"],
        summary: "Get health check statistics",
        description: "Aggregate health check results across all agents",
        operationId: "getHealthStats",
        responses: {
          "200": {
            description: "Health statistics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total: { type: "integer" },
                    counts: {
                      type: "object",
                      additionalProperties: { type: "integer" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Agent: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique agent ID" },
          owner: { type: "string", description: "Owner address" },
          name: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          image: { type: "string", nullable: true },
          externalUrl: { type: "string", nullable: true },
          hasMCP: { type: "boolean" },
          hasA2A: { type: "boolean" },
          x402Support: { type: "boolean" },
          mcpTools: { 
            type: "array", 
            items: { type: "string" },
            nullable: true 
          },
          a2aSkills: { 
            type: "array", 
            items: { type: "string" },
            nullable: true 
          },
          tags: { 
            type: "array", 
            items: { type: "string" },
            nullable: true 
          },
          feedbackCount: { type: "integer" },
          avgRating: { type: "number", nullable: true },
          services: {
            type: "array",
            items: { $ref: "#/components/schemas/Service" },
            nullable: true
          }
        }
      },
      Service: {
        type: "object",
        properties: {
          name: { type: "string" },
          endpoint: { type: "string" },
          version: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          tools: { 
            type: "array", 
            items: { type: "string" },
            nullable: true 
          },
          skills: { 
            type: "array", 
            items: { type: "string" },
            nullable: true 
          }
        }
      },
      AgentTools: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", nullable: true },
          tools: { 
            type: "array", 
            items: { type: "string" }
          }
        }
      },
      AgentHealth: {
        type: "object",
        properties: {
          agentId: { type: "integer" },
          status: { 
            type: "string", 
            enum: ["healthy", "unhealthy", "unreachable", "unknown"]
          },
          lastCheckedAt: { type: "string", format: "date-time", nullable: true },
          lastHealthyAt: { type: "string", format: "date-time", nullable: true },
          latencyMs: { type: "integer", nullable: true },
          httpStatus: { type: "integer", nullable: true },
          mcpValid: { type: "boolean", nullable: true },
          mcpToolsCount: { type: "integer", nullable: true },
          a2aValid: { type: "boolean", nullable: true },
          a2aSkillsCount: { type: "integer", nullable: true },
          x402Price: { type: "string", nullable: true },
          x402Currency: { type: "string", nullable: true }
        }
      },
      SearchResponse: {
        type: "object",
        properties: {
          query: { type: "string" },
          count: { type: "integer" },
          offset: { type: "integer" },
          limit: { type: "integer" },
          results: {
            type: "array",
            items: { $ref: "#/components/schemas/Agent" }
          }
        }
      },
      Stats: {
        type: "object",
        properties: {
          totalAgents: { type: "integer" },
          totalFeedback: { type: "integer" },
          agentsWithURI: { type: "integer", nullable: true },
          agentsWithMetadata: { type: "integer", nullable: true },
          agentsWithMCP: { type: "integer", nullable: true },
          agentsWithA2A: { type: "integer", nullable: true },
          agentsWithX402: { type: "integer", nullable: true }
        }
      }
    }
  }
};
