import { useCallback, useEffect, useRef, useState } from "react";
import { kv } from "@/lib/storage";
import type { PhoneChatMode } from "./protocol";

/** A new thread's unsent words and mode, kept on this phone per computer and project until it starts. */
export type ThreadDraft = { text: string; mode: PhoneChatMode | null };
const EMPTY: ThreadDraft = { text: "", mode: null };
const keyOf = (desktopId: string, projectId: string | null) => `phaseo.thread-draft.${desktopId}.${projectId ?? ""}`;

export function readDraft(text: string | null): ThreadDraft {
  try {
    const value = JSON.parse(text ?? "null") as { text?: unknown; mode?: unknown } | null;
    const mode = value?.mode === "chat" || value?.mode === "code" || value?.mode === "plan" ? value.mode : null;
    return { text: typeof value?.text === "string" ? value.text : "", mode };
  } catch {
    return EMPTY;
  }
}

/** The draft for a computer and project: read when either changes, written as it changes, dropped once the thread starts. */
export function useThreadDraft(desktopId: string, projectId: string | null) {
  const key = keyOf(desktopId, projectId);
  const [state, setState] = useState<{ key: string; draft: ThreadDraft }>({ key, draft: EMPTY });
  // Typing before storage answers wins over the stored draft.
  const touched = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    void kv.getItem(key).then((text) => {
      if (live && touched.current !== key) setState({ key, draft: readDraft(text) });
    });
    return () => { live = false; };
  }, [key]);
  const draft = state.key === key ? state.draft : EMPTY;
  const update = useCallback((change: Partial<ThreadDraft>) => {
    touched.current = key;
    setState((current) => {
      const next = { ...(current.key === key ? current.draft : EMPTY), ...change };
      void kv.setItem(key, JSON.stringify(next));
      return { key, draft: next };
    });
  }, [key]);
  const clear = useCallback(() => { void kv.removeItem(key); }, [key]);
  return { draft, update, clear };
}
