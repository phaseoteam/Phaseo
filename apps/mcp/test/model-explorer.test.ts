import { describe, expect, it, vi } from "vitest";
import { pricePerMillion, contextSize } from "../ui/model";
import { linkedModels, modelLink, modelContext } from "../ui/integration";

vi.mock("agents/mcp/server", () => ({ createMcpHandler: vi.fn() }));

describe("Model explorer presentation", () => {
  it("round-trips model and comparison links and rejects invalid routes", () => {
    const ids = ["example/atlas", "example/spark"];
    const path = new URL(modelLink(ids)).searchParams.get("path")!;
    expect(linkedModels(path)).toEqual(ids);
    expect(linkedModels("/")).toEqual([]);
    expect(linkedModels("/models?ids=example%2Fatlas,example%2Fatlas")).toEqual(
      ["example/atlas"],
    );
    for (const invalid of [
      "https://evil.test/models",
      "//evil.test/models",
      "/settings",
      "/models#fragment",
      "/models?ids=a,b,c,d",
      `/models?ids=${"a".repeat(201)}`,
    ])
      expect(() => linkedModels(invalid)).toThrow();
  });

  it("attaches only catalogue fields and explains snapshot pricing", () => {
    const context = modelContext([
      {
        id: "example/atlas",
        name: "Atlas",
        description: "Unneeded text",
        provider: "Example",
        contextTokens: 128000,
        inputModalities: ["text"],
        outputModalities: ["text"],
        inputPricePerToken: "0",
        outputPricePerToken: null,
        supportsTools: true,
        availableProviders: [],
      },
    ]);
    expect(context.structuredContent.models[0]).not.toHaveProperty(
      "description",
    );
    expect(context.content[0].text).toContain(
      "does not change the conversation's model",
    );
    expect(context.content[0].text).toContain("refresh with model_get");
  });
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
