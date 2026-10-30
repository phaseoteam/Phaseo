"use client";

import { useCallback, useState, type SetStateAction } from "react";

// Null means a child editor has not loaded its rows yet. Its first report is
// the baseline; subsequent reports are edits, including reverting to that baseline.
export function useCatalogDraft<T>(initial: T) {
  const [state, setState] = useState(() => ({ value: initial, baseline: JSON.stringify(initial), loaded: initial !== null }));
  const update = useCallback((next: SetStateAction<T>) => {
    setState((current) => {
      const value = typeof next === "function" ? (next as (previous: T) => T)(current.value) : next;
      if (current.loaded && current.value === value) return current;
      return { value, baseline: current.loaded ? current.baseline : JSON.stringify(value), loaded: true };
    });
  }, []);
  const reset = useCallback((value: T) => setState({ value, baseline: JSON.stringify(value), loaded: value !== null }), []);
  return [state.value, update, reset, state.loaded && JSON.stringify(state.value) !== state.baseline] as const;
}
