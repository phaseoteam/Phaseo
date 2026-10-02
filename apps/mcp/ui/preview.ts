// Development-only fixture host. This file is never bundled into the MCP resource.
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type { Model } from "./model";

const models: Model[] = [
  {
    id: "example/atlas",
    gatewayAvailable: true,
    supportedEndpoints: ["chat.completions"],
    name: "Atlas",
    provider: "Example Lab",
    description: "A fixture model for testing model details and comparisons.",
    contextTokens: 128000,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    inputPricePerToken: "0.0000025",
    outputPricePerToken: "0.00001",
    supportsTools: true,
    availableProviders: ["Example Cloud"],
  },
  {
    id: "example/spark",
    gatewayAvailable: true,
    supportedEndpoints: ["chat.completions"],
    name: "Spark",
    provider: "Example Lab",
    description: "A smaller fixture model with lower listed token costs.",
    contextTokens: 64000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    inputPricePerToken: "0.00000015",
    outputPricePerToken: "0.0000006",
    supportsTools: true,
    availableProviders: ["Example Cloud", "Example Edge"],
  },
  {
    id: "example/canvas",
    name: "Canvas",
    provider: "Studio",
    description: "An image fixture with no token pricing listed.",
    contextTokens: null,
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    inputPricePerToken: null,
    outputPricePerToken: null,
    supportsTools: false,
    availableProviders: [],
  },
  {
    id: "example/zero",
    name: "Zero",
    provider: "Community",
    description: "A fixture with a free offer and no paid pricing.",
    contextTokens: 32000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    inputPricePerToken: null,
    outputPricePerToken: null,
    hasFreeProvider: true,
    supportsTools: false,
    availableProviders: ["Example Edge"],
  },
];
const bridge = new AppBridge(
  null,
  { name: "Phaseo fixture preview", version: "1.0.0" },
  { serverTools: {}, logging: {} },
);
const fixtureQuotes = new Map<
  string,
  {
    plans: Array<{
      modelId: string;
      modelName: string;
      providerId: string | undefined;
      estimatedCostUsd: number;
    }>;
    prompt: string;
  }
