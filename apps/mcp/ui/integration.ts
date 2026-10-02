import type { Model } from "./model";

const pluginId = "plugins_6abf761963448191af2bd92c7d9c43b5";

export function modelLink(ids: string[]): string {
  const path = `/models?${new URLSearchParams({ ids: ids.join(",") })}`;
  return `https://chatgpt.com/plugins/${pluginId}/app/models_list?path=${encodeURIComponent(path)}`;
}

export function linkedModels(path: string): string[] {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("#"))
    throw new Error("Invalid Phaseo model link.");
  const url = new URL(path, "https://phaseo.app");
  if (url.pathname !== "/models" && url.pathname !== "/")
    throw new Error("Unknown Phaseo page.");
  const ids = [
    ...new Set((url.searchParams.get("ids") ?? "").split(",").filter(Boolean)),
  ];
  if (ids.length > 3 || ids.some((id) => id.length > 200))
    throw new Error("A model link supports up to three models.");
  return ids;
}

export function modelContext(models: Model[]) {
  const snapshots = models.map(
    ({
      id,
      name,
      provider,
      contextTokens,
      inputModalities,
      outputModalities,
      inputPricePerToken,
      outputPricePerToken,
      inputPriceProviderId,
      outputPriceProviderId,
      hasFreeProvider,
      supportsTools,
      availableProviders,
    }) => ({
      id,
      name,
      provider,
      contextTokens,
      inputModalities,
      outputModalities,
      inputPricePerToken,
      outputPricePerToken,
      inputPriceProviderId,
      outputPriceProviderId,
      hasFreeProvider,
      supportsTools,
      availableProviders,
    }),
  );
  return {
    content: [
      {
        type: "text" as const,
        text:
          "Models selected in Phaseo. Catalogue data is a snapshot; refresh with model_get before making current pricing claims. Listed paid input and output rates may come from different providers. Selection does not change the conversation's model or run inference.\n" +
          JSON.stringify(snapshots),
      },
    ],
    structuredContent: { models: snapshots },
  };
}
