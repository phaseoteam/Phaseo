import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

const KEY = "phaseo.models.recent";
const KEEP = 5;
const EMPTY: string[] = [];

/** Models picked from the model sheet, latest first, per list: "chat" for Phaseo chats, `desktop:<id>` per computer. */
export const recentModelsStore = createStore<Record<string, string[]>>({});

let changed = false;
void kv.getItem(KEY).then((text) => {
  try {
    const saved = JSON.parse(text ?? "null") as unknown;
    if (!changed && saved && typeof saved === "object" && !Array.isArray(saved)) {
      recentModelsStore.set(Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === "string"))));
    }
  } catch { /* start empty */ }
});

recentModelsStore.subscribe(() => {
  changed = true;
  void kv.setItem(KEY, JSON.stringify(recentModelsStore.get()));
});

/** Puts a model first in its list's recent models. */
export function withRecentModel(recent: readonly string[], modelId: string) {
  return [modelId, ...recent.filter((id) => id !== modelId)].slice(0, KEEP);
}

export const rememberModel = (scope: string, modelId: string) => recentModelsStore.set((state) => (state[scope]?.[0] === modelId ? state : { ...state, [scope]: withRecentModel(state[scope] ?? [], modelId) }));
export const useRecentModels = (scope: string) => recentModelsStore.use((state) => state[scope] ?? EMPTY);
