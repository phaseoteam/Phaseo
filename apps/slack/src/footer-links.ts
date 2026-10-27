import { webOrigin } from "./access";
import type { Env } from "./env";

// Where a reply's footer links to on the Phaseo web app: each catalogue model's
// page, and the workspace's Logs filtered to the answer's requests.

const DAY_MS = 24 * 60 * 60_000;

/** A catalogue model's page, such as https://phaseo.app/models/openai/gpt-6-luna. */
export function modelPageUrl(env: Pick<Env, "PHASEO_WEB_ORIGIN" | "ENV">, modelSlug: string): string {
	return `${webOrigin(env)}/models/${modelSlug.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The workspace's Logs, filtered to one answer's gateway session (turnSessionId).
 * Logs also filters by time, so the link covers the day before and after the
 * answer: the dates are read in the viewer's time zone.
 */
export function answerLogsUrl(env: Pick<Env, "PHASEO_WEB_ORIGIN" | "ENV">, workspaceId: string, sessionId: string, at: number): string {
	const url = new URL("/settings/usage/logs/requests", webOrigin(env));
	url.searchParams.set("workspaceId", workspaceId);
	url.searchParams.set("session", sessionId);
	url.searchParams.set("usage_preset", "custom");
	url.searchParams.set("usage_from", new Date(at - DAY_MS).toISOString().slice(0, 10));
	url.searchParams.set("usage_to", new Date(at + DAY_MS).toISOString().slice(0, 10));
	return url.toString();
}
