import { useSyncExternalStore } from "react";

/** A tiny shared-state container for UI state that several screens touch (filters, compare tray). */
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  return {
    get: () => state,
    set(next: T | ((previous: T) => T)) {
      const value = typeof next === "function" ? (next as (previous: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const listener of listeners) listener();
    },
    subscribe,
    /** Selectors must return stable references (a field, not a new array). */
    use<S = T>(selector: (value: T) => S = (value) => value as unknown as S): S {
      return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
    },
  };
}
