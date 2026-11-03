import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { DesktopRequestError, type ClientEvent, type DesktopClient } from "../client";
import { useClientEvents, useConnection } from "../connections";
import type { PhoneResults } from "../protocol";
import { readsGit } from "./gitState";

/** A failed request: its words, and the computer's code (forbidden: switched off for this phone; not_found: gone). */
export type GitError = { message: string; code?: string };
export const gitErrorOf = (problem: unknown): GitError => ({ message: problem instanceof Error ? problem.message : "Something went wrong.", ...(problem instanceof DesktopRequestError ? { code: problem.code } : {}) });

type Status = PhoneResults["git_status"];

/**
 * A project's branch, upstream, changed files and the branch's pull request: read when the screen comes into view,
 * after a reconnect and on Refresh, never on a timer. An action's answer replaces it with what git says after.
 */
export function useGitStatus(client: DesktopClient, projectId: string) {
  const allowed = readsGit(useConnection(client));
  const [state, setState] = useState<{ key: string; status: Status | null; error: GitError | null; loading: boolean }>({ key: "", status: null, error: null, loading: false });
  // Only the latest read lands, so an older answer never replaces a newer action's status.
  const latest = useRef(0);
  const read = useCallback(() => {
    const asked = ++latest.current;
    if (!allowed) return;
    setState((current) => ({ ...current, loading: true }));
    client.request("git_status", { projectId, pullRequest: true }).then(
      (status) => { if (asked === latest.current) setState({ key: projectId, status, error: null, loading: false }); },
      (problem: unknown) => { if (asked === latest.current) setState((current) => ({ key: projectId, status: current.key === projectId ? current.status : null, error: gitErrorOf(problem), loading: false })); },
    );
  }, [client, projectId, allowed]);
  useFocusEffect(read);
  useClientEvents(client, useCallback((event: ClientEvent) => { if (event.type === "connected" && event.reconnect) read(); }, [read]));
  /** A status an action answered with; the branch's pull request is kept, as an action's answer doesn't carry it. */
  const replace = useCallback((status: Status) => {
    latest.current++;
    setState((current) => ({ key: projectId, status: { ...status, ...(status.pullRequest === undefined && current.status?.pullRequest !== undefined ? { pullRequest: current.status.pullRequest } : {}) }, error: null, loading: false }));
  }, [projectId]);
  const current = state.key === projectId ? state : { key: projectId, status: null, error: null, loading: true };
  return { allowed: allowed && current.error?.code !== "forbidden", ...current, reload: read, replace };
}

/** A project's branches, read when first asked for (opening the branch sheet or the worktree chip). */
export function useBranches(client: DesktopClient | null, projectId: string | null) {
  const allowed = readsGit(useConnection(client));
  const [state, setState] = useState<{ key: string; refs: PhoneResults["list_branches"] | null; error: string | null }>({ key: "", refs: null, error: null });
  const load = useCallback(() => {
    if (!client || !projectId || !allowed) return;
    const key = projectId;
    client.request("list_branches", { projectId }).then(
      (refs) => setState({ key, refs, error: null }),
      (problem: unknown) => setState({ key, refs: null, error: gitErrorOf(problem).message }),
    );
  }, [client, projectId, allowed]);
  const current = state.key === projectId ? state : { refs: null, error: null };
  return { refs: current.refs, error: current.error, load };
}

/**
 * One Git action at a time on a screen: what's running (for the progress row) and the error the computer answered with,
 * in git's or GitHub's own words.
 */
export function useGitRunner() {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<GitError | null>(null);
  const busy = useRef(false);
  const run = useCallback(async <T,>(label: string, work: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setRunning(label); setError(null);
    try { return await work(); }
    catch (problem) { setError(gitErrorOf(problem)); return undefined; }
    finally { busy.current = false; setRunning(null); }
  }, []);
  return { running, error, run, clearError: useCallback(() => setError(null), []) };
}
