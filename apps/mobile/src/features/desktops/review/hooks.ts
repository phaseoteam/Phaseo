import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DesktopRequestError, type ClientEvent, type DesktopClient } from "../client";
import { useClientEvents, useConnection } from "../connections";
import type { PhoneChat, PhoneDiffFile, PhoneDiffScope, PhoneResults } from "../protocol";
import { readsCode } from "./diffLines";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");
type GitStatus = PhoneResults["git_status"];

/**
 * Each listed project's branch and changed files, for the sidebar's folder headings. Read when the list shows (or the
 * phone is allowed to read code again), after a reconnect, and for one project when a thread in it ends a turn, so
 * nothing polls. Empty while the phone can't read code.
 */
export function useProjectStatuses(client: DesktopClient | null, projectIds: readonly string[], chats: readonly PhoneChat[] | null) {
  const connection = useConnection(client);
  const allowed = readsCode(connection);
  const [statuses, setStatuses] = useState<ReadonlyMap<string, GitStatus>>(new Map());
  // The ids by value, as the caller's array is new on every render.
  const key = projectIds.join("\u0000");
  const ids = useMemo(() => (key ? key.split("\u0000") : []), [key]);
  const read = useCallback((ids: readonly string[]) => {
    if (!client || !allowed) return;
    for (const projectId of ids) {
      client.request("git_status", { projectId }).then(
        (status) => setStatuses((current) => new Map(current).set(projectId, status)),
        () => setStatuses((current) => { if (!current.has(projectId)) return current; const next = new Map(current); next.delete(projectId); return next; }),
      );
    }
  }, [client, allowed]);
  useEffect(() => read(ids), [read, ids]);
  useClientEvents(client, useCallback((event: ClientEvent) => { if (event.type === "connected" && event.reconnect) read(ids); }, [read, ids]));
  // A turn that ends is when files have changed; its project is read again.
  const running = useRef(new Map<string, string | undefined>());
  useEffect(() => {
    const ended = new Set<string>();
    for (const chat of chats ?? []) {
      const was = running.current.get(chat.id);
      if (was === "running" && chat.status !== "running" && chat.projectId) ended.add(chat.projectId);
      running.current.set(chat.id, chat.status);
    }
    if (ended.size) read([...ended]);
  }, [chats, read]);
  return allowed ? statuses : EMPTY;
}
const EMPTY: ReadonlyMap<string, GitStatus> = new Map();

/** A failed read: its words, and the computer's code (not_found: nothing to compare; forbidden: reading code is off). */
export type DiffError = { message: string; code?: string };
type DiffState = { key: string; diff: PhoneResults["read_diff"] | null; error: DiffError | null; loading: boolean };

/**
 * A thread's changes in one scope: read on opening, on choosing another scope, after a reconnect and when its turn
 * ends; Refresh reads again. A file the frame had no room for is read on its own with `loadFile`.
 */
export function useThreadDiff(client: DesktopClient, chat: Pick<PhoneChat, "id" | "status"> | null, scope: PhoneDiffScope, messageId: string | null) {
  const connection = useConnection(client);
  const allowed = readsCode(connection);
  const key = `${chat?.id ?? ""}|${scope}|${scope === "turn" ? messageId ?? "" : ""}`;
  const [state, setState] = useState<DiffState>({ key: "", diff: null, error: null, loading: false });
  const [files, setFiles] = useState<{ hash: string; byPath: ReadonlyMap<string, PhoneDiffFile | string> }>({ hash: "", byPath: new Map() });
  const chatId = chat?.id;
  // State is set only when the answer arrives, never while the effect that asked runs, and only by the latest read:
  // an answer for a segment the person has left would otherwise replace the one they're looking at.
  const latest = useRef(0);
  const read = useCallback(() => {
    const asked = ++latest.current;
    if (!chatId || !allowed) return;
    client.request("read_diff", { chatId, scope, ...(scope === "turn" && messageId ? { messageId } : {}) }).then(
      (diff) => { if (asked === latest.current) setState({ key, diff, error: null, loading: false }); },
      (problem: unknown) => { if (asked === latest.current) setState({ key, diff: null, error: { message: messageOf(problem), ...(problem instanceof DesktopRequestError ? { code: problem.code } : {}) }, loading: false }); },
    );
  }, [client, chatId, scope, messageId, allowed, key]);
  useEffect(read, [read]);
  /** Refresh: the list stays while it reads again. */
  const reload = useCallback(() => { setState((current) => ({ ...current, loading: true })); read(); }, [read]);
  useClientEvents(client, useCallback((event: ClientEvent) => { if (event.type === "connected" && event.reconnect) read(); }, [read]));
  const status = chat?.status;
  const was = useRef(status);
  useEffect(() => {
    if (was.current === "running" && status !== "running") read();
    was.current = status;
  }, [status, read]);

  const current: DiffState = state.key === key ? state : { key, diff: null, error: null, loading: true };
  const hash = current.diff?.hash ?? "";
  const loadFile = useCallback((path: string) => {
    if (!chatId || !hash) return;
    client.request("read_diff_file", { chatId, scope, ...(scope === "turn" && messageId ? { messageId } : {}), path, hash }).then(
      ({ file }) => setFiles((existing) => ({ hash, byPath: new Map(existing.hash === hash ? existing.byPath : []).set(path, file) })),
      (problem: unknown) => setFiles((existing) => ({ hash, byPath: new Map(existing.hash === hash ? existing.byPath : []).set(path, messageOf(problem)) })),
    );
  }, [client, chatId, scope, messageId, hash]);
  /** A file with its patch as read on its own, or the error reading it. */
  const fileOf = useCallback((file: PhoneDiffFile): PhoneDiffFile | string => (file.patch || file.binary ? file : files.hash === hash ? files.byPath.get(file.path) ?? file : file), [files, hash]);
  return { allowed, diff: current.diff, error: current.error, loading: current.loading, reload, loadFile, fileOf };
}
