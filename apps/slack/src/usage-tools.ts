import type { AgentTool } from "@phaseo/agent-sdk";
import type { Installation } from "./installations";
import type { Db } from "./supabase";
import type { TurnRef } from "./turns";

// The agent's Phaseo usage tools. They are offered only when the installation's
// usage_data_mode allows it in this conversation (DMs, plus the listed channels
// for dm_and_channels) and the Slack person is linked to a member of the
// installation's workspace. Each calls the database with the service role,
// scoped to that workspace, and every sum is done in the database (PostgREST
// returns at most 1,000 rows, so rows are never fetched to be added up here).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NANOS_PER_USD = 1_000_000_000;
const MAX_QUERY_CHARS = 80;
/** Characters allowed in a model search; anything else could change the PostgREST filter. */
const QUERY_PATTERN = /[^A-Za-z0-9 ._:/-]/g;

export function conversationAllowsUsageData(installation: Pick<Installation, "usage_data_mode" | "usage_data_channel_ids">, turn: Pick<TurnRef, "channel" | "kind">): boolean {
	if (installation.usage_data_mode === "off") return false;
	if (turn.kind === "dm" || turn.channel.startsWith("D")) return true;
	return installation.usage_data_mode === "dm_and_channels" && (installation.usage_data_channel_ids ?? []).includes(turn.channel);
}

/** The Phaseo user a Slack person linked, or null. */
export async function linkedUserId(db: Db, installationId: string, slackUserId: string): Promise<string | null> {
	const rows = await db.select<{ user_id: string }>("slack_user_links", {
		select: "user_id",
		installation_id: `eq.${installationId}`,
		slack_user_id: `eq.${slackUserId}`,
		limit: "1",
	});
	return rows[0]?.user_id ?? null;
}

