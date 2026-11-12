import type { ModelCard } from "@/lib/api/models";
import { contextWindow, isChatModel, isFree, isRetired, modelName, organisationName } from "@/lib/catalogue";
import type { ChatRoute, GatewayChatModel } from "./gatewayModels";

/**
 * The chat model picker's logic, ported from apps/web/src/components/(chat)/RoomModelSelector.tsx and
 * playgroundConfig.ts: ranked search, favourites first, then models by release month (newest first),
 * then "Coming soon" by month.
 */
export type ChatModelOption = {
  modelId: string;
  label: string;
  orgId: string;
  orgName: string;
  releaseDate: string | null;
  status: "active" | "deprecated" | "coming_soon";
  free: boolean;
  inputPrice: number | null;
  outputPrice: number | null;
  contextWindow: number | null;
  inputModalities: string[];
  providerIds: string[];
  providerNames: string[];
  routes: ChatRoute[];
};

export const isSelectable = (option: Pick<ChatModelOption, "status">) => option.status !== "coming_soon";

const minimum = (values: (number | null)[]) => {
  const present = values.filter((value): value is number => value != null);
  return present.length ? Math.min(...present) : null;
};

/**
 * Chat models from the catalogue (which knows prices, context, free routers such as phaseo/free and
 * coming-soon models) joined with the gateway feed (which knows each model's providers and limits).
 * Like the website, deprecated models stay pickable while the gateway still serves them.
 */
export function buildChatModelOptions(catalogue: ModelCard[], gateway: GatewayChatModel[]): ChatModelOption[] {
  const cards = new Map(catalogue.map((card) => [card.model_id, card]));
  const routed = new Map(gateway.map((model) => [model.modelId, model]));
  const ids = new Set<string>([...routed.keys(), ...catalogue.filter(isChatModel).map((card) => card.model_id)]);
  const options: ChatModelOption[] = [];
  const option = (modelId: string, card: ModelCard | undefined, model: GatewayChatModel | undefined, status: ChatModelOption["status"]): ChatModelOption => {
    const routes = model?.routes ?? [];
    const orgId = card?.organisation_id ?? model?.orgId ?? modelId.split("/")[0] ?? "phaseo";
    const inputPrice = card?.lowest_input_price ?? minimum(routes.map((route) => route.inputPrice));
    const outputPrice = card?.lowest_output_price ?? minimum(routes.map((route) => route.outputPrice));
    return {
      modelId,
      label: card ? modelName(card) : model?.label || modelId.split("/").slice(1).join("/") || modelId,
      orgId,
      orgName: card ? organisationName(card) : model?.orgName ?? orgId.replace(/-/g, " "),
      releaseDate: model?.releaseDate ?? card?.primary_date ?? null,
      status,
      free: card ? isFree(card) : modelId.endsWith(":free") || (inputPrice === 0 && outputPrice === 0),
      inputPrice,
      outputPrice,
      contextWindow: card ? contextWindow(card) || null : null,
      inputModalities: card?.gateway_input_modalities.length ? card.gateway_input_modalities : model?.inputModalities ?? ["text"],
      providerIds: routes.map((route) => route.providerId),
      providerNames: routes.map((route) => route.providerName),
      routes,
    };
  };
  for (const modelId of ids) {
    const card = cards.get(modelId);
    if (card && isRetired(card)) continue;
    options.push(option(modelId, card, routed.get(modelId), card?.gateway_status === "deprecated" ? "deprecated" : "active"));
  }
  // Text models announced for Phaseo but not served yet: shown greyed out, as on the website.
  for (const card of catalogue) {
    if (card.gateway_status !== "coming_soon" || ids.has(card.model_id)) continue;
    if (!card.gateway_output_modalities.includes("text") || !card.gateway_input_modalities.includes("text")) continue;
    options.push(option(card.model_id, card, undefined, "coming_soon"));
  }
  return options;
}

// ---- Ordering ---------------------------------------------------------------

