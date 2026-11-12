// Development-only fixture host. This file is never bundled into the MCP resource.
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type { CardModel } from "./model";

const logo = (id: string) => ({
  light: `https://phaseo.app/logos/${id}_light.svg`,
  dark: `https://phaseo.app/logos/${id}_dark.svg`,
});
const support = (
  entries: Array<[string, string, "active" | "coming_soon" | "inactive"]>,
) => entries.map(([providerId, providerName, status]) => ({ providerId, providerName, status }));
// Fixture data shaped like real catalogue entries, so the preview looks like the host.
const models: CardModel[] = [
  {
    id: "example/atlas",
    gatewayAvailable: true,
    supportedEndpoints: ["chat.completions"],
    name: "Atlas 2 Pro",
    provider: "Google",
    description: "A fixture model for testing model details and comparisons.",
    releaseDate: "2026-11-11",
    lifecycleStatus: "active",
    contextTokens: 1048576,
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    inputPricePerToken: "0.000002",
    outputPricePerToken: "0.00001",
    supportsTools: true,
    availableProviders: ["Google AI Studio", "Vertex AI"],
    inputPriceProviderId: "google-ai-studio",
    providerSupport: support([
      ["google-ai-studio", "Google AI Studio", "active"],
      ["vertex", "Vertex AI", "active"],
    ]),
    logo: { light: "https://phaseo.app/logos/google.svg", dark: "https://phaseo.app/logos/google.svg" },
  },
  {
    id: "example/spark",
    gatewayAvailable: true,
    supportedEndpoints: ["chat.completions"],
    name: "Spark Mini",
    provider: "OpenAI",
    description: "A smaller fixture model with lower listed token costs.",
    releaseDate: "2026-11-04",
    lifecycleStatus: "active",
    contextTokens: 400000,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    inputPricePerToken: "0.00000015",
    outputPricePerToken: "0.0000006",
    supportsTools: true,
    availableProviders: ["OpenAI", "Azure"],
    providerSupport: support([
      ["openai", "OpenAI", "active"],
      ["azure", "Azure", "active"],
      ["bedrock", "Bedrock", "coming_soon"],
    ]),
    logo: logo("openai"),
  },
  {
    id: "example/canvas",
    name: "Canvas Image",
    provider: "MiniMax",
    description: "An image fixture with no token pricing listed.",
    releaseDate: "2026-10-28",
    contextTokens: null,
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    inputPricePerToken: null,
    outputPricePerToken: null,
    supportsTools: false,
    availableProviders: [],
    providerSupport: support([["minimax", "MiniMax", "coming_soon"]]),
    logo: { light: "https://phaseo.app/logos/minimax.svg", dark: "https://phaseo.app/logos/minimax.svg" },
  },
  {
    id: "example/zero",
    name: "Zero Legacy",
    provider: "Anthropic",
    description: "A fixture with a free offer and no paid pricing.",
    releaseDate: "2025-02-24",
    lifecycleStatus: "deprecated",
    contextTokens: 200000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    inputPricePerToken: null,
    outputPricePerToken: null,
    hasFreeProvider: true,
    supportsTools: false,
    availableProviders: ["Anthropic"],
    logo: logo("anthropic"),
  },
];
// Claude's published style variables (claude.com/docs/connectors/building/mcp-apps/design-guidelines),
// applied with ?host=claude to see the explorer the way Claude themes it.
const claudeVariables = (dark: boolean) => ({
  "--color-background-primary": dark ? "#30302E" : "#FFFFFF",
  "--color-background-secondary": dark ? "#262624" : "#F5F4ED",
  "--color-text-primary": dark ? "#FAF9F5" : "#141413",
  "--color-text-secondary": dark ? "#C2C0B6" : "#3D3D3A",
  "--color-text-tertiary": dark ? "#9C9A92" : "#73726C",
  "--color-text-danger": dark ? "#EE8884" : "#7F2C28",
  "--color-background-danger": dark ? "#602A28" : "#F7ECEC",
  "--color-border-primary": dark ? "rgb(222 220 209 / 40%)" : "rgb(31 30 29 / 40%)",
  "--color-border-secondary": dark ? "rgb(222 220 209 / 30%)" : "rgb(31 30 29 / 30%)",
  "--color-border-tertiary": dark ? "rgb(222 220 209 / 15%)" : "rgb(31 30 29 / 15%)",
  "--font-sans": '"Anthropic Sans", ui-sans-serif, system-ui, sans-serif',
  "--border-radius-md": "8px",
  "--border-radius-sm": "6px",
});
const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
document.body.dataset.mode = "inline";
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
// ?mode=fullscreen starts in the explorer; the default is an inline card, like a
// tool result in the host. ?card=estimate or ?card=credits picks the result shown.
// ?loading=1 never sends the result, to show the loading card; ?insets=24 reports
// that many pixels of safe area on every edge, as a mobile host does. ?host=claude
// applies Claude's published style variables.
const params = new URLSearchParams(location.search);
const startMode = params.get("mode") === "fullscreen" ? "fullscreen" : "inline";
const previewTool =
  { estimate: "cost_estimate", credits: "credits_get" }[params.get("card") ?? ""] ??
  "models_list";
