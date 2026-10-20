import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

const BEST_KEY = "phaseo.higher-or-lower.best";
/** Builds where seven taps unlocked the game saved this; the game is always in the version art now, so it goes. */
const RETIRED_UNLOCKED_KEY = "phaseo.higher-or-lower.unlocked";

/** This device's best Higher or lower streak. */
export const higherOrLowerStore = createStore<{ best: number }>({ best: 0 });

void kv.getItem(BEST_KEY).then((best) => {
  const saved = Number(best);
  higherOrLowerStore.set((state) => ({ best: Math.max(state.best, Number.isInteger(saved) && saved > 0 ? saved : 0) }));
}).catch(() => undefined);
void kv.removeItem(RETIRED_UNLOCKED_KEY).catch(() => undefined);

/** Keeps the best streak; returns true when this one beats it. */
export function recordStreak(streak: number) {
  if (streak <= higherOrLowerStore.get().best) return false;
  higherOrLowerStore.set({ best: streak });
  void kv.setItem(BEST_KEY, String(streak));
  return true;
}
