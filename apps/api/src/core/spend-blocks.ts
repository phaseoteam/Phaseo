// Purpose: Enforce spend rule blocks (grace-margin blocking) on the request path.
// Why: A block rule warns at its thresholds and then blocks once spend reaches its block
//      point; the request path must apply that without Postgres or added latency.
// How: The spend rules sweep (and every manual lift or rule change) publishes a compact
//      per-workspace entry to KV, `spend-blocks:v1:{workspace}`: active blocks, grace-margin
//      warnings and, for department scopes, who counts toward the department. No key means
//      nothing is active. Requests read it through the tiered cache (isolate memory for about a
//      minute, then KV) once per request context, after auth and model resolution, and before
//      provider dispatch (pipeline/execute: applySpendRuleBlocks):
//        * a block covering the request returns a 429 spend_rule_blocked with Retry-After set to
//          the block's reset; a provider block only removes that provider's routes, and the
//          request is refused only when no route is left;
//        * free routes are exempt unless the rule blocks free models;
//        * a warning covering the request adds x-phaseo-spend-warning to the response.
//      Every failure admits the request (fail open), and SPEND_RULE_BLOCKS_ENABLED gates both
//      the publish and the request path. A scheduled reconcile republishes every workspace with
//      block rules or blocks, and every key already in KV, so a missed publish cannot last.
//      Blocking is best effort: spend is evaluated every 5 minutes from the usage rollup, so a
//      block starts minutes after the limit and a lift reaches every isolate within a minute.
import { getBindingsIfConfigured, getCache, getSupabaseAdmin } from "@/runtime/env";
import { invalidateTieredL1, tieredRead } from "@core/tiered-cache";
import { err } from "@pipeline/before/http";
import type { PipelineContext } from "@pipeline/before/types";
import { isFreePriceCard } from "@pipeline/pricing/free";
import type { PriceCard } from "@pipeline/pricing";

export const SPEND_WARNING_HEADER = "x-phaseo-spend-warning";
export const SPEND_BLOCK_SCOPES = ["workspace", "key", "member", "department", "model", "provider"] as const;
export type SpendBlockScope = (typeof SPEND_BLOCK_SCOPES)[number];

export type SpendBlockItem = {
	id: string;
	rule_id: string | null;
	rule_name: string;
	scope_type: SpendBlockScope;
	scope_id: string | null;
	resets_at: string | null;
	block_free_models: boolean;
	limit_nanos: number;
};

export type SpendWarningItem = {
	rule_id: string;
	rule_name: string;
	scope_type: SpendBlockScope;
	scope_id: string | null;
	resets_at: string;
	block_free_models: boolean;
};

export type SpendBlockDepartment = { keys: string[]; users: string[]; exclude_keys: string[] };

/** public.get_workspace_spend_block_entry. */
export type SpendBlockEntry = {
	v: 1;
	workspace_id: string;
	generated_at: string;
	expires_at: string | null;
	blocks: SpendBlockItem[];
	warnings: SpendWarningItem[];
	departments: Record<string, SpendBlockDepartment>;
};

/** Who and what one request (or one of its provider routes) is. */
export type SpendSubject = {
	/** The API key; null for OAuth-token requests, which carry a client id instead. */
	keyId: string | null;
	/** The key's creator, the delegated key's user or the OAuth user. */
	actorUserId: string | null;
	/** Model ids the request resolves to (the rollup's model_id). */
	models: readonly string[];
	/** The provider of the route; null when the check is not for one route. */
	provider: string | null;
	/** Whether the route is free (every price is zero). */
	free: boolean;
};

const PAGE_SIZE = 1000;
const MAX_PUBLISH_ATTEMPTS = 3;
const MAX_RECONCILE_WORKSPACES = 2000;
const KV_MIN_EXPIRATION_S = 60;
/** At most this many warnings are named in the header. */
const MAX_WARNING_HEADER_ITEMS = 3;

export const spendBlocksKey = (workspaceId: string) => `spend-blocks:v1:${workspaceId}`;

