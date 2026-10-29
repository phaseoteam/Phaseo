import { useMemo } from "react";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";
import { defaultFavourites, normaliseFavouriteId, toggleFavourite, type ChatModelOption } from "./modelOptions";

const KEY = "phaseo.chat.favourite-models";

/**
 * Starred chat models, in the order they were starred, kept on this device. Null until the user stars
 * or unstars something; until then the website's default favourites show.
 */
export const favouritesStore = createStore<string[] | null>(null);

void kv.getItem(KEY).then((value) => {
  try {
    const saved = JSON.parse(value ?? "null") as unknown;
    if (Array.isArray(saved) && favouritesStore.get() === null) favouritesStore.set([...new Set(saved.filter((entry): entry is string => typeof entry === "string").map(normaliseFavouriteId))]);
  } catch { /* keep the defaults */ }
});

favouritesStore.subscribe(() => {
  const value = favouritesStore.get();
  if (value) void kv.setItem(KEY, JSON.stringify(value));
});

/** The favourites to show: the user's own, or the defaults that exist in the catalogue. */
export function useFavourites(options: ChatModelOption[]) {
  const stored = favouritesStore.use();
  return useMemo(() => stored ?? defaultFavourites(options), [stored, options]);
}

export function toggleFavouriteModel(current: string[], modelId: string) {
  favouritesStore.set(toggleFavourite(current, modelId));
}
