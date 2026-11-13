import type { SlowOperation } from "@/lib/diagnostics";
import type { ConnectionState } from "../client";
import type { PhoneBuild } from "../protocol";

/** Triage needs a computer from protocol 8 that lets this phone read code and make changes (it fetches the source and runs an agent). */
export function triageBlocker(state: ConnectionState, desktopName: string): string | null {
  if (state.status !== "connected") return null;
  if (state.protocol < 8) return `Update Phaseo on ${desktopName} to triage from this phone.`;
  if (!state.capabilities.includes("code") || !state.capabilities.includes("changes")) return `Allow Read code and Make changes for this phone on ${desktopName}: Settings → Phone.`;
  return null;
}
export const triages = (state: ConnectionState) => state.status === "connected" && triageBlocker(state, "") === null;

/** Filing or discarding a draft creates or drops a GitHub issue, so it needs Make changes too. */
export const filesIssues = (state: ConnectionState) => state.status === "connected" && state.protocol >= 8 && state.capabilities.includes("changes");

/** How long the phone waits for the computer to fetch the source and start the chat: a first fetch takes minutes. */
export const TRIAGE_TIMEOUT_MS = 6 * 60_000;

/** This build as the computer needs it; a short or missing commit is left out, and the computer falls back to main. */
export function phoneBuild(input: { version: string; commit: string | null; dirty: boolean; buildNumber: number | null; builtAt: string | null; platform: string; osVersion: string | null; device: string | null; runtime: string | null }): PhoneBuild {
  return {
    version: input.version, platform: input.platform,
    ...input.commit && /^[0-9a-f]{40}$/i.test(input.commit) ? { commit: input.commit.toLowerCase() } : {},
    ...input.dirty ? { dirty: true as const } : {},
    ...input.buildNumber != null ? { buildNumber: input.buildNumber } : {},
    ...input.builtAt ? { builtAt: input.builtAt } : {},
    ...input.osVersion ? { osVersion: input.osVersion } : {},
    ...input.device ? { device: input.device } : {},
    ...input.runtime ? { runtime: input.runtime } : {},
  };
}

/**
 * The phone's slow operations for the agent, newest first: when, what and how long. Their details are left out, as they
 * can name models, chats or counts from the person's own data.
 */
export function triageDiagnostics(operations: readonly SlowOperation[], limit = 50) {
  return operations.slice(0, limit).map((operation) => `${new Date(operation.at).toISOString()} ${operation.name} took ${Math.round(operation.ms)} ms`).join("\n");
}

/** What the issue card says the draft is. */
export const ISSUE_STATUS = { draft: "Issue draft", filed: "Issue filed", discarded: "Issue draft discarded" } as const;