export function spendRuleBlocksEnabled(): boolean {
	return getBindingsIfConfigured()?.SPEND_RULE_BLOCKS_ENABLED === "true";
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const isScope = (value: unknown): value is SpendBlockScope => SPEND_BLOCK_SCOPES.includes(value as SpendBlockScope);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

function isItemBase(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object") return false;
	const item = value as Record<string, unknown>;
	return isString(item.rule_name) && isScope(item.scope_type) && isNullableString(item.scope_id)
		&& (item.scope_type === "workspace") === (item.scope_id === null) && typeof item.block_free_models === "boolean";
}

export function isSpendBlockEntry(value: unknown): value is SpendBlockEntry {
	if (!value || typeof value !== "object") return false;
	const entry = value as Partial<SpendBlockEntry>;
	if (entry.v !== 1 || !Array.isArray(entry.blocks) || !Array.isArray(entry.warnings)) return false;
	if (!entry.departments || typeof entry.departments !== "object" || Array.isArray(entry.departments)) return false;
	const blocksValid = entry.blocks.every((block) => isItemBase(block) && isString(block.id) && isNullableString(block.rule_id)
		&& isNullableString(block.resets_at));
	const warningsValid = entry.warnings.every((warning) => isItemBase(warning) && isString(warning.rule_id) && isString(warning.resets_at));
	const departmentsValid = Object.values(entry.departments).every((department) => Boolean(department)
		&& isStringArray(department.keys) && isStringArray(department.users) && isStringArray(department.exclude_keys));
	return blocksValid && warningsValid && departmentsValid;
}

// ---- Matching. An entry read from the isolate cache is the same object for every request until
// it is replaced, so its lookup sets and reset times are prepared once per entry object.

type PreparedItem<T> = {
	item: T;
	resetMs: number;
	department: { keys: Set<string>; users: Set<string>; excludeKeys: Set<string> } | null;
};
type PreparedEntry = { blocks: PreparedItem<SpendBlockItem>[]; warnings: PreparedItem<SpendWarningItem>[] };

const prepared = new WeakMap<SpendBlockEntry, PreparedEntry>();

function prepareEntry(entry: SpendBlockEntry): PreparedEntry {
	const cached = prepared.get(entry);
	if (cached) return cached;
	const departments = new Map<string, PreparedItem<unknown>["department"]>();
	const departmentOf = (scopeId: string | null) => {
		const id = scopeId?.toLowerCase() ?? "";
		if (!departments.has(id)) {
			const department = entry.departments[id] ?? entry.departments[scopeId ?? ""];
			departments.set(id, department ? {
				keys: new Set(department.keys.map((key) => key.toLowerCase())),
				users: new Set(department.users.map((user) => user.toLowerCase())),
				excludeKeys: new Set(department.exclude_keys.map((key) => key.toLowerCase())),
			} : null);
		}
		return departments.get(id) ?? null;
	};
	const prepare = <T extends { scope_type: SpendBlockScope; scope_id: string | null; resets_at: string | null }>(item: T): PreparedItem<T> => ({
		item,
		resetMs: item.resets_at ? Date.parse(item.resets_at) : Number.POSITIVE_INFINITY,
		department: item.scope_type === "department" ? departmentOf(item.scope_id) : null,
	});
	const result = { blocks: entry.blocks.map(prepare), warnings: entry.warnings.map(prepare) };
	prepared.set(entry, result);
	return result;
}

function covers(prepared: PreparedItem<SpendBlockItem | SpendWarningItem>, subject: SpendSubject, nowMs: number): boolean {
	const { item } = prepared;
	if (!(prepared.resetMs > nowMs)) return false; // past its reset (or unparseable): never enforced
	if (subject.free && !item.block_free_models) return false;
	const scopeId = item.scope_id ?? "";
	switch (item.scope_type) {
		case "workspace":
			return true;
		case "key":
			return Boolean(subject.keyId) && subject.keyId!.toLowerCase() === scopeId.toLowerCase();
		case "member":
			return Boolean(subject.actorUserId) && subject.actorUserId!.toLowerCase() === scopeId.toLowerCase();
		case "department": {
			const department = prepared.department;
			if (!department) return false;
			const keyId = subject.keyId?.toLowerCase() ?? null;
			if (keyId && department.keys.has(keyId)) return true;
			if (keyId && department.excludeKeys.has(keyId)) return false;
			return Boolean(subject.actorUserId) && department.users.has(subject.actorUserId!.toLowerCase());
		}
		case "model":
			return subject.models.includes(scopeId);
		case "provider":
			return subject.provider !== null && subject.provider === scopeId;
		default:
			return false;
	}
}

/** The first active block that covers the subject, or null. Pure; no I/O. */
export function findSpendBlock(entry: SpendBlockEntry | null, subject: SpendSubject, nowMs = Date.now()): SpendBlockItem | null {
	if (!entry || !entry.blocks.length) return null;
	for (const block of prepareEntry(entry).blocks) if (covers(block, subject, nowMs)) return block.item;
	return null;
}

/** Every grace-margin warning that covers the subject. Pure; no I/O. */
export function findSpendWarnings(entry: SpendBlockEntry | null, subject: SpendSubject, nowMs = Date.now()): SpendWarningItem[] {
	if (!entry || !entry.warnings.length) return [];
	return prepareEntry(entry).warnings.filter((warning) => covers(warning, subject, nowMs)).map((warning) => warning.item);
}

// ---- Reading.

/** The workspace's published entry, or null when it has none. Never throws (fails open). */
export async function readSpendBlockEntry(workspaceId: string): Promise<SpendBlockEntry | null> {
	try {
		return await tieredRead<SpendBlockEntry>({
			key: spendBlocksKey(workspaceId),
			// Only the publisher writes entries; a missing key means nothing is active.
			loader: async () => null,
			l1FreshMs: 60_000,
			negativeFreshMs: 30_000,
			l2: false,
			l3: { freshS: 60 },
			isShareable: () => false,
			isFreshInL3: () => true,
			validate: isSpendBlockEntry,
		});
	} catch (error) {
		console.warn("spend_block_entry_read_failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
		return null;
	}
}

// ---- Publishing.

/** public.get_workspace_spend_block_entry: the entry, or null when nothing is active. */
export async function buildSpendBlockEntry(workspaceId: string): Promise<SpendBlockEntry | null> {
	const { data, error } = await getSupabaseAdmin().rpc("get_workspace_spend_block_entry", { p_workspace_id: workspaceId });
	if (error) throw new Error(error.message || "Failed to build the spend block entry");
	if (data == null) return null;
	if (!isSpendBlockEntry(data)) throw new Error("spend_block_entry_invalid");
	return data;
}

/** The entry without its build time, to tell whether anything changed. */
function comparable(entry: SpendBlockEntry | null): string {
	if (!entry) return "null";
	const { generated_at: _generatedAt, ...rest } = entry;
	return JSON.stringify(rest);
}

/** KV expiry in seconds: no later than the earliest reset (KV's minimum is 60 s). */
export function spendBlockEntryExpirationS(entry: SpendBlockEntry, nowMs = Date.now()): number | undefined {
	const expiresMs = entry.expires_at ? Date.parse(entry.expires_at) : NaN;
	if (!Number.isFinite(expiresMs)) return undefined;
	return Math.max(KV_MIN_EXPIRATION_S, Math.ceil((expiresMs - nowMs) / 1000));
}

async function storedEntry(kv: KVNamespace, key: string): Promise<SpendBlockEntry | null> {
	const raw = await kv.get(key, "text");
	if (!raw) return null;
	try {
		const envelope = JSON.parse(raw) as { v?: unknown };
		return isSpendBlockEntry(envelope?.v) ? envelope.v : null;
	} catch {
		return null;
	}
}

/**
 * Rebuilds and stores a workspace's entry after a sweep, a lift or a rule change: deletes the
 * key when nothing is active, and skips the write when the stored entry is already current.
 * Never throws: the database change has already happened, so a failure is logged and the
 * scheduled reconcile repairs it. Does nothing while SPEND_RULE_BLOCKS_ENABLED is off.
 */
export async function publishSpendBlockEntry(workspaceId: string): Promise<boolean> {
	const key = spendBlocksKey(workspaceId);
	try {
		if (!spendRuleBlocksEnabled()) return false;
		const kv = getCache();
		let entry = await buildSpendBlockEntry(workspaceId);
		// A concurrent publish that read the database earlier can store an older entry after this
		// one. Re-reading after each write and storing again until nothing changed means the
		// publish that writes last stores the newest state (as rate limit plans do).
		for (let attempt = 0; attempt < MAX_PUBLISH_ATTEMPTS; attempt++) {
			const stored = await storedEntry(kv, key);
			if (comparable(stored) !== comparable(entry)) {
				if (!entry) await kv.delete(key);
				// Same envelope as the tiered cache's KV layer (`{ v, at }`).
				else await kv.put(key, JSON.stringify({ v: entry, at: Date.now() }), { expirationTtl: spendBlockEntryExpirationS(entry) });
			}
			const latest = await buildSpendBlockEntry(workspaceId);
			if (comparable(latest) === comparable(entry)) break;
			entry = latest;
		}
		invalidateTieredL1(key);
		return true;
	} catch (error) {
		console.error("spend_block_entry_publish_failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
		return false;
	}
}

/** Publishes several workspaces' entries, one at a time. */
export async function publishSpendBlockEntries(workspaceIds: Iterable<string>): Promise<{ published: number; failed: number }> {
	let published = 0;
	let failed = 0;
	for (const workspaceId of new Set(workspaceIds)) {
		if (await publishSpendBlockEntry(workspaceId)) published++;
		else failed++;
	}
	return { published, failed };
}

/**
 * Republishes every workspace with an enabled block rule or an active block, and every key
 * already in KV (so entries whose blocks are gone are deleted). Run on a schedule.
 */
export async function reconcileSpendBlockEntries(): Promise<{ workspaces: number; published: number; failed: number; truncated: boolean }> {
	if (!spendRuleBlocksEnabled()) return { workspaces: 0, published: 0, failed: 0, truncated: false };
	const workspaceIds = new Set<string>();
	const { data, error } = await getSupabaseAdmin().rpc("list_spend_block_workspaces", { p_limit: MAX_RECONCILE_WORKSPACES });
	if (error) throw new Error(error.message || "Failed to list spend block workspaces");
	for (const row of (Array.isArray(data) ? data : []) as unknown[]) {
		const id = typeof row === "string" ? row : (row as Record<string, unknown> | null)?.list_spend_block_workspaces;
		if (typeof id === "string") workspaceIds.add(id);
	}
	const prefix = spendBlocksKey("");
	let cursor: string | undefined;
	do {
		const page = await getCache().list({ prefix, cursor, limit: PAGE_SIZE });
		for (const { name } of page.keys) workspaceIds.add(name.slice(prefix.length));
		cursor = page.list_complete ? undefined : (page as { cursor?: string }).cursor;
	} while (cursor && workspaceIds.size < MAX_RECONCILE_WORKSPACES);
	const targets = [...workspaceIds].slice(0, MAX_RECONCILE_WORKSPACES);
	const { published, failed } = await publishSpendBlockEntries(targets);
	return { workspaces: targets.length, published, failed, truncated: workspaceIds.size > MAX_RECONCILE_WORKSPACES || Boolean(cursor) };
}

// ---- The request path.

type RequestState = {
	blocked: SpendBlockItem | null;
	warnings: SpendWarningItem[];
};

/** Entry reads happen once per request context, not once per model fallback or attempt. */
const pendingEntries = new WeakMap<PipelineContext, Promise<SpendBlockEntry | null>>();
const requestStates = new WeakMap<PipelineContext, RequestState>();

function entryFor(ctx: PipelineContext): Promise<SpendBlockEntry | null> {
	let pending = pendingEntries.get(ctx);
	if (!pending) {
		pending = readSpendBlockEntry(ctx.workspaceId);
		pendingEntries.set(ctx, pending);
	}
	return pending;
}

/** The request's subject without a route: provider and free are filled in per route. */
export function spendSubjectFor(ctx: PipelineContext, baseModel?: string | null): Omit<SpendSubject, "provider" | "free"> {
	// OAuth-token requests carry the OAuth client id in place of a key id.
	const keyId = ctx.meta?.authMethod === "oauth" ? null : ctx.keyId || null;
	const models = [...new Set([ctx.model, baseModel].filter((model): model is string => typeof model === "string" && model.length > 0))];
	return { keyId, actorUserId: ctx.quotaUserId || null, models };
}

type Candidate = { providerId?: string | null; pricingCard?: PriceCard | null };

function describeScope(item: SpendBlockItem): string {
	switch (item.scope_type) {
		case "workspace": return "in this workspace";
		case "key": return "with this API key";
		case "member": return "by this workspace member";
		case "department": return "from this department";
		case "model": return `to ${item.scope_id}`;
		default: return `routed to ${item.scope_id}`;
	}
}

/** Seconds until the block's reset, for Retry-After; null when it has none. */
export function spendBlockRetryAfterSeconds(item: SpendBlockItem, nowMs = Date.now()): number | null {
	const resetMs = item.resets_at ? Date.parse(item.resets_at) : NaN;
	return Number.isFinite(resetMs) ? Math.max(1, Math.ceil((resetMs - nowMs) / 1000)) : null;
}

/** The 429, in the same shape as the budget and key-limit 429s. */
export function spendBlockedResponse(ctx: Pick<PipelineContext, "requestId" | "workspaceId">, item: SpendBlockItem, nowMs = Date.now()): Response {
	const until = item.resets_at ? `until ${new Date(item.resets_at).toISOString()}` : "until spend falls below its limit";
	const response = err("spend_rule_blocked", {
		reason: "spend_rule_block",
		rule_id: item.rule_id,
		rule_name: item.rule_name,
		block_id: item.id,
		limit_scope: item.scope_type,
		reset_at: item.resets_at,
		now: new Date(nowMs).toISOString(),
		limit_metric: "cost",
		limit_value: item.limit_nanos / 1_000_000_000,
		description: `Requests ${describeScope(item)} are blocked by the spend rule "${item.rule_name}" ${until}.`
			+ (item.block_free_models ? "" : " Free models still work.")
			+ " An owner or admin can lift the block in Settings > Notifications.",
		error_origin: "user",
		request_id: ctx.requestId,
		workspace_id: ctx.workspaceId,
	});
	const retryAfter = spendBlockRetryAfterSeconds(item, nowMs);
	if (retryAfter != null) response.headers.set("Retry-After", String(retryAfter));
	return response;
}

/**
 * Applies the workspace's spend blocks to a request's routes before any is dispatched: drops the
 * routes a block covers (a provider block only covers that provider; free routes only when the
 * rule blocks free models) and returns the 429 when none is left. Records the warnings that
 * cover every remaining route, for the response header. Fails open.
 */
export async function applySpendRuleBlocks<T extends Candidate>(
	ctx: PipelineContext,
	candidates: T[],
	baseModel?: string | null,
): Promise<{ candidates: T[]; response?: undefined } | { response: Response; candidates?: undefined }> {
	if (ctx.internal || ctx.classifierSubrequest || !candidates.length || !spendRuleBlocksEnabled()) return { candidates };
	try {
		const entry = await entryFor(ctx);
		if (!entry || (!entry.blocks.length && !entry.warnings.length)) return { candidates };
		const nowMs = Date.now();
		const base = spendSubjectFor(ctx, baseModel);
		const kept: T[] = [];
		const keptSubjects: SpendSubject[] = [];
		const excluded: Array<{ provider: string | null; rule_id: string | null }> = [];
		let blocked: SpendBlockItem | null = null;
		for (const candidate of candidates) {
			const subject: SpendSubject = { ...base, provider: candidate.providerId ?? null, free: isFreePriceCard(candidate.pricingCard ?? null) };
			const block = findSpendBlock(entry, subject, nowMs);
			if (!block) {
				kept.push(candidate);
				keptSubjects.push(subject);
				continue;
			}
			excluded.push({ provider: subject.provider, rule_id: block.rule_id });
			// Name a block that covers the whole request over one that covers a single provider.
			if (!blocked || (blocked.scope_type === "provider" && block.scope_type !== "provider")) blocked = block;
		}
		if (excluded.length) {
			ctx.routingDiagnostics = { ...(ctx.routingDiagnostics ?? {}), spendRuleBlocks: { excluded } };
		}
		if (!kept.length && blocked) {
			requestStates.set(ctx, { blocked, warnings: [] });
			return { response: spendBlockedResponse(ctx, blocked, nowMs) };
		}
		// A warning applies when it covers every route the request may take.
		const [first, ...rest] = keptSubjects;
		const warnings = first
			? findSpendWarnings(entry, first, nowMs).filter((warning) =>
				rest.every((subject) => findSpendWarnings(entry, subject, nowMs).some((other) => other.rule_id === warning.rule_id)))
			: [];
		requestStates.set(ctx, { blocked: null, warnings });
		return { candidates: kept };
	} catch (error) {
		console.warn("spend_rule_block_check_failed", { error: error instanceof Error ? error.message : String(error) });
		return { candidates };
	}
}

/**
 * True when this request was refused by a block that every other model would meet too
 * (workspace, key, member or department scope), so model fallbacks are not tried. A model or
 * provider block leaves fallbacks to other models and routes.
 */
export function rejectedBySpendBlockForEveryModel(ctx: PipelineContext): boolean {
	const scope = requestStates.get(ctx)?.blocked?.scope_type;
	return scope === "workspace" || scope === "key" || scope === "member" || scope === "department";
}

/** `rule_id=…; scope=…; resets_at=…`, comma-separated, for the warnings that applied. */
export function spendWarningHeaderValue(warnings: readonly SpendWarningItem[]): string | null {
	if (!warnings.length) return null;
	return warnings.slice(0, MAX_WARNING_HEADER_ITEMS)
		.map((warning) => `rule_id=${warning.rule_id}; scope=${warning.scope_type}; resets_at=${new Date(warning.resets_at).toISOString()}`)
		.join(", ");
}

/** Adds x-phaseo-spend-warning to the response when a grace-margin warning covered the request. */
export function withSpendWarningHeader(response: Response, ctx: PipelineContext): Response {
	const value = spendWarningHeaderValue(requestStates.get(ctx)?.warnings ?? []);
	if (!value || response.status === 101) return response;
	try {
		response.headers.set(SPEND_WARNING_HEADER, value);
		return response;
	} catch {
		// Proxied responses may carry immutable headers.
		const headers = new Headers(response.headers);
		headers.set(SPEND_WARNING_HEADER, value);
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
	}
}
