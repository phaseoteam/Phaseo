import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getCatalogue, type ModelCard } from "@/lib/api/models";
import { MAX_COMPARE } from "@/lib/api/compare";
import { DEFAULT_FILTERS, type CatalogueFilters } from "@/lib/catalogue";
import { createStore } from "@/lib/store";

export const filtersStore = createStore<CatalogueFilters>(DEFAULT_FILTERS);

export function updateFilters(patch: Partial<CatalogueFilters>) {
  filtersStore.set((current) => ({ ...current, ...patch }));
}

export function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/** Models picked for comparison, in the order they were added. */
export const compareStore = createStore<string[]>([]);

export function toggleCompare(id: string) {
  compareStore.set((current) => current.includes(id) ? current.filter((entry) => entry !== id) : current.length >= MAX_COMPARE ? current : [...current, id]);
}

export function useCatalogue() {
  return useQuery({ queryKey: ["public", "catalogue"], queryFn: getCatalogue, staleTime: 30 * 60 * 1000 });
}

/** Catalogue cards by ID, for screens that start from an ID (detail, compare, chat picker). */
export function useCatalogueIndex() {
  const catalogue = useCatalogue();
  const index = useMemo(() => new Map<string, ModelCard>((catalogue.data?.models ?? []).map((model) => [model.model_id, model])), [catalogue.data]);
  return { ...catalogue, index };
}
