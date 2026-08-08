import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { buildGameProfileSummary, type GameResultRow } from "@/games/profile";
import { requireAccountWorkspace } from "./context";

type DailyActivityPoint = { date: string; requests: number; tokens: number; spendNanos: number };
type HeatmapDay = DailyActivityPoint & { monthLabel: string | null; weekdayLabel: string | null; inTrailingWindow: boolean; isFuture: boolean };
type UsageValue = Record<string, unknown> | null;
type RequestRow = { created_at: string | null; model_id: string | null; usage: UsageValue; cost_nanos: number | string | null };
type UsageAggregateRow = {
	bucket: string | null;
	model_id: string | null;
	requests: number | string | null;
	tokens: number | string | null;
	cost: number | string | null;
};

const PAGE_SIZE = 1000;
const PROFILE_USAGE_MAX_ROWS = 50_000;
const PROFILE_USAGE_WINDOW_DAYS = 365;
const PROFILE_USAGE_MAX_WORKSPACES = 100;

function dateKey(value: Date | string): string {
	const date = typeof value === "string" ? new Date(value) : value;
	return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}-${`${date.getUTCDate()}`.padStart(2, "0")}`;
}

function shiftDays(value: Date, days: number): Date {
	const next = new Date(value);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function dailySeries(totals: Map<string, Omit<DailyActivityPoint, "date">>, days: number, now = new Date()): DailyActivityPoint[] {
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	return Array.from({ length: days }, (_, index) => {
		const date = shiftDays(today, index - days + 1);
		return { date: dateKey(date), ...(totals.get(dateKey(date)) ?? { requests: 0, tokens: 0, spendNanos: 0 }) };
	});
}

function heatmap(totals: Map<string, Omit<DailyActivityPoint, "date">>, now = new Date()): HeatmapDay[] {
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const todayKey = dateKey(today);
	const trailingStartKey = dateKey(shiftDays(today, -364));
	const gridEnd = shiftDays(today, (7 - today.getUTCDay()) % 7);
	const gridStart = shiftDays(gridEnd, -(53 * 7) + 1);
	const days: HeatmapDay[] = [];
	let previousMonth = "";
	for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = shiftDays(cursor, 1)) {
		const key = dateKey(cursor);
		const month = cursor.toLocaleString("en", { month: "short", timeZone: "UTC" });
		const monthLabel = cursor.getUTCDate() <= 7 && month !== previousMonth ? month : null;
		days.push({
			date: key,
			...(totals.get(key) ?? { requests: 0, tokens: 0, spendNanos: 0 }),
			monthLabel,
			weekdayLabel: cursor.getUTCDay() >= 1 && cursor.getUTCDay() <= 5 ? ["", "M", "T", "W", "T", "F"][cursor.getUTCDay()] ?? null : "S",
			inTrailingWindow: key >= trailingStartKey && key <= todayKey,
			isFuture: key > todayKey,
		});
		previousMonth = month;
	}
	return days;
}

function periodChange(current: number, previous: number): number | null {
	if (current === 0 && previous === 0) return null;
	return previous === 0 ? 100 : ((current - previous) / previous) * 100;
}

function usageNumber(usage: UsageValue, keys: string[]): number {
	for (const key of keys) {
		const value = Number(usage?.[key]);
		if (Number.isFinite(value)) return value;
	}
	return 0;
}

function tokenCount(usage: UsageValue): number {
	const total = usageNumber(usage, ["total_tokens", "total_text_tokens"]);
	return total > 0 ? total : usageNumber(usage, ["input_text_tokens", "input_tokens"]) + usageNumber(usage, ["output_text_tokens", "output_tokens"]);
}

function streaks(points: Array<{ requests: number }>) {
	let current = 0;
	let longest = 0;
	let running = 0;
	let activeDays = 0;
	for (const point of points) {
		running = point.requests > 0 ? running + 1 : 0;
		if (point.requests > 0) activeDays += 1;
		longest = Math.max(longest, running);
	}
	for (let index = points.length - 1; index >= 0 && points[index]?.requests; index -= 1) current += 1;
	return { current, longest, activeDays };
}

function profileSlug(displayName: string, userId: string): string {
	const base = displayName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
	return `${base.slice(0, 40)}-${userId.replace(/-/g, "").slice(0, 8).toLowerCase()}`;
}

function normalizePublicProfileSlug(value: unknown): string {
	return String(value ?? "").trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-._]+|[-._]+$/g, "");
}

async function usageAggregateRows(client: ReturnType<typeof getDataClient>, workspaceIds: string[]): Promise<UsageAggregateRow[]> {
	if (!workspaceIds.length) return [];
	const rows: UsageAggregateRow[] = [];
	const since = new Date(Date.now() - PROFILE_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const perWorkspaceLimit = Math.max(1, Math.floor(PROFILE_USAGE_MAX_ROWS / workspaceIds.length));
	for (const workspaceId of workspaceIds) {
		let workspaceRows = 0;
		for (let offset = 0; workspaceRows < perWorkspaceLimit; offset += PAGE_SIZE) {
			const remaining = perWorkspaceLimit - workspaceRows;
			const pageLimit = Math.min(PAGE_SIZE, remaining);
			const result = await client.from("v2_web_gateway_requests")
				.select("created_at,model_id,usage,cost_nanos")
				.eq("workspace_id", workspaceId)
				.gte("created_at", since)
				.order("created_at", { ascending: false })
				.range(offset, offset + pageLimit - 1);
			if (result.error) throw new Error(result.error.message || "profile_usage_unavailable");
			const page = (result.data ?? []) as RequestRow[];
			rows.push(...page.map((row) => ({
				bucket: row.created_at,
				model_id: row.model_id,
				requests: 1,
				tokens: tokenCount(row.usage),
				cost: (Number(row.cost_nanos) || 0) / 1_000_000_000,
			})));
			workspaceRows += page.length;
			if (page.length < pageLimit) break;
		}
	}
	return rows;
}

function emptyProfileUsage(workspaceCount = 0) {
	const totals = new Map<string, Omit<DailyActivityPoint, "date">>();
	const series30 = dailySeries(totals, 30);
	return {
		requestSeries: series30,
		tokenSeries: series30,
		activitySeries30: series30,
		requestChange: null,
		tokenChange: null,
		totalRequests: 0,
		totalTokens: 0,
		avgPerDay: 0,
		avgPerWeek: 0,
		currentStreak: 0,
		longestStreak: 0,
		activeDays: 0,
		topModels: [],
		modelActivity: [],
		heatmapDays: heatmap(totals),
		creditsUsage: { today: "$0.0000", week: "$0.0000", month: "$0.0000" },
		byokUsage: { today: "$0.0000", week: "$0.0000", month: "$0.0000" },
		usageWorkspaceCount: workspaceCount,
	};
}

async function buildProfileUsage(
	client: ReturnType<typeof getDataClient>,
	workspaceIds: string[],
) {
	if (!workspaceIds.length) return emptyProfileUsage();
	const rows = await usageAggregateRows(client, workspaceIds);
	const totals = new Map<string, Omit<DailyActivityPoint, "date">>();
	const models = new Map<string, { requests: number; tokens: number; spendNanos: number }>();
	const modelActivity = new Map<string, { date: string; id: string; requests: number; tokens: number; spendNanos: number }>();
	let totalRequests = 0;
	let totalTokens = 0;

	for (const row of rows) {
		if (!row.bucket) continue;
		const key = dateKey(row.bucket);
		const requests = Number(row.requests) || 0;
		const tokens = Number(row.tokens) || 0;
		const spendNanos = Math.round((Number(row.cost) || 0) * 1_000_000_000);
		totalRequests += requests;
		totalTokens += tokens;
		const day = totals.get(key) ?? { requests: 0, tokens: 0, spendNanos: 0 };
		day.requests += requests;
		day.tokens += tokens;
		day.spendNanos += spendNanos;
		totals.set(key, day);
		const modelId = String(row.model_id ?? "").trim() || "unknown";
		const model = models.get(modelId) ?? { requests: 0, tokens: 0, spendNanos: 0 };
		model.requests += requests;
		model.tokens += tokens;
		model.spendNanos += spendNanos;
		models.set(modelId, model);
		const modelDayKey = `${key}:${modelId}`;
		const modelDay = modelActivity.get(modelDayKey) ?? {
			date: key,
			id: modelId,
			requests: 0,
			tokens: 0,
			spendNanos: 0,
		};
		modelDay.requests += requests;
		modelDay.tokens += tokens;
		modelDay.spendNanos += spendNanos;
		modelActivity.set(modelDayKey, modelDay);
	}

	const modelIds = [...models.keys()].filter((id) => id !== "unknown");
	const modelNames = new Map<string, string>();
	if (modelIds.length) {
		const result = await client.from("v2_models").select("model_id:model_slug,name").in("model_slug", modelIds);
		if (result.error) throw new Error(result.error.message || "profile_usage_unavailable");
		for (const row of result.data ?? []) modelNames.set(String(row.model_id), String(row.name ?? row.model_id));
	}

	const series30 = dailySeries(totals, 30);
	const series60 = dailySeries(totals, 60);
	const streak = streaks(series30);
	const usd = (nanos: number) => `$${(nanos / 1_000_000_000).toFixed(4)}`;
	return {
		requestSeries: series30,
		tokenSeries: series30,
		activitySeries30: series30,
		requestChange: periodChange(series60.slice(-30).reduce((sum, item) => sum + item.requests, 0), series60.slice(0, 30).reduce((sum, item) => sum + item.requests, 0)),
		tokenChange: periodChange(series60.slice(-30).reduce((sum, item) => sum + item.tokens, 0), series60.slice(0, 30).reduce((sum, item) => sum + item.tokens, 0)),
		totalRequests,
		totalTokens,
		avgPerDay: streak.activeDays ? totalRequests / streak.activeDays : 0,
		avgPerWeek: totalRequests / 52,
		currentStreak: streak.current,
		longestStreak: streak.longest,
		activeDays: streak.activeDays,
		topModels: [...models.entries()]
			.map(([id, value]) => ({ id, name: modelNames.get(id) ?? id, ...value }))
			.sort((left, right) => right.tokens - left.tokens || right.requests - left.requests || right.spendNanos - left.spendNanos),
		modelActivity: [...modelActivity.values()]
			.map((entry) => ({ ...entry, name: modelNames.get(entry.id) ?? entry.id }))
			.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id)),
		heatmapDays: heatmap(totals),
		creditsUsage: {
			today: usd(series30.slice(-1).reduce((sum, item) => sum + item.spendNanos, 0)),
			week: usd(series30.slice(-7).reduce((sum, item) => sum + item.spendNanos, 0)),
			month: usd(series30.reduce((sum, item) => sum + item.spendNanos, 0)),
		},
		byokUsage: { today: "$0.0000", week: "$0.0000", month: "$0.0000" },
		usageWorkspaceCount: workspaceIds.length,
	};
}

export const accountSettingsProfileRouter = new Hono<{ Bindings: Env }>();

function recoveryCode(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const upperBound = 256 - (256 % alphabet.length);
	let code = "";
	while (code.length < 8) {
		const bytes = crypto.getRandomValues(new Uint8Array(8 - code.length));
		for (const byte of bytes) {
			if (byte < upperBound) code += alphabet[byte % alphabet.length];
		}
	}
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

async function recoveryHash(code: string): Promise<string> {
	const normalized = code.replaceAll("-", "").trim().toUpperCase();
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

accountSettingsProfileRouter.put("/account/profile", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const client = getDataClient(c.env);
	const update: Record<string, unknown> = { user_id: user.id };
	for (const field of ["display_name", "default_workspace_id", "obfuscate_info"] as const) if (body[field] !== undefined) update[field] = body[field];
	if (body.public_profile_slug !== undefined) {
		const slug = normalizePublicProfileSlug(body.public_profile_slug);
		if (slug.length < 3 || slug.length > 40) return c.json({ error: "invalid_public_profile_slug" }, 400, PRIVATE_NO_STORE_HEADERS);
		const current = await client.from("users").select("public_profile_slug").eq("user_id", user.id).maybeSingle();
		if (current.error) return c.json({ error: "profile_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		const previous = normalizePublicProfileSlug(current.data?.public_profile_slug);
		if (previous && previous !== slug) {
			const published = await client.from("presets").select("id").eq("created_by", user.id).eq("visibility", "public").limit(1).maybeSingle();
			if (published.error) return c.json({ error: "profile_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
			if (published.data) return c.json({ error: "public_profile_slug_in_use" }, 409, PRIVATE_NO_STORE_HEADERS);
		}
		update.public_profile_slug = slug;
	}
	if (body.public_profile_enabled !== undefined) {
		if (body.public_profile_enabled && !normalizePublicProfileSlug(update.public_profile_slug)) {
			const current = await client.from("users").select("public_profile_slug").eq("user_id", user.id).maybeSingle();
			if (current.error) return c.json({ error: "profile_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
			if (!normalizePublicProfileSlug(current.data?.public_profile_slug)) return c.json({ error: "public_profile_slug_required" }, 400, PRIVATE_NO_STORE_HEADERS);
		}
		update.public_profile_enabled = Boolean(body.public_profile_enabled);
	}
	if (body.default_workspace_id) {
		const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(body.default_workspace_id) });
		if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	const result = await client.from("users").upsert(update, { onConflict: "user_id" });
	if (result.error?.code === "23505") return c.json({ error: "public_profile_slug_conflict" }, 409, PRIVATE_NO_STORE_HEADERS);
	if (result.error) return c.json({ error: result.error.message }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProfileRouter.post("/account/recovery-codes", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const codes = Array.from({ length: 10 }, recoveryCode);
	const rows = await Promise.all(codes.map(async (code) => ({ user_id: user.id, code_hash: await recoveryHash(code), created_at: new Date().toISOString() })));
	const client = getDataClient(c.env);
	const removed = await client.from("user_recovery_codes").delete().eq("user_id", user.id);
	if (removed.error) return c.json({ error: "recovery_codes_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const inserted = await client.from("user_recovery_codes").insert(rows);
	if (inserted.error) return c.json({ error: "recovery_codes_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ recoveryCodes: codes }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProfileRouter.get("/account/recovery-codes", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const result = await getDataClient(c.env).from("user_recovery_codes").select("id").eq("user_id", user.id).is("used_at", null);
	if (result.error) return c.json({ error: "recovery_codes_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ hasRecoveryCodes: Boolean(result.data?.length), unusedCount: result.data?.length ?? 0 }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProfileRouter.delete("/account/recovery-codes", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const result = await getDataClient(c.env).from("user_recovery_codes").delete().eq("user_id", user.id);
	if (result.error) return c.json({ error: "recovery_codes_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProfileRouter.post("/account/recovery-codes/verify", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: { code?: string } = await c.req.json<{ code?: string }>().catch(() => ({}));
	const client = getDataClient(c.env);
	const found = await client.from("user_recovery_codes").select("id").eq("user_id", user.id).eq("code_hash", await recoveryHash(body.code ?? "")).is("used_at", null).limit(1).maybeSingle();
	if (found.error) return c.json({ error: "recovery_codes_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!found.data?.id) return c.json({ error: "Invalid or already used recovery code" }, 409, PRIVATE_NO_STORE_HEADERS);
	const updated = await client.from("user_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", found.data.id).eq("user_id", user.id);
	if (updated.error) return c.json({ error: "recovery_codes_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProfileRouter.get("/profile", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ obfuscateInfo: false, profile: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const userResult = await client.from("users").select("display_name,default_workspace_id,created_at,obfuscate_info,public_profile_enabled,public_profile_slug").eq("user_id", user.id).maybeSingle();
	if (userResult.error) return c.json({ error: "profile_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const displayName = String(userResult.data?.display_name ?? user.userMetadata.display_name ?? user.userMetadata.name ?? user.email?.split("@")[0] ?? "Phaseo User").trim() || "Phaseo User";
	const workspaceId = String(userResult.data?.default_workspace_id ?? "").trim() || null;
	const storedSlug = normalizePublicProfileSlug(userResult.data?.public_profile_slug) || null;
	const suggestedSlug = profileSlug(displayName, user.id);
	let workspaceName: string | null = "Personal";
	if (workspaceId) {
		const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
		if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
		const workspaceResult = await client.from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
		if (workspaceResult.error) return c.json({ error: "profile_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		workspaceName = String(workspaceResult.data?.name ?? "").trim() || workspaceName;
	}
	const profile = {
		userId: user.id, displayName, email: user.email, avatarUrl: typeof user.userMetadata.avatar_url === "string" ? user.userMetadata.avatar_url : null,
		memberSince: String(userResult.data?.created_at ?? user.createdAt), workspaceName, publicProfileEnabled: Boolean(userResult.data?.public_profile_enabled), publicProfileSlug: storedSlug,
		suggestedProfileSlug: suggestedSlug,
		shareUrl: storedSlug ? `https://phaseo.app/profile/${storedSlug}` : null,
		...emptyProfileUsage(),
	};
	const override = c.req.query("obfuscateInfo");
	return c.json({ obfuscateInfo: override === "1" ? true : override === "0" ? false : Boolean(userResult.data?.obfuscate_info), profile }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProfileRouter.get("/profile/usage", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ usage: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const membershipsResult = await client
		.from("workspace_members")
		.select("workspace_id")
		.eq("user_id", user.id)
		.limit(PROFILE_USAGE_MAX_WORKSPACES);
	if (membershipsResult.error) return c.json({ error: "profile_usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const workspaceIds = Array.from(new Set(
		(membershipsResult.data ?? [])
			.map((row) => String(row.workspace_id ?? "").trim())
			.filter(Boolean),
	));
	try {
		const usage = await buildProfileUsage(client, workspaceIds);
		return c.json({ usage }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch {
		return c.json({ error: "profile_usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsProfileRouter.get("/profile/games", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ games: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const result = await getDataClient(c.env)
		.from("catalogue_game_results")
		.select("game_key,puzzle_date,won,score,max_score,completed_at")
		.eq("user_id", user.id)
		.order("puzzle_date", { ascending: false })
		.limit(500);
	if (result.error) return c.json({ error: "profile_games_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ games: buildGameProfileSummary((result.data ?? []) as GameResultRow[]) }, 200, PRIVATE_NO_STORE_HEADERS);
});