function releaseMs(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Newest release first, then by name, then by ID (compareByReleaseDateDesc). Undated models go last. */
export function compareByReleaseDateDesc<T extends { releaseDate: string | null; label: string; modelId: string }>(a: T, b: T) {
  const left = releaseMs(a.releaseDate);
  const right = releaseMs(b.releaseDate);
  if (left !== right) return right > left ? 1 : -1;
  return a.label.localeCompare(b.label) || a.modelId.localeCompare(b.modelId);
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "October 2026", in UTC like the website, so a release at midnight doesn't slip a month. */
export const formatReleaseMonth = (date: Date) => monthFormat.format(date);

/** groupModelsByReleaseMonth: consecutive runs keep the input's order; undated models fall under "Unknown". */
export function groupByReleaseMonth<T extends { releaseDate: string | null }>(items: T[], formatMonth: (date: Date) => string = formatReleaseMonth) {
  const groups: { heading: string; items: T[] }[] = [];
  const byHeading = new Map<string, T[]>();
  for (const item of items) {
    const date = item.releaseDate ? new Date(item.releaseDate) : null;
    const heading = date && Number.isFinite(date.getTime()) ? formatMonth(date) : "Unknown";
    const existing = byHeading.get(heading);
    if (existing) existing.push(item);
    else {
      const list = [item];
      byHeading.set(heading, list);
      groups.push({ heading, items: list });
    }
  }
  return groups;
}

const NEW_MODEL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Released in the last 14 days (the website's New badge and filter). */
export function isNewModel(releaseDate: string | null, nowMs: number) {
  const released = releaseMs(releaseDate);
  return Number.isFinite(released) && released >= nowMs - NEW_MODEL_WINDOW_MS && released <= nowMs;
}

// ---- Favourites -------------------------------------------------------------

/** The website's default favourites (FEATURED_MODEL_IDS), used until the user stars their own. */
export const FEATURED_MODEL_IDS = [
  "z-ai/glm-5.3",
  "moonshotai/kimi-k3",
  "anthropic/claude-fable-5.1",
  "minimax/minimax-m3",
  "anthropic/claude-opus-5",
  "spacex-ai/grok-4.6",
  "openai/gpt-6-astra",
  "google/gemini-3.8-flash",
];

/** normalizeFavoriteModelId: lower case, dated snapshots folded into their model, punctuation as hyphens. */
export function normaliseFavouriteId(modelId: string) {
  return modelId
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .toLowerCase()
    .replace(/[._]+/g, "-")
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-\//g, "/")
    .replace(/\/-/g, "/")
    .replace(/^\/|\/$/g, "")
    .replace(/^-+|-+$/g, "");
}

/** The default favourites the catalogue still has. */
export function defaultFavourites(options: Pick<ChatModelOption, "modelId">[]) {
  const available = new Set(options.map((option) => normaliseFavouriteId(option.modelId)));
  return [...new Set(FEATURED_MODEL_IDS.map(normaliseFavouriteId))].filter((id) => available.has(id));
}

/** Stars or unstars a model; a newly starred model goes to the end, as on the website. */
export function toggleFavourite(favourites: string[], modelId: string) {
  const id = normaliseFavouriteId(modelId);
  return favourites.includes(id) ? favourites.filter((entry) => entry !== id) : [...favourites, id];
}

// ---- Search -----------------------------------------------------------------

/** computeOptionSearchScore from RoomModelSelector: whole-query matches on ID and name count most, then lab and provider, then each word. */
export function searchScore(option: Pick<ChatModelOption, "modelId" | "label" | "orgName" | "orgId" | "providerIds" | "providerNames" | "status">, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const modelId = option.modelId.toLowerCase();
  const label = option.label.toLowerCase();
  const orgName = option.orgName.toLowerCase();
  const orgId = option.orgId.toLowerCase();
  const providerIds = option.providerIds.map((id) => id.toLowerCase());
  const providerNames = option.providerNames.map((name) => name.toLowerCase());
  const terms = normalized.split(/\s+/).filter(Boolean);
  let score = 0;
  if (modelId === normalized) score += 2200;
  if (label === normalized) score += 2000;
  if (modelId.startsWith(normalized)) score += 1400;
  if (label.startsWith(normalized)) score += 1300;
  if (orgName.startsWith(normalized) || orgId.startsWith(normalized)) score += 920;
  if (providerNames.some((name) => name.startsWith(normalized))) score += 900;
  if (providerIds.some((id) => id.startsWith(normalized))) score += 880;
  if (modelId.includes(normalized)) score += 760;
  if (label.includes(normalized)) score += 700;
  if (orgName.includes(normalized) || orgId.includes(normalized)) score += 520;
  if (providerNames.some((name) => name.includes(normalized)) || providerIds.some((id) => id.includes(normalized))) score += 460;
  for (const term of terms) {
    if (modelId.startsWith(term)) score += 220;
    if (label.startsWith(term)) score += 190;
    if (modelId.includes(term)) score += 130;
    if (label.includes(term)) score += 120;
    if (orgName.includes(term) || orgId.includes(term)) score += 100;
    if (providerNames.some((name) => name.includes(term)) || providerIds.some((id) => id.includes(term))) score += 90;
  }
  // The website adds this to every active model, so a search with no match still lists them all;
  // here it only breaks ties between models that matched.
  if (score > 0 && option.status !== "coming_soon") score += 10;
  return score;
}

/** Matches, best first; ties go to models you can use now, then the newest. */
export function rankModels(options: ChatModelOption[], query: string) {
  if (!query.trim()) return [];
  return options
    .map((option) => ({ option, score: searchScore(option, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(isSelectable(b.option)) - Number(isSelectable(a.option)) || compareByReleaseDateDesc(a.option, b.option))
    .map((entry) => entry.option);
}

// ---- Sections ---------------------------------------------------------------

export type PickerFilters = { free: boolean; new: boolean };

export type PickerSection = { key: string; title: string; kind: "results" | "favourites" | "month" | "coming-soon"; items: ChatModelOption[] };

/**
 * What the picker lists. Searching shows one ranked list. Otherwise: favourites in the order they were
 * starred, then the remaining models by release month, then coming-soon models by month.
 */
export function pickerSections(args: { options: ChatModelOption[]; query: string; favourites: string[]; filters: PickerFilters; nowMs: number; formatMonth?: (date: Date) => string }): PickerSection[] {
  const { filters, nowMs } = args;
  const visible = args.options.filter((option) => (!filters.free || option.free) && (!filters.new || isNewModel(option.releaseDate, nowMs)));
  if (args.query.trim()) {
    const results = rankModels(visible, args.query);
    return [{ key: "results", title: `Results: ${results.length}`, kind: "results", items: results }];
  }
  const active = visible.filter(isSelectable).sort(compareByReleaseDateDesc);
  const comingSoon = visible.filter((option) => !isSelectable(option)).sort(compareByReleaseDateDesc);
  const favouriteSet = new Set(args.favourites);
  const byFavouriteId = new Map(active.map((option) => [normaliseFavouriteId(option.modelId), option]));
  const favourites = args.favourites.map((id) => byFavouriteId.get(id)).filter((option): option is ChatModelOption => Boolean(option));
  const sections: PickerSection[] = [];
  if (favourites.length) sections.push({ key: "favourites", title: "Favourites", kind: "favourites", items: favourites });
  for (const group of groupByReleaseMonth(active.filter((option) => !favouriteSet.has(normaliseFavouriteId(option.modelId))), args.formatMonth)) {
    sections.push({ key: `month:${group.heading}`, title: group.heading, kind: "month", items: group.items });
  }
  for (const group of groupByReleaseMonth(comingSoon, args.formatMonth)) {
    sections.push({ key: `soon:${group.heading}`, title: group.heading === "Unknown" ? "Coming soon" : `Coming soon · ${group.heading}`, kind: "coming-soon", items: group.items });
  }
  return sections;
}
