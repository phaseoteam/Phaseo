import { useCallback, useSyncExternalStore } from "react";
import { createStore } from "@/lib/store";

/**
 * Answers while they stream, kept in memory (the database gets small appended pieces; see runner.ts).
 * Each message has its own subscription, so a token re-renders only the answer it belongs to.
 * `boundaries` are where the answer's finished chunks end (markdownChunks.ts): a new one appears every few
 * KB, and only then does the conversation rebuild its list.
 */
export type LiveAnswer = {
  content: string;
  reasoning: string;
  phase: "waiting" | "summarising" | "streaming";
  boundaries: number[];
};

type Entry = { value: LiveAnswer | null; listeners: Set<() => void> };
const entries = new Map<string, Entry>();

/** Bumped when an answer starts or ends streaming, finishes a chunk, or changes phase. */
export const liveShapes = createStore(0);

function entry(id: string) {
  let found = entries.get(id);
  if (!found) {
    found = { value: null, listeners: new Set() };
    entries.set(id, found);
  }
  return found;
}

export function getLive(id: string): LiveAnswer | null {
  return entries.get(id)?.value ?? null;
}

export function setLive(id: string, value: LiveAnswer | null) {
  const current = entry(id);
  const before = current.value;
  current.value = value;
  for (const listener of current.listeners) listener();
  if (!value && !current.listeners.size) entries.delete(id);
  if (!before || !value || before.boundaries.length !== value.boundaries.length || before.phase !== value.phase) liveShapes.set((version) => version + 1);
}

function subscribe(id: string, listener: () => void) {
  const current = entry(id);
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
    if (!current.listeners.size && !current.value && entries.get(id) === current) entries.delete(id);
  };
}

export function useLive(id: string) {
  const subscribeTo = useCallback((listener: () => void) => subscribe(id, listener), [id]);
  return useSyncExternalStore(subscribeTo, () => getLive(id), () => getLive(id));
}
