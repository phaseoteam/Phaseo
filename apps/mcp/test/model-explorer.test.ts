import { describe, expect, it, vi } from "vitest";
import { pricePerMillion, contextSize } from "../ui/model";

vi.mock("agents/mcp/server", () => ({ createMcpHandler: vi.fn() }));

describe("Model explorer presentation", () => {
  it("distinguishes free token pricing from absent or invalid pricing", () => {
    expect(pricePerMillion("0")).toBe("$0.00");
    expect(pricePerMillion("0.0000025")).toBe("$2.50");
    for (const value of [null, "", "NaN", "-1"])
      expect(pricePerMillion(value)).toBe("Not listed");
    expect(contextSize(null)).toBe("Not listed");
    expect(contextSize(128000)).toBe("128K");
  });

  it("does not register the app resource without both model and pricing scopes", async () => {
    const { createServer } = await import("../src/index");
    const { Client } = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );
    const { InMemoryTransport } = await import(
      "@modelcontextprotocol/sdk/inMemory.js"
    );
    for (const scopes of [[], ["models:read"], ["pricing:read"]]) {
      const server = createServer(
        {
          PHASEO_API_BASE_URL: "https://api.phaseo.app",
          PHASEO_WEB_BASE_URL: "https://phaseo.app",
          PHASEO_MCP_RESOURCE_SERVER_SECRET: "test",
        },
        {
          accessToken: "test",
          workspaceId: null,
          scopes,
        },
      );
      const client = new Client({ name: "test", version: "1.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      try {
        expect(client.getServerCapabilities()?.tools).toBeUndefined();
        expect(client.getServerCapabilities()?.resources).toBeUndefined();
      } finally {
        await client.close();
        await server.close();
      }
    }
  });
});
