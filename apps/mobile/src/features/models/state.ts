import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getCatalogue, type ModelCard } from "@/lib/api/models";
import { MAX_COMPARE } from "@/lib/api/compare";
import { DEFAULT_FILTERS, organisationName, type CatalogueFilters } from "@/lib/catalogue";
import { createStore } from "@/lib/store";

export const filtersStore = createStore<CatalogueFilters>(DEFAULT_FILTERS);

export function updateFilters(patch: Partial<CatalogueFilters>) {
  filtersStore.set((current) => ({ ...current, ...patch }));
}

export function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/** Bumped by Home's search box: the Models search field focuses when this changes. */
export const searchFocusStore = createStore(0);

/** Models picked for comparison, in the order they were added. */
export const compareStore = createStore<string[]>([]);

export function toggleCompare(id: string) {
  compareStore.set((current) => current.includes(id) ? current.filter((entry) => entry !== id) : current.length >= MAX_COMPARE ? current : [...current, id]);
}

/** Also read outside React, e.g. when a notification opens a lab's models. */
export const catalogueQuery = queryOptions({ queryKey: ["public", "catalogue"], queryFn: getCatalogue, staleTime: 30 * 60 * 1000 });

export function useCatalogue() {
  return useQuery(catalogueQuery);
}

/** Lab IDs by display name. The Labs filter works on names (as the web does); logos need the ID. */
export function useLabIds() {
  const catalogue = useCatalogue();
  return useMemo(() => {
    const ids = new Map<string, string>();
    for (const model of catalogue.data?.models ?? []) {
      const name = organisationName(model);
      if (model.organisation_id && !ids.has(name)) ids.set(name, model.organisation_id);
    }
    return ids;
  }, [catalogue.data]);
}

/** Catalogue cards by ID, for screens that start from an ID (detail, compare, chat picker). */
export function useCatalogueIndex() {
  const catalogue = useCatalogue();
  const index = useMemo(() => new Map<string, ModelCard>((catalogue.data?.models ?? []).map((model) => [model.model_id, model])), [catalogue.data]);
  return { ...catalogue, index };
}
