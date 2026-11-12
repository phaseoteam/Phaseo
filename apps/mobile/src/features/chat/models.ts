import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useCatalogue } from "@/features/models/state";
import { getGatewayChatModels } from "@/lib/api/chatModels";
import type { Catalogue } from "@/lib/api/models";
import { queryClient } from "@/providers/QueryProvider";
import { modelReasoningSupport, modelServiceTierSupport } from "./capabilities";
import { contextTokensFrom } from "./compaction";
import type { GatewayChatModel } from "./gatewayModels";
import { buildChatModelOptions, type ChatModelOption } from "./modelOptions";
import type { ModelSettings, RequestCapabilities } from "./settings";

/** "public" keys survive restarts (QueryProvider), so the picker and settings work offline after one load. */
export const CHAT_MODELS_KEY = ["public", "chat-models"] as const;
const STALE_MS = 30 * 60 * 1000;

export function useGatewayChatModels() {
  return useQuery({ queryKey: CHAT_MODELS_KEY, queryFn: getGatewayChatModels, staleTime: STALE_MS });
}

// Chips, composer buttons and chat-list rows all read the options, so they're built once per data change, not per component.
let built: { catalogue: unknown; gateway: unknown; options: ChatModelOption[]; byId: Map<string, ChatModelOption> } | null = null;
const EMPTY: never[] = [];

function sharedOptions(catalogue: Parameters<typeof buildChatModelOptions>[0] | undefined, gateway: GatewayChatModel[] | undefined) {
  if (built && built.catalogue === catalogue && built.gateway === gateway) return built;
  const options = buildChatModelOptions(catalogue ?? EMPTY, gateway ?? EMPTY);
  built = { catalogue, gateway, options, byId: new Map(options.map((option) => [option.modelId, option])) };
  return built;
}

/** Every model chat can offer, with its providers and limits; `byId` finds one for a chip or a settings form. */
export function useChatModelOptions() {
  const catalogue = useCatalogue();
  const gateway = useGatewayChatModels();
  const { options, byId } = useMemo(() => sharedOptions(catalogue.data?.models, gateway.data), [catalogue.data, gateway.data]);
  const refetch = useCallback(() => { void catalogue.refetch(); void gateway.refetch(); }, [catalogue, gateway]);
  return {
    options,
    byId,
    isLoading: catalogue.isLoading || (gateway.isLoading && !gateway.data),
    error: catalogue.error ?? (gateway.data ? null : gateway.error),
    refetch,
  };
}

/** A model's name, lab and logo for chips and labels, with a display name from its settings when set. */
export function useModelLabels() {
  const { byId } = useChatModelOptions();
  return useCallback((modelId: string | null, settings?: ModelSettings): { label: string; orgId: string; orgName: string; option: ChatModelOption | null } => {
    const option = modelId ? byId.get(modelId) ?? null : null;
    const fallback = modelId?.split("/").at(-1) ?? "Model";
    return { label: settings?.displayName?.trim() || option?.label || fallback, orgId: option?.orgId ?? modelId?.split("/")[0] ?? "phaseo", orgName: option?.orgName ?? "", option };
  }, [byId]);
}

const needsRoutes = (settings?: ModelSettings) => Boolean(settings && ((settings.providerId && settings.providerId !== "auto") || (settings.serviceTier && settings.serviceTier !== "standard") || settings.reasoningEnabled));

/**
 * What a request for this model may use, from the gateway feed: its active providers, and the efforts
 * and tiers the chosen provider (or every provider, on Auto) accepts. Unknown models get no limits.
 */
export async function requestCapabilities(modelId: string, settings?: ModelSettings): Promise<RequestCapabilities> {
  let models = queryClient.getQueryData<GatewayChatModel[]>(CHAT_MODELS_KEY);
  if (!models && needsRoutes(settings)) {
    models = await queryClient.ensureQueryData({ queryKey: CHAT_MODELS_KEY, queryFn: getGatewayChatModels, staleTime: STALE_MS }).catch(() => undefined);
  }
  const model = models?.find((entry) => entry.modelId === modelId);
  if (!model) return {};
  return {
    providerIds: model.routes.map((route) => route.providerId),
    reasoning: modelReasoningSupport(model.routes, settings?.providerId),
    serviceTiers: modelServiceTierSupport(model.routes, settings?.providerId),
  };
}

const cachedCatalogue = () => queryClient.getQueryData<Catalogue>(["public", "catalogue"]);

/** A model's context window from the catalogue already on the device (the smallest of its providers'), or 128k. */
export function contextTokensFor(modelId: string) {
  return contextTokensFrom(cachedCatalogue()?.models.find((card) => card.model_id === modelId)?.context_lengths);
}

/** A model's name outside React (for notices), with its display name from settings when set. */
export function modelLabelFor(modelId: string, settings?: ModelSettings) {
  const option = sharedOptions(cachedCatalogue()?.models, queryClient.getQueryData<GatewayChatModel[]>(CHAT_MODELS_KEY)).byId.get(modelId);
  return settings?.displayName?.trim() || option?.label || modelId.split("/").at(-1) || "this model";
}