/** Whether a Phaseo user is still a member (or the owner) of the workspace. */
export async function isWorkspaceMember(db: Db, workspaceId: string, userId: string): Promise<boolean> {
	const members = await db.select("workspace_members", { select: "user_id", workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}`, limit: "1" });
	if (members.length) return true;
	const owners = await db.select("workspaces", { select: "id", id: `eq.${workspaceId}`, owner_user_id: `eq.${userId}`, limit: "1" });
	return owners.length > 0;
}

export class ToolInputError extends Error {}

function utcDate(value: unknown, field: string): string {
	if (typeof value !== "string" || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
		|| new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
		throw new ToolInputError(`${field} must be a date like 2026-10-01`);
	}
	return value;
}

function oneOf<T extends string>(value: unknown, field: string, options: readonly T[], fallback: T): T {
	if (value === undefined || value === null) return fallback;
	if (typeof value === "string" && (options as readonly string[]).includes(value)) return value as T;
	throw new ToolInputError(`${field} must be one of ${options.join(", ")}`);
}

function usd(nanos: unknown): number {
	const value = Number(nanos);
	return Number.isFinite(value) ? Math.round((value / NANOS_PER_USD) * 1_000_000) / 1_000_000 : 0;
}

function range(input: { from?: unknown; to?: unknown }): { from: string; to: string } {
	const from = utcDate(input.from, "from");
	const to = utcDate(input.to, "to");
	if (from > to) throw new ToolInputError("from must be on or before to");
	return { from, to };
}

export function monthStartIso(now: number): string {
	const date = new Date(now);
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

/** The search text as a safe PostgREST ilike pattern, or null when nothing usable is left. */
export function modelSearchPattern(query: unknown): string | null {
	if (typeof query !== "string") return null;
	const cleaned = query.replace(QUERY_PATTERN, " ").trim().replace(/\s+/g, "*").slice(0, MAX_QUERY_CHARS);
	return cleaned ? `*${cleaned}*` : null;
}

export type UsageToolContext = {
	db: Db;
	workspaceId: string;
	now: () => number;
	/** Short notes of what each tool looked up, kept as the thread's working memory. */
	notes: string[];
};

export function usageTools(context: UsageToolContext): AgentTool<any, any>[] {
	const { db, workspaceId, notes } = context;
	return [
		{
			id: "get_spend",
			description: "This Phaseo workspace's requests and spend in US dollars between two UTC dates (inclusive), per day, week (weeks start on Monday) or month, optionally per model or provider (the 8 that cost the most, then other). At most 100 buckets.",
			parameters: {
				type: "object",
				properties: {
					from: { type: "string", description: "First UTC date, YYYY-MM-DD." },
					to: { type: "string", description: "Last UTC date, YYYY-MM-DD (inclusive)." },
					bucket: { type: "string", enum: ["day", "week", "month"], description: "Default day." },
					group_by: { type: "string", enum: ["none", "model", "provider"], description: "Default none." },
				},
				required: ["from", "to"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const { from, to } = range(input);
				const bucket = oneOf(input.bucket, "bucket", ["day", "week", "month"] as const, "day");
				const groupBy = oneOf(input.group_by, "group_by", ["none", "model", "provider"] as const, "none");
				const rows = await db.rpc<Array<{ bucket_start: string; group_key: string; requests: number | string; cost_nanos: number | string }>>(
					"get_workspace_spend_buckets",
					{ p_workspace_id: workspaceId, p_from: from, p_to: to, p_bucket: bucket, p_group_by: groupBy },
				);
				notes.push(`get_spend ${from} to ${to} by ${bucket}${groupBy === "none" ? "" : ` and ${groupBy}`}`);
				return {
					from, to, bucket, group_by: groupBy, currency: "USD",
					buckets: (rows ?? []).map((row) => ({ start: row.bucket_start, group: row.group_key, requests: Number(row.requests) || 0, cost_usd: usd(row.cost_nanos) })),
				};
			},
		},
		{
			id: "get_credit_balance",
			description: "This Phaseo workspace's credit balance in US dollars, credits held for requests in progress, and credits spent since the start of this UTC month.",
			parameters: { type: "object", properties: {}, additionalProperties: false },
			onError: "return-to-model",
			execute: async () => {
				const since = monthStartIso(context.now());
				const [wallet, spent] = await Promise.all([
					db.select<{ balance_nanos: number | string; reserved_nanos: number | string }>("wallets", { select: "balance_nanos,reserved_nanos", workspace_id: `eq.${workspaceId}`, limit: "1" }),
					db.rpc<number | string | null>("get_workspace_recent_credit_spend", { p_workspace_id: workspaceId, p_since: since }),
				]);
				notes.push("get_credit_balance");
				const balance = Number(wallet[0]?.balance_nanos ?? 0) || 0;
				const reserved = Number(wallet[0]?.reserved_nanos ?? 0) || 0;
				return {
					currency: "USD",
					balance_usd: usd(balance),
					held_for_requests_usd: usd(reserved),
					available_usd: usd(balance - reserved),
					spent_this_month_usd: usd(spent ?? 0),
					month_start: since.slice(0, 10),
				};
			},
		},
		{
			id: "get_key_usage",
			description: "Requests and spend in US dollars per Phaseo API key between two UTC dates (inclusive), the keys that cost the most first (at most 100). A null key is usage without a key, such as the web chat.",
			parameters: {
				type: "object",
				properties: {
					from: { type: "string", description: "First UTC date, YYYY-MM-DD." },
					to: { type: "string", description: "Last UTC date, YYYY-MM-DD (inclusive)." },
				},
				required: ["from", "to"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const { from, to } = range(input);
				const rows = await db.rpc<Array<{ key_id: string | null; key_name: string | null; key_prefix: string | null; requests: number | string; cost_nanos: number | string }>>(
					"get_workspace_key_spend",
					{ p_workspace_id: workspaceId, p_from: from, p_to: to },
				);
				notes.push(`get_key_usage ${from} to ${to}`);
				return {
					from, to, currency: "USD",
					keys: (rows ?? []).map((row) => ({
						key: row.key_id ? row.key_name ?? "Unnamed key" : null,
						prefix: row.key_prefix,
						requests: Number(row.requests) || 0,
						cost_usd: usd(row.cost_nanos),
					})),
				};
			},
		},
		{
			id: "find_models",
			description: "Search Phaseo's model catalogue by model id or name. Returns up to 10 models, newest first.",
			parameters: {
				type: "object",
				properties: { query: { type: "string", description: "Part of a model id or name, e.g. gpt or claude sonnet." } },
				required: ["query"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const pattern = modelSearchPattern(input.query);
				if (!pattern) throw new ToolInputError("query must contain letters or numbers");
				const rows = await db.select<{ model_slug: string; name: string; lab_slug: string; status: string; released_at: string | null }>("v2_models", {
					select: "model_slug,name,lab_slug,status,released_at",
					hidden: "is.false",
					or: `(model_slug.ilike.${pattern},name.ilike.${pattern})`,
					order: "released_at.desc.nullslast",
					limit: "10",
				});
				notes.push(`find_models ${pattern.slice(1, -1).replace(/\*/g, " ")}`);
				return { models: rows.map((row) => ({ id: row.model_slug, name: row.name, lab: row.lab_slug, status: row.status, released_at: row.released_at?.slice(0, 10) ?? null })) };
			},
		},
	];
}
