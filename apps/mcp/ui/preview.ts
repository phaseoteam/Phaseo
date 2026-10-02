// Development-only fixture host. This file is never bundled into the MCP resource.
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type { Model } from "./model";

const models: Model[] = [
  {
    id: "example/atlas",
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
bridge.setHostContext({
  theme: "light",
  displayMode: "fullscreen",
  availableDisplayModes: ["fullscreen"],
});
bridge.oncalltool = async ({ name, arguments: args = {} }) => {
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