>();
bridge.setHostContext({
  theme: "light",
  displayMode: "fullscreen",
  availableDisplayModes: ["fullscreen"],
});
bridge.oncalltool = async ({ name, arguments: args = {} }) => {
  const permissions = new URLSearchParams(location.search).get("permissions");
  const ok = (data: Record<string, unknown>) => ({
    content: [{ type: "text" as const, text: "Development fixture result" }],
    structuredContent: data,
  });
  const error = (text: string) => ({
    isError: true,
    content: [{ type: "text" as const, text }],
  });
  if (
    ["credits_get", "analytics_get", "logs_list"].includes(name) &&
    permissions === "malformed"
  )
    return ok({ credits: {}, analytics: null, logs: "invalid" });
  if (
    ["credits_get", "analytics_get", "logs_list"].includes(name) &&
    permissions === "limited"
  )
    return error("Fixture permission denied.");
  if (name === "credits_get")
    return ok({
      credits: {
        availableNanos: 12_500_000_000,
        reservedNanos: 500_000_000,
        thirtyDayUsageNanos: 3_750_000_000,
        thirtyDayRequests: 42,
      },
    });
  if (name === "analytics_get")
    return ok({
      analytics: [
        { model: "Atlas", requests: 30, costUsd: 2.5 },
        { model: "Spark", requests: 12, costUsd: 1.25 },
      ],
    });
  if (name === "logs_list")
    return ok({
      logs: [
        {
          requestId: "fixture-success",
          model: "Atlas",
          provider: "Example Cloud",
          timestamp: "Fixture timestamp",
          success: true,
          costUsd: 0.0125,
          latencyMs: 800,
        },
        {
          requestId: "fixture-failure",
          model: "Spark",
          provider: "Example Edge",
          timestamp: "Fixture timestamp",
          success: false,
          costUsd: null,
          latencyMs: 150,
        },
      ],
    });
  if (name === "inference_quote") {
    const ids = args.modelIds as string[];
    const selected = models.filter((model) => ids.includes(model.id));
    if (!selected.length || selected.some((model) => !model.gatewayAvailable))
      return error(
        "No eligible text provider for the selected fixture models.",
      );
    const plans = selected.map((model) => ({
      modelId: model.id,
      modelName: model.name,
      providerId: model.availableProviders[0],
      estimatedCostUsd:
        (new TextEncoder().encode(String(args.prompt)).length + 256) *
          Number(model.inputPricePerToken) +
        Number(args.maxOutputTokens) * Number(model.outputPricePerToken),
    }));
    const total = plans.reduce((sum, plan) => sum + plan.estimatedCostUsd, 0);
    if (total > Number(args.maxEstimatedCostUsd))
      return error("The estimated total exceeds your estimate budget.");
    const quoteToken = crypto.randomUUID();
    fixtureQuotes.set(quoteToken, { plans, prompt: String(args.prompt) });
    return ok({
      quoteToken,
      plans,
      estimatedCostUsd: total,
      expiresAt: Date.now() + 300000,
      maxOutputTokens: args.maxOutputTokens,
      inferenceAllowed: permissions !== "read-only",
    });
  }
  if (name === "inference_run") {
    if (permissions === "read-only")
      return error("Grant gateway:access through Phaseo OAuth before running.");
    const quote = fixtureQuotes.get(String(args.quoteToken));
    fixtureQuotes.delete(String(args.quoteToken));
    if (!quote || quote.prompt !== args.prompt)
      return error("Invalid or already-submitted fixture quote.");
    return ok({
      results: quote.plans.map((plan) => ({
        ...plan,
        text: `${plan.modelName} fixture output for: ${quote.prompt}`,
        requestId: `fixture-${plan.modelId}`,
        latencyMs: 450,
        inputTokens: 20,
        outputTokens: 40,
        finishReason: "stop",
        error: null,
      })),
    });
  }
  if (args.query === "error")
    return {
      isError: true,
      content: [
        { type: "text", text: "Fixture search error. Try another query." },
      ],
    };
  let data: Record<string, unknown>;
  if (name === "models_list") {
    data = {
      models: models.filter(
        (model) =>
          `${model.name} ${model.description}`
            .toLowerCase()
            .includes(String(args.query ?? "").toLowerCase()) &&
          (!args.modality ||
            model.inputModalities.includes(String(args.modality))) &&
          (!args.gatewayAvailableOnly || model.gatewayAvailable) &&
          (!args.provider ||
            `${model.provider} ${model.availableProviders.join(" ")}`
              .toLowerCase()
              .includes(String(args.provider).toLowerCase())),
      ),
    };
  } else {
    const model = models.find((model) => model.id === args.modelId);
    if (!model)
      return {
        isError: true,
        content: [{ type: "text", text: "Fixture model not found." }],
      };
    if (name === "model_get") data = { model };
    else if (
      name === "cost_estimate" &&
      ((model.inputPricePerToken !== null &&
        model.outputPricePerToken !== null) ||
        model.hasFreeProvider)
    )
      data = {
        estimate: {
          providerId: model.availableProviders[0],
          totalCostUSD:
            Number(model.inputPricePerToken) * Number(args.inputTokens) +
            Number(model.outputPricePerToken) * Number(args.outputTokens),
        },
      };
    else
      return {
        isError: true,
        content: [{ type: "text", text: "Fixture estimate unavailable." }],
      };
  }
  return {
    content: [{ type: "text", text: "Preview fixture result" }],
    structuredContent: data,
  };
};
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: {} });
  await bridge.sendToolResult({
    content: [{ type: "text", text: "Preview fixtures" }],
    structuredContent: { models },
  });
};
bridge.onupdatemodelcontext = async ({ structuredContent }) => {
  document.querySelector("#context")!.textContent =
    `Attached context: ${JSON.stringify(structuredContent)}`;
  return {};
};
const previewPath = new URLSearchParams(location.search).get("path");
if (previewPath)
  bridge.setHostContext({
    theme: "light",
    "openai/deepLink": { url: previewPath },
  });
let dark = false;
document.querySelector("#theme")!.addEventListener("click", () => {
  dark = !dark;
  bridge.setHostContext({ theme: dark ? "dark" : "light" });
});
const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
await bridge.connect(
  new PostMessageTransport(frame.contentWindow!, frame.contentWindow!),
);
frame.src = "/explorer";
