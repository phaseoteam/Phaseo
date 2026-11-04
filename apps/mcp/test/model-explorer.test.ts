import { describe, expect, it, vi } from "vitest";
import {
  pricePerMillion,
  contextSize,
  headlinePrice,
  money,
  tokenCount,
  modalitySummary,
  perMillion,
  cheapestProviderName,
  type CardModel,
} from "../ui/model";
import { cardFor } from "../ui/cardData";
import { linkedModels, modelLink, modelContext } from "../ui/integration";

vi.mock("agents/mcp/server", () => ({ createMcpHandler: vi.fn() }));

describe("Inline cards", () => {
  const model: CardModel = {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    description: null,
    provider: "OpenAI",
    contextTokens: 131_072,
    inputModalities: ["text"],
    outputModalities: ["text"],
    inputPricePerToken: "0.00000002",
    outputPricePerToken: "0.000000095",
    supportsTools: true,
    availableProviders: ["ionrouter"],
    inputPriceProviderId: "ionrouter",
    providerSupport: [{ providerId: "ionrouter", providerName: "IonRouter" }],
  };

  it("formats prices the way the website's model list does", () => {
    expect(headlinePrice(0.02)).toBe("$0.02");
    expect(headlinePrice(0.095)).toBe("$0.095");
    expect(headlinePrice(0.1)).toBe("$0.10");
    expect(headlinePrice(2)).toBe("$2");
    expect(headlinePrice(2.5)).toBe("$2.50");
    expect(headlinePrice(0.000123456)).toBe("$0.000123");
    expect(headlinePrice(0)).toBe("$0");
    for (const missing of [null, undefined, Number.NaN, -1])
      expect(headlinePrice(missing)).toBe("Not listed");
  });

  it("formats totals in US dollars without hiding sub-cent costs", () => {
    expect(money(12.5)).toBe("$12.50");
    expect(money(0.0875)).toBe("$0.09");
    expect(money(0.00475)).toBe("$0.00475");
    expect(money(0)).toBe("$0.00");
    expect(tokenCount(2_000_000)).toBe("2M");
    expect(tokenCount(500_000)).toBe("500K");
  });

  it("reads row details from model results", () => {
    expect(perMillion(model, "input")).toBeCloseTo(0.02);
    expect(perMillion({ ...model, outputPricePerMillion: 0.095 }, "output")).toBe(0.095);
    expect(perMillion({ ...model, inputPricePerToken: null }, "input")).toBeNull();
    expect(cheapestProviderName(model)).toBe("IonRouter");
    expect(cheapestProviderName({ ...model, outputPriceProviderId: "ionrouter" })).toBe("IonRouter");
    // Input and output minima from different providers: no single "via" label.
    expect(cheapestProviderName({ ...model, outputPriceProviderId: "other" })).toBeNull();
    expect(
      cheapestProviderName({ ...model, inputPriceProviderId: null, outputPriceProviderId: "ionrouter" }),
    ).toBe("IonRouter");
    expect(modalitySummary(["text", "image"], ["text"])).toBe("Text, Image → Text");
    expect(modalitySummary([], [])).toBeNull();
  });

  it("picks the card from the tool result's shape", () => {
    expect(cardFor({ models: [model] })).toEqual({ kind: "models", models: [model] });
    const estimate = { modelId: "a", providerId: "p", totalCostUSD: 0.09 };
    expect(cardFor({ estimate })).toMatchObject({ kind: "estimate", estimate });
    const credits = { availableNanos: 5e9, thirtyDayRequests: 7 };
    expect(cardFor({ credits })).toMatchObject({ kind: "credits", credits });
    for (const other of [null, [], {}, { estimate: {} }, { credits: { balance: 1 } }])
      expect(cardFor(other)).toBeNull();
  });
});

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
    // The first import of the server bundle is slow on a loaded machine.
  }, 30_000);
});
