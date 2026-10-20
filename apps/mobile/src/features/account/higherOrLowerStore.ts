import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

const UNLOCKED_KEY = "phaseo.higher-or-lower.unlocked";
const BEST_KEY = "phaseo.higher-or-lower.best";

/** Whether this device has found Higher or lower (seven taps on Version and build), and its best streak. */
export const higherOrLowerStore = createStore<{ unlocked: boolean; best: number }>({ unlocked: false, best: 0 });

void Promise.all([kv.getItem(UNLOCKED_KEY), kv.getItem(BEST_KEY)]).then(([unlocked, best]) => {
  const saved = Number(best);
  higherOrLowerStore.set((state) => ({
    unlocked: state.unlocked || unlocked === "1",
    best: Math.max(state.best, Number.isInteger(saved) && saved > 0 ? saved : 0),
  }));
}).catch(() => undefined);

export function unlockHigherOrLower() {
  higherOrLowerStore.set((state) => (state.unlocked ? state : { ...state, unlocked: true }));
  void kv.setItem(UNLOCKED_KEY, "1");
}

/** Keeps the best streak; returns true when this one beats it. */
export function recordStreak(streak: number) {
  if (streak <= higherOrLowerStore.get().best) return false;
  higherOrLowerStore.set((state) => ({ ...state, best: streak }));
  void kv.setItem(BEST_KEY, String(streak));
  return true;
}
