import { useCallback, useEffect, useState } from "react";
import { DesktopRequestError, type ClientEvent, type DesktopClient } from "../client";
import { useClientEvents, useConnection } from "../connections";
import type { PhoneFilePreview, PhoneResults } from "../protocol";
import { folderChain, readsFiles, type Folder } from "./fileTree";

/** Whose folder Files reads: a thread's (its worktree's when it has one) or a project's. */
export type FilesTarget = { chatId: string } | { projectId: string };
/** A failed read: its words, and the computer's code (forbidden: reading code is off; not_found: gone). */
export type FileError = { message: string; code?: string };
const errorOf = (problem: unknown): FileError => ({ message: problem instanceof Error ? problem.message : "Something went wrong.", ...(problem instanceof DesktopRequestError ? { code: problem.code } : {}) });
/** The target as a string, so effects follow its value rather than the caller's object, which is new on every render. */
const targetKey = (target: FilesTarget) => ("chatId" in target ? `chat:${target.chatId}` : `project:${target.projectId}`);
const targetOf = (key: string): FilesTarget => (key.startsWith("chat:") ? { chatId: key.slice(5) } : { projectId: key.slice(8) });

/**
 * A project's folders as the person opens them: the top on opening, each folder the first time it opens, and every
 * folder read so far again on Refresh or after a reconnect. Nothing polls.
 */
export function useFileTree(client: DesktopClient, target: FilesTarget) {
  const allowed = readsFiles(useConnection(client));
  const key = targetKey(target);
  const [folders, setFolders] = useState<{ key: string; byPath: ReadonlyMap<string, Folder> }>({ key, byPath: new Map() });
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [forbidden, setForbidden] = useState(false);
  const read = useCallback((directory: string) => {
    if (!allowed) return;
    client.request("list_files", { ...targetOf(key), directory }).then(
      (listing) => { setForbidden(false); setFolders((current) => ({ key, byPath: new Map(current.key === key ? current.byPath : []).set(directory, listing) })); },
      (problem: unknown) => {
        const error = errorOf(problem);
        if (error.code === "forbidden") setForbidden(true);
        setFolders((current) => ({ key, byPath: new Map(current.key === key ? current.byPath : []).set(directory, { error: error.message }) }));
      },
    );
  }, [client, allowed, key]);
  useEffect(() => read(""), [read]);
  const byPath = folders.key === key ? folders.byPath : EMPTY;
  const reload = useCallback(() => { for (const directory of ["", ...open]) read(directory); }, [read, open]);
  useClientEvents(client, useCallback((event: ClientEvent) => { if (event.type === "connected" && event.reconnect) reload(); }, [reload]));
  const toggle = useCallback((directory: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(directory)) next.delete(directory); else next.add(directory);
      return next;
    });
    if (!byPath.has(directory)) read(directory);
  }, [byPath, read]);
  /** Opens a folder found by search with every folder above it, so it shows in the tree. */
  const reveal = useCallback((directory: string) => {
    const chain = folderChain(directory);
    setOpen((current) => new Set([...current, ...chain]));
    for (const folder of chain) if (!byPath.has(folder)) read(folder);
  }, [byPath, read]);
  return { allowed: allowed && !forbidden, folders: byPath, open, toggle, reveal, reload };
}
const EMPTY: ReadonlyMap<string, Folder> = new Map();

/** Files and folders across the project matching `query`, the latest answer only; null while the first one reads. */
export function useFileSearch(client: DesktopClient, target: FilesTarget, query: string) {
  const allowed = readsFiles(useConnection(client));
  const of = targetKey(target), key = `${of}|${query.trim()}`;
  const [state, setState] = useState<{ key: string; result: PhoneResults["list_files"] | null; error: FileError | null }>({ key: "", result: null, error: null });
  useEffect(() => {
    if (!allowed || !query.trim()) return;
    let current = true;
    client.request("list_files", { ...targetOf(of), query: query.trim() }).then(
      (result) => { if (current) setState({ key, result, error: null }); },
      (problem: unknown) => { if (current) setState({ key, result: null, error: errorOf(problem) }); },
    );
    return () => { current = false; };
  }, [client, allowed, of, key, query]);
  return state.key === key ? state : { key, result: null, error: null };
}

/** One file's preview, read on opening, after a reconnect and on Refresh. */
export function useFilePreview(client: DesktopClient, target: FilesTarget, path: string) {
  const allowed = readsFiles(useConnection(client));
  const of = targetKey(target), key = `${of}|${path}`;
  const [state, setState] = useState<{ key: string; file: PhoneFilePreview | null; error: FileError | null; loading: boolean }>({ key: "", file: null, error: null, loading: false });
  const read = useCallback(() => {
    if (!allowed) return;
    client.request("read_file", { ...targetOf(of), path }).then(
      (file) => setState({ key, file, error: null, loading: false }),
      (problem: unknown) => setState({ key, file: null, error: errorOf(problem), loading: false }),
    );
  }, [client, allowed, of, key, path]);
  useEffect(read, [read]);
  const reload = useCallback(() => { setState((current) => ({ ...current, loading: true })); read(); }, [read]);
  useClientEvents(client, useCallback((event: ClientEvent) => { if (event.type === "connected" && event.reconnect) read(); }, [read]));
  const current = state.key === key ? state : { key, file: null, error: null, loading: true };
  return { allowed: allowed && current.error?.code !== "forbidden", ...current, reload };
}
