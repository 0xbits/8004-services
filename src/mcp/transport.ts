import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export function createMcpTransport() {
  return new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID()
  });
}
