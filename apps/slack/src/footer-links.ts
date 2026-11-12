import { webOrigin } from "./access";
import type { Env } from "./env";
import { AUTO_MODEL, inList } from "./model-choice";
import type { FooterModel } from "./reply-stream";
import type { Db } from "./supabase";

// Where a reply's footer links to on the Phaseo web app: each catalogue model's
// page, and the workspace's Logs filtered to the answer's requests.

const DAY_MS = 24 * 60 * 60_000;

/**
 * Models as a reply names them, by id: the catalogue name, linked to the model's
 * page unless it is hidden. Auto is named Auto, with no page; a model the
 * catalogue doesn't list (or a catalogue that can't be read) keeps its id.
 */
export async function linkedModels(db: Db, env: Pick<Env, "PHASEO_WEB_ORIGIN" | "ENV">, ids: string[]): Promise<Map<string, FooterModel>> {
	const wanted = [...new Set(ids)].filter((id) => id !== AUTO_MODEL);
	const rows = wanted.length
		? await db.select<{ model_slug: string; name: string | null; hidden: boolean | null }>("v2_models", { select: "model_slug,name,hidden", model_slug: inList(wanted) }).catch(() => [])
		: [];
	const found = new Map(rows.map((row) => [row.model_slug, row]));
	return new Map(ids.map((id): [string, FooterModel] => {
		if (id === AUTO_MODEL) return [id, { name: "Auto", url: null }];
		const row = found.get(id);
		const name = row?.name?.trim();
		return [id, name ? { name, url: row?.hidden === true ? null : modelPageUrl(env, id) } : { name: id, url: null }];
	}));
}

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
