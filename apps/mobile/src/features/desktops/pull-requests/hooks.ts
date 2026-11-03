import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent, DesktopClient } from "../client";
import { useClientEvents, useConnection } from "../connections";
import { gitErrorOf, type GitError } from "../git/hooks";
import { readsGit } from "../git/gitState";
import type { PhoneDiffFile, PhonePullRequest, PhonePullRequestView } from "../protocol";

/** A repository's open pull requests, read on coming into view, after a reconnect and on Refresh; more on request. */
export function usePullRequests(client: DesktopClient, projectId: string | null) {
  const allowed = readsGit(useConnection(client));
  const [state, setState] = useState<{ key: string; repository: string | null; rows: PhonePullRequest[] | null; cursor?: string; limitReached: boolean; error: GitError | null; loading: boolean }>({ key: "", repository: null, rows: null, limitReached: false, error: null, loading: false });
  const latest = useRef(0);
  const read = useCallback((cursor?: string) => {
    const asked = ++latest.current, key = projectId ?? "";
    if (!allowed || !projectId) return;
    setState((current) => ({ ...current, loading: true }));
    client.request("list_pull_requests", { projectId, ...(cursor ? { cursor } : {}) }).then(
      (page) => { if (asked === latest.current) setState((current) => ({ key, repository: page.repository, rows: cursor && current.key === key ? [...current.rows ?? [], ...page.pullRequests] : page.pullRequests, cursor: page.cursor, limitReached: page.limitReached, error: null, loading: false })); },
      (problem: unknown) => { if (asked === latest.current) setState((current) => ({ ...current, key, error: gitErrorOf(problem), loading: false })); },
    );
  }, [client, projectId, allowed]);
  const reload = useCallback(() => read(), [read]);
  useFocusEffect(reload);
  useClientEvents(client, useCallback((event: ClientEvent) => { if (event.type === "connected" && event.reconnect) reload(); }, [reload]));
  const current = state.key === (projectId ?? "") ? state : { key: "", repository: null, rows: null, cursor: undefined, limitReached: false, error: null, loading: true };
  return { allowed: allowed && current.error?.code !== "forbidden", ...current, reload, more: current.cursor ? () => read(current.cursor) : null };
}

/** One pull request, read on coming into view, after a reconnect and on Refresh; an action's answer replaces it. */
export function usePullRequest(client: DesktopClient, projectId: string, number: number) {
  const allowed = readsGit(useConnection(client));
  const key = `${projectId}#${number}`;
  const [state, setState] = useState<{ key: string; view: PhonePullRequestView | null; error: GitError | null; loading: boolean }>({ key: "", view: null, error: null, loading: false });
  const latest = useRef(0);
  const read = useCallback(() => {
    const asked = ++latest.current;
    if (!allowed) return;
    setState((current) => ({ ...current, loading: true }));
    client.request("read_pull_request", { projectId, number }).then(
      (view) => { if (asked === latest.current) setState({ key, view, error: null, loading: false }); },
      (problem: unknown) => { if (asked === latest.current) setState((current) => ({ ...current, key, error: gitErrorOf(problem), loading: false })); },
    );
  }, [client, projectId, number, allowed, key]);
  useFocusEffect(read);
  useClientEvents(client, useCallback((event: ClientEvent) => { if (event.type === "connected" && event.reconnect) read(); }, [read]));
  const replace = useCallback((view: PhonePullRequestView) => { latest.current++; setState({ key, view, error: null, loading: false }); }, [key]);
  const current = state.key === key ? state : { key, view: null, error: null, loading: true };
  return { allowed: allowed && current.error?.code !== "forbidden", ...current, reload: read, replace };
}

/** A pull request's changed files at the head and base it was read at, a page of 100 at a time, read when Files opens. */
export function usePullRequestFiles(client: DesktopClient, projectId: string, view: Pick<PhonePullRequestView, "number" | "headOid" | "baseOid"> | null, active: boolean) {
  const key = view ? `${projectId}#${view.number}@${view.headOid}:${view.baseOid}` : "";
  const [state, setState] = useState<{ key: string; files: PhoneDiffFile[] | null; total: number; page: number; hasNext: boolean; error: string | null }>({ key: "", files: null, total: 0, page: 0, hasNext: false, error: null });
  const load = useCallback((page: number) => {
    if (!view) return;
    client.request("pull_request_files", { projectId, number: view.number, headOid: view.headOid, baseOid: view.baseOid, page }).then(
      (result) => setState((current) => ({ key, files: page > 1 && current.key === key ? [...current.files ?? [], ...result.files] : result.files, total: result.total, page, hasNext: result.hasNext, error: null })),
      (problem: unknown) => setState((current) => ({ ...current, key, error: gitErrorOf(problem).message })),
    );
  }, [client, projectId, view, key]);
  const current = state.key === key ? state : null;
  const loaded = state.key;
  useEffect(() => { if (active && key && loaded !== key) load(1); }, [active, key, loaded, load]);
  return { files: current?.files ?? null, total: current?.total ?? 0, error: current?.error ?? null, more: current?.hasNext ? () => load(current.page + 1) : null };
}