const inset = Number(params.get("insets") ?? 0);
const darkTheme = params.get("theme") === "dark";
document.body.dataset.mode = startMode;
// ?width=360 narrows the frame, like Claude's side panel at its smallest.
const frameWidth = Number(params.get("width") ?? 0);
if (frameWidth) {
  frame.style.width = `${frameWidth}px`;
  frame.style.maxWidth = "none";
  frame.style.margin = "0 auto";
  frame.style.display = "block";
}
bridge.setHostContext({
  theme: darkTheme ? "dark" : "light",
  ...(params.get("host") === "claude"
    ? { styles: { variables: claudeVariables(darkTheme) as never } }
    : {}),
  displayMode: startMode,
  availableDisplayModes: ["inline", "fullscreen"],
  toolInfo: { tool: { name: previewTool, inputSchema: { type: "object" } } },
  ...(inset ? { safeAreaInsets: { top: inset, right: inset, bottom: inset, left: inset } } : {}),
});
bridge.onrequestdisplaymode = async ({ mode }) => {
  bridge.setHostContext({ displayMode: mode });
  document.body.dataset.mode = mode;
  if (mode === "fullscreen") frame.style.height = "";
  return { mode };
};
bridge.onsizechange = ({ height }) => {
  if (height && document.body.dataset.mode !== "fullscreen")
    frame.style.height = height + "px";
};
bridge.onopenlink = async ({ url }) => {
  document.querySelector("#context")!.textContent = `Opened link: ${url}`;
  return {};
};
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
const cardResults: Record<string, Record<string, unknown>> = {
  estimate: {
    estimate: {
      modelId: "example/spark",
      modelName: "Spark",
      providerId: "example-cloud",
      providerName: "Example Cloud",
      isFree: false,
      inputTokens: 2_000_000,
      cachedInputTokens: 0,
      outputTokens: 500_000,
      inputCostUSD: 0.3,
      cachedInputCostUSD: 0,
      outputCostUSD: 0.3,
      totalCostUSD: 0.6,
    },
  },
  credits: {
    credits: {
      balanceNanos: 5_000_000_000,
      reservedNanos: 0,
      availableNanos: 5_000_000_000,
      thirtyDayUsageNanos: 0,
      thirtyDayRequests: 7,
    },
  },
};
bridge.oninitialized = async () => {
  if (startMode === "fullscreen" && params.get("entry") === "panel") return;
  await bridge.sendToolInput({ arguments: {} });
  if (params.get("loading")) return;
  await bridge.sendToolResult({
    content: [{ type: "text", text: "Preview fixtures" }],
    structuredContent: cardResults[params.get("card") ?? ""] ?? { models },
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
await bridge.connect(
  new PostMessageTransport(frame.contentWindow!, frame.contentWindow!),
);
frame.src = "/explorer";
// ?click=compare or ?click=explorer presses that card button after loading.
const click = params.get("click");
if (click)
  frame.addEventListener("load", () =>
    setTimeout(() => {
      const label = click === "compare" ? "Compare these" : "Open explorer";
      [...frame.contentDocument!.querySelectorAll("button")]
        .find((button) => button.textContent === label)
        ?.click();
      // &roundtrip=1 returns to inline and back, to check the explorer keeps its state.
      if (params.get("roundtrip"))
        setTimeout(() => {
          bridge.setHostContext({ displayMode: "inline" });
          setTimeout(() => {
            bridge.setHostContext({ displayMode: "fullscreen" });
            frame.style.height = "";
          }, 1000);
        }, 1000);
    }, 1500),
  );
