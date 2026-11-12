import type { ModelCard } from "./api/models";

export type CatalogueSort = "newest" | "popular" | "price" | "context" | "name";
export type Availability = "all" | "phaseo" | "free";

export type CatalogueFilters = {
  query: string;
  organisations: string[];
  inputModalities: string[];
  outputModalities: string[];
  availability: Availability;
  includeRetired: boolean;
  sort: CatalogueSort;
};

export const DEFAULT_FILTERS: CatalogueFilters = {
  query: "",
  organisations: [],
  inputModalities: [],
  outputModalities: [],
  availability: "all",
  includeRetired: false,
  sort: "newest",
};

export const modelName = (model: Pick<ModelCard, "name" | "model_id">) => model.name?.trim() || model.model_id.split("/").at(-1) || model.model_id;
export const organisationName = (model: Pick<ModelCard, "organisation_name" | "organisation_id" | "model_id">) => model.organisation_name ?? model.organisation_id ?? model.model_id.split("/")[0] ?? "";

export function isOnPhaseo(model: ModelCard) {
  return model.gateway_status === "active";
}

/** Models Phaseo can run for text chat (routers list chat/completions rather than text.generate). */
export function isChatModel(model: ModelCard) {
  return isOnPhaseo(model) && model.gateway_endpoints.some((endpoint) => endpoint === "text.generate" || endpoint === "chat/completions");
}

export function isFree(model: ModelCard) {
  return model.model_id.endsWith(":free") || (isOnPhaseo(model) && model.lowest_input_price === 0 && model.lowest_output_price === 0);
}

export function isRetired(model: ModelCard) {
  return model.gateway_status === "retired" || model.status?.toLowerCase() === "retired";
}

export function contextWindow(model: ModelCard) {
  return Math.max(0, ...(model.context_lengths ?? []));
}

const normalise = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const compactForm = (value: string) => normalise(value).replace(/[^a-z0-9]/g, "");

/**
 * Ranks a model against a search: every term must match the name, ID or organisation.
 * Exact and prefix matches on the name or ID score highest, so "gpt-5" finds GPT-5 before GPT-5 mini.
 */
export function searchScore(model: ModelCard, query: string): number {
  const terms = normalise(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const name = normalise(modelName(model));
  const id = normalise(model.model_id);
  const slug = id.split("/").at(-1) ?? id;
  const org = normalise(organisationName(model));
  const haystack = `${name} ${id} ${org}`;
  const compactHaystack = compactForm(haystack);
  let score = 0;
  for (const term of terms) {
    const compactTerm = compactForm(term);
    if (name === term || slug === term) score += 100;
    else if (name.startsWith(term) || slug.startsWith(term)) score += 60;
    else if (name.split(/[\s\-_.]+/).some((word) => word.startsWith(term))) score += 40;
    else if (org.startsWith(term)) score += 25;
    else if (haystack.includes(term)) score += 15;
    else if (compactTerm && compactHaystack.includes(compactTerm)) score += 10;
    else return 0;
  }
  // Prefer shorter names among equal matches (the base model over its variants).
  return score - Math.min(name.length, 60) / 100;
}

function sortValue(model: ModelCard, sort: CatalogueSort): number | string {
  switch (sort) {
    case "newest": return -(model.primary_timestamp ?? 0);
    case "popular": return -(model.popularity_tokens_week ?? 0);
    case "price": return model.lowest_input_price ?? Number.POSITIVE_INFINITY;
    case "context": return -contextWindow(model);
    case "name": return modelName(model).toLocaleLowerCase();
  }
}

export function filterModels(models: ModelCard[], filters: CatalogueFilters): ModelCard[] {
  const organisations = new Set(filters.organisations);
  const scored: { model: ModelCard; score: number }[] = [];
  for (const model of models) {
    if (!filters.includeRetired && isRetired(model)) continue;
    if (organisations.size && !organisations.has(organisationName(model))) continue;
    if (filters.availability === "phaseo" && !isOnPhaseo(model)) continue;
    if (filters.availability === "free" && !isFree(model)) continue;
    if (filters.inputModalities.length && !filters.inputModalities.every((value) => model.gateway_input_modalities.includes(value))) continue;
    if (filters.outputModalities.length && !filters.outputModalities.every((value) => model.gateway_output_modalities.includes(value))) continue;
    const score = searchScore(model, filters.query);
    if (score <= 0) continue;
    scored.push({ model, score });
  }
  const searching = filters.query.trim().length > 0;
  return scored
    .sort((left, right) => {
      if (searching && right.score !== left.score) return right.score - left.score;
      const a = sortValue(left.model, filters.sort);
      const b = sortValue(right.model, filters.sort);
      if (a < b) return -1;
      if (a > b) return 1;
      return left.model.model_id.localeCompare(right.model.model_id);
    })
    .map((entry) => entry.model);
}

export function activeFilterCount(filters: CatalogueFilters) {
  return filters.organisations.length
    + filters.inputModalities.length
    + filters.outputModalities.length
    + (filters.availability === "all" ? 0 : 1)
    + (filters.includeRetired ? 1 : 0);
}
