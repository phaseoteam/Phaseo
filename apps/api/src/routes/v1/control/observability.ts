// Purpose: Public observability destination management.
// Why: Durable dashboard observability settings must be automatable.
// How: Stores write-only encrypted credentials and bounded key/rule filters.

import { Hono } from "hono";
import { setKeyVersion } from "@/core/kv";
import { validateWebhookEndpointUrl } from "@/core/webhook-endpoints";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { json, withRuntime } from "@/routes/utils";
import { internalServerError, requireCapability, requireOAuthWorkspaceRole } from "./route-helpers";
import { encryptBroadcastConfig } from "./broadcast-config-crypto";
import {
	AVAILABLE_BROADCAST_DESTINATION_IDS,
	BROADCAST_RULE_CONDITIONS,
	BROADCAST_RULE_FIELDS,
	broadcastDestinationEndpoint,
	isBroadcastDestinationLimitError,
	OTLP_PROTOCOLS,
	otlpProtocol,
} from "@/observability/broadcast-destinations";

const NO_STORE = { "Cache-Control": "no-store" };
const TYPES = new Set<string>(AVAILABLE_BROADCAST_DESTINATION_IDS);
const FIELDS = new Set<string>(BROADCAST_RULE_FIELDS);
const CONDITIONS = new Set<string>(BROADCAST_RULE_CONDITIONS);
const COLUMNS = "id,workspace_id,destination_id,name,enabled,privacy_exclude_prompts_and_outputs,sampling_rate,group_join_operator,include_generation_metadata,include_cost_metadata,include_identity_metadata,include_request_context,destination_config_ciphertext,created_at,updated_at";

type KeyFilter = { key_id: string; mode: "include" | "exclude" };
type Rule = { field: string; condition: string; value: string | null };
type RuleGroup = { match: "and" | "or"; rules: Rule[] };

function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function pathId(url: URL): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const index = segments.lastIndexOf("destinations");
	const value = index >= 0 ? segments[index + 1] : segments.length > 1 ? segments.at(-1) : null;
	return value ? decodeURIComponent(value).trim() || null : null;
}

function page(url: URL) {
	const offset = Number(url.searchParams.get("offset") ?? "0");
	const limit = Number(url.searchParams.get("limit") ?? "100");
	return Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 100 ? { offset, limit } : null;
}

function config(value: unknown): Record<string, string> | null {
	const input = object(value);
	if (!input) return null;
	const entries = Object.entries(input);
	if (!entries.length || entries.length > 30 || entries.some(([key, item]) => !key.trim() || key.length > 100 || typeof item !== "string" || item.length > 10_000)) return null;
	return Object.fromEntries(entries.map(([key, item]) => [key.trim(), String(item)]));
}

function validateEndpoint(type: string, values: Record<string, string>) {
	let url: URL;
	try { url = new URL(broadcastDestinationEndpoint(type, values)); } catch { throw new Error("Destination endpoint must be a valid absolute URL"); }
	if (url.protocol !== "https:" || url.username || url.password) throw new Error("Destination endpoint must use HTTPS without URL credentials");
	const validated = validateWebhookEndpointUrl(url.toString());
	if (!validated.ok) throw new Error("Private or loopback destination addresses are not allowed");
	if (type !== "webhook") {
		if (!otlpProtocol(values)) throw new Error(`otlp_protocol must be one of: ${OTLP_PROTOCOLS.join(", ")}`);
		return;
	}
	const method = String(values.method ?? "POST").toUpperCase();
	if (method !== "POST" && method !== "PUT") throw new Error("Webhook method must be POST or PUT");
	if (values.headers_json?.trim()) {
		let headers: unknown;
		try { headers = JSON.parse(values.headers_json); } catch { throw new Error("Webhook headers must be valid JSON"); }
		if (!object(headers) || Object.values(headers as Record<string, unknown>).some((item) => typeof item !== "string")) throw new Error("Webhook headers must contain string values");
	}
}

function keyFilters(value: unknown): KeyFilter[] | null {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > 100) return null;
	const output: KeyFilter[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		const row = object(item);
		const keyId = String(row?.key_id ?? "").trim();
		const mode = String(row?.mode ?? "").trim();
		if (!keyId || seen.has(keyId) || (mode !== "include" && mode !== "exclude")) return null;
		seen.add(keyId);
		output.push({ key_id: keyId, mode });
	}
	return output;
}

function ruleGroups(value: unknown): RuleGroup[] | null {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > 10) return null;
	const output: RuleGroup[] = [];
	for (const item of value) {
		const input = object(item);
		const match = input?.match === "and" ? "and" : input?.match === "or" ? "or" : null;
		if (!match || !Array.isArray(input?.rules) || input.rules.length < 1 || input.rules.length > 20) return null;
		const rules: Rule[] = [];
		for (const itemRule of input.rules) {
			const inputRule = object(itemRule);
			const field = String(inputRule?.field ?? "").trim();
			const condition = String(inputRule?.condition ?? "").trim();
			const valueless = condition === "exists" || condition === "not_exists";
			const valueText = valueless ? null : String(inputRule?.value ?? "").trim();
			if (!FIELDS.has(field) || !CONDITIONS.has(condition) || (!valueless && (!valueText || valueText.length > (condition === "matches_regex" ? 128 : 2_000)))) return null;
			rules.push({ field, condition, value: valueText });
		}
		output.push({ match, rules });
	}
	return output;
}

function payload(body: Record<string, unknown>, partial: boolean) {
	const data: Record<string, unknown> = {};
	if (!partial || body.name !== undefined) {
		const name = String(body.name ?? "").trim();
		if (!name || name.length > 200) return { error: "name must be 1-200 characters" } as const;
		data.name = name;
	}
	if (!partial || body.enabled !== undefined) data.enabled = body.enabled !== false;
	if (!partial || body.privacy_mode !== undefined) data.privacy_exclude_prompts_and_outputs = body.privacy_mode === true;
	if (!partial || body.sampling_rate !== undefined) {
		const rate = Number(body.sampling_rate ?? 1);
		if (!Number.isFinite(rate) || rate < 0.0001 || rate > 1) return { error: "sampling_rate must be between 0.0001 and 1" } as const;
		data.sampling_rate = rate;
	}
	if (!partial || body.group_join !== undefined) {
		const join = String(body.group_join ?? "or");
		if (join !== "and" && join !== "or") return { error: "group_join must be and or or" } as const;
		data.group_join_operator = join;
	}
	for (const field of ["include_generation_metadata", "include_cost_metadata", "include_identity_metadata", "include_request_context"] as const) {
		if (!partial || body[field] !== undefined) data[field] = body[field] !== false;
	}
	return { data } as const;
}

async function authorize(req: Request, capability: string) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const scopeError = requireCapability(auth.value, capability);
	if (scopeError) return { response: scopeError } as const;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return { response: roleError } as const;
	return { auth: auth.value } as const;
}

async function load(workspaceId: string, id: string) {
	const { data, error } = await getSupabaseAdmin().from("workspace_broadcast_destinations").select(COLUMNS).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw new Error(error.message || "Failed to load observability destination");
	return data as Record<string, any> | null;
}

async function relations(ids: string[]) {
	if (!ids.length) return { keys: [] as any[], groups: [] as any[], rules: [] as any[] };
	const client = getSupabaseAdmin();
	const [keys, groups] = await Promise.all([
		client.from("broadcast_destination_keys").select("destination_id,key_id,filter_mode").in("destination_id", ids),
		client.from("broadcast_destination_rule_groups").select("id,destination_id,match_operator,position").in("destination_id", ids).order("position", { ascending: true }),
	]);
	if (keys.error || groups.error) throw new Error(keys.error?.message || groups.error?.message || "Failed to load destination filters");
	const groupIds = (groups.data ?? []).map((row) => String(row.id));
	const rules = groupIds.length ? await client.from("broadcast_destination_rules").select("rule_group_id,field,condition,value,position").in("rule_group_id", groupIds).order("position", { ascending: true }) : { data: [], error: null };
	if (rules.error) throw new Error(rules.error.message || "Failed to load destination rules");
	return { keys: keys.data ?? [], groups: groups.data ?? [], rules: rules.data ?? [] };
}

function format(row: Record<string, any>, links: Awaited<ReturnType<typeof relations>>) {
	return {
		id: row.id, workspace_id: row.workspace_id, type: row.destination_id, name: row.name,
		enabled: Boolean(row.enabled), privacy_mode: Boolean(row.privacy_exclude_prompts_and_outputs), sampling_rate: Number(row.sampling_rate ?? 1),
		group_join: row.group_join_operator === "and" ? "and" : "or",
		include_generation_metadata: row.include_generation_metadata !== false, include_cost_metadata: row.include_cost_metadata !== false,
		include_identity_metadata: row.include_identity_metadata !== false, include_request_context: row.include_request_context !== false,
		key_filters: links.keys.filter((item) => item.destination_id === row.id).map((item) => ({ key_id: item.key_id, mode: item.filter_mode })),
		rule_groups: links.groups.filter((item) => item.destination_id === row.id).map((group) => ({ match: group.match_operator, rules: links.rules.filter((rule) => rule.rule_group_id === group.id).map((rule) => ({ field: rule.field, condition: rule.condition, value: rule.value ?? null })) })),
		configured: Boolean(row.destination_config_ciphertext), created_at: row.created_at ?? null, updated_at: row.updated_at ?? null,
	};
}

async function validateKeys(workspaceId: string, filters: KeyFilter[]) {
	if (!filters.length) return;
	const ids = filters.map((item) => item.key_id);
	const { data, error } = await getSupabaseAdmin().from("keys").select("id").eq("workspace_id", workspaceId).neq("status", "deleted").in("id", ids);
	if (error) throw new Error(error.message || "Failed to validate destination API keys");
	if ((data ?? []).length !== ids.length) throw new Error("One or more API keys are unavailable");
}

async function replaceRelations(workspaceId: string, id: string, filters: KeyFilter[] | undefined, groups: RuleGroup[] | undefined) {
	const { error } = await getSupabaseAdmin().rpc("replace_broadcast_destination_relations", {
		p_workspace_id: workspaceId,
		p_destination_id: id,
		p_filters: filters === undefined ? null : filters,
		p_groups: groups === undefined ? null : groups,
	});
	if (error) throw new Error(error.message || "Failed to replace destination filters");
}

async function listDestinations(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_READ); if ("response" in access) return access.response;
	const pagination = page(new URL(req.url)); if (!pagination) return json({ error: "bad_request", message: "Invalid pagination" }, 400, NO_STORE);
	try {
		const { data, error, count } = await getSupabaseAdmin().from("workspace_broadcast_destinations").select(COLUMNS, { count: "exact" }).eq("workspace_id", access.auth.workspaceId).in("destination_id", Array.from(TYPES)).order("created_at", { ascending: false }).range(pagination.offset, pagination.offset + pagination.limit - 1);
		if (error) throw new Error(error.message || "Failed to list observability destinations");
		const rows = (data ?? []) as Array<Record<string, any>>; const links = await relations(rows.map((row) => String(row.id)));
		return json({ data: rows.map((row) => format(row, links)), total_count: count ?? rows.length }, 200, NO_STORE);
	} catch (error) { return internalServerError("observability.destinations.list", error); }
}

async function getDestination(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_READ); if ("response" in access) return access.response;
	const id = pathId(new URL(req.url)); if (!id) return json({ error: "bad_request", message: "Destination id is required" }, 400, NO_STORE);
	try {
		const row = await load(access.auth.workspaceId, id); if (!row || !TYPES.has(String(row.destination_id))) return json({ error: "not_found", message: "Observability destination not found" }, 404, NO_STORE);
		return json({ data: format(row, await relations([id])) }, 200, NO_STORE);
	} catch (error) { return internalServerError("observability.destinations.get", error); }
}

async function createDestination(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_WRITE); if ("response" in access) return access.response;
	const body = await req.json<Record<string, unknown>>().catch(() => null); if (!body) return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, NO_STORE);
	const type = String(body.type ?? "").trim(); const secretConfig = config(body.config); const normalized = payload(body, false); const filters = keyFilters(body.key_filters); const groups = ruleGroups(body.rule_groups);
	if (!TYPES.has(type)) return json({ error: "bad_request", message: `type must be one of: ${AVAILABLE_BROADCAST_DESTINATION_IDS.join(", ")}` }, 400, NO_STORE);
	if (!secretConfig) return json({ error: "bad_request", message: "config must be a non-empty string map" }, 400, NO_STORE);
	if ("error" in normalized) return json({ error: "bad_request", message: normalized.error }, 400, NO_STORE);
	if (!filters || !groups) return json({ error: "bad_request", message: "Invalid key_filters or rule_groups" }, 400, NO_STORE);
	try { validateEndpoint(type, secretConfig); } catch (error) { return json({ error: "bad_request", message: String((error as Error).message) }, 400, NO_STORE); }
	let id: string | null = null;
	try {
		await validateKeys(access.auth.workspaceId, filters); const encrypted = await encryptBroadcastConfig(secretConfig); const client = getSupabaseAdmin();
		const created = await client.from("workspace_broadcast_destinations").insert({ workspace_id: access.auth.workspaceId, destination_id: type, destination_config: {}, destination_config_ciphertext: encrypted.ciphertext, destination_config_iv: encrypted.iv, destination_config_key_version: encrypted.keyVersion, ...normalized.data }).select(COLUMNS).maybeSingle();
		if (isBroadcastDestinationLimitError(created.error)) return json({ error: "destination_limit_reached", message: "Destination limit reached for this type" }, 400, NO_STORE);
		if (created.error || !created.data?.id) throw new Error(created.error?.message || "Failed to create observability destination");
		id = String(created.data.id); await replaceRelations(access.auth.workspaceId, id, filters, groups);
		await recordWorkspaceAuditEvent(client, { workspaceId: access.auth.workspaceId, actorUserId: access.auth.userId, action: "observability.destination.created", targetType: "observability_destination", targetId: id, targetName: String(created.data.name), metadata: { type }, requestId: access.auth.requestId });
		return json({ data: format(created.data, await relations([id])) }, 201, NO_STORE);
	} catch (error) {
		if (id) await getSupabaseAdmin().from("workspace_broadcast_destinations").delete().eq("id", id).eq("workspace_id", access.auth.workspaceId);
		return internalServerError("observability.destinations.create", error);
	}
}

async function updateDestination(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_WRITE); if ("response" in access) return access.response;
	const id = pathId(new URL(req.url)); if (!id) return json({ error: "bad_request", message: "Destination id is required" }, 400, NO_STORE);
	const body = await req.json<Record<string, unknown>>().catch(() => null); if (!body) return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, NO_STORE);
	const normalized = payload(body, true); const filters = body.key_filters === undefined ? undefined : keyFilters(body.key_filters); const groups = body.rule_groups === undefined ? undefined : ruleGroups(body.rule_groups);
	if ("error" in normalized) return json({ error: "bad_request", message: normalized.error }, 400, NO_STORE);
	if (filters === null || groups === null) return json({ error: "bad_request", message: "Invalid key_filters or rule_groups" }, 400, NO_STORE);
	try {
		const existing = await load(access.auth.workspaceId, id); if (!existing || !TYPES.has(String(existing.destination_id))) return json({ error: "not_found", message: "Observability destination not found" }, 404, NO_STORE);
		if (filters) await validateKeys(access.auth.workspaceId, filters); const update = { ...normalized.data };
		if (body.config !== undefined) {
			const nextConfig = config(body.config); if (!nextConfig) return json({ error: "bad_request", message: "config must be a non-empty string map" }, 400, NO_STORE);
			try { validateEndpoint(String(existing.destination_id), nextConfig); } catch (error) { return json({ error: "bad_request", message: String((error as Error).message) }, 400, NO_STORE); }
			const encrypted = await encryptBroadcastConfig(nextConfig);
			Object.assign(update, { destination_config: {}, destination_config_ciphertext: encrypted.ciphertext, destination_config_iv: encrypted.iv, destination_config_key_version: encrypted.keyVersion });
		}
		if (!Object.keys(update).length && filters === undefined && groups === undefined) return json({ error: "bad_request", message: "No supported fields were provided" }, 400, NO_STORE);
		const client = getSupabaseAdmin(); let row = existing;
		if (Object.keys(update).length) {
			const result = await client.from("workspace_broadcast_destinations").update({ ...update, updated_at: new Date().toISOString() }).eq("workspace_id", access.auth.workspaceId).eq("id", id).select(COLUMNS).maybeSingle();
			if (result.error || !result.data) throw new Error(result.error?.message || "Failed to update observability destination"); row = result.data;
		}
		await replaceRelations(access.auth.workspaceId, id, filters, groups);
		await recordWorkspaceAuditEvent(client, { workspaceId: access.auth.workspaceId, actorUserId: access.auth.userId, action: "observability.destination.updated", targetType: "observability_destination", targetId: id, targetName: String(row.name), metadata: { changed_fields: Object.keys(body).filter((key) => key !== "config") }, requestId: access.auth.requestId });
		return json({ data: format(row, await relations([id])) }, 200, NO_STORE);
	} catch (error) { return internalServerError("observability.destinations.update", error); }
}

async function deleteDestination(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_WRITE); if ("response" in access) return access.response;
	const id = pathId(new URL(req.url)); if (!id) return json({ error: "bad_request", message: "Destination id is required" }, 400, NO_STORE);
	try {
		const existing = await load(access.auth.workspaceId, id);
		if (!existing || !TYPES.has(String(existing.destination_id))) return json({ error: "not_found", message: "Observability destination not found" }, 404, NO_STORE);
		const client = getSupabaseAdmin(); const result = await client.from("workspace_broadcast_destinations").delete().eq("workspace_id", access.auth.workspaceId).eq("id", id).select("id,name,destination_id").maybeSingle();
		if (result.error) throw new Error(result.error.message || "Failed to delete observability destination");
		if (!result.data) return json({ error: "not_found", message: "Observability destination not found" }, 404, NO_STORE);
		await recordWorkspaceAuditEvent(client, { workspaceId: access.auth.workspaceId, actorUserId: access.auth.userId, action: "observability.destination.deleted", targetType: "observability_destination", targetId: id, targetName: String(result.data.name), metadata: { type: result.data.destination_id }, requestId: access.auth.requestId });
		return json({ deleted: true }, 200, NO_STORE);
	} catch (error) { return internalServerError("observability.destinations.delete", error); }
}

function formatLoggingPolicy(row: Record<string, any> | null, workspaceId: string) {
	return {
		workspace_id: workspaceId,
		enabled: Boolean(row?.io_logging_enabled),
		retention_days: Number(row?.io_logging_retention_days ?? 90),
		include_provider_payloads: row?.io_logging_include_provider_payloads !== false,
		billing_status: String(row?.io_logging_billing_status ?? "active"),
		grace_until: row?.io_logging_grace_until ?? null,
		price_per_million_units_nanos: Number(row?.io_logging_price_per_million_units_nanos ?? 0),
		updated_at: row?.io_logging_updated_at ?? null,
	};
}

async function getLoggingPolicy(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_READ); if ("response" in access) return access.response;
	try {
		const result = await getSupabaseAdmin().from("workspace_settings").select("workspace_id,io_logging_enabled,io_logging_retention_days,io_logging_include_provider_payloads,io_logging_billing_status,io_logging_grace_until,io_logging_price_per_million_units_nanos,io_logging_updated_at").eq("workspace_id", access.auth.workspaceId).maybeSingle();
		if (result.error) throw new Error(result.error.message || "Failed to load I/O logging policy");
		return json({ data: formatLoggingPolicy(result.data, access.auth.workspaceId) }, 200, NO_STORE);
	} catch (error) { return internalServerError("observability.logging_policy.get", error); }
}

async function updateLoggingPolicy(req: Request) {
	const access = await authorize(req, CAPABILITIES.SETTINGS_WRITE); if ("response" in access) return access.response;
	const body = await req.json<Record<string, unknown>>().catch(() => null); if (!body) return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, NO_STORE);
	const update: Record<string, unknown> = {};
	if (body.enabled !== undefined) {
		if (typeof body.enabled !== "boolean") return json({ error: "bad_request", message: "enabled must be boolean" }, 400, NO_STORE);
		update.io_logging_enabled = body.enabled;
		update.privacy_enable_input_output_logging = body.enabled;
	}
	if (body.retention_days !== undefined) {
		const days = Number(body.retention_days);
		if (!Number.isInteger(days) || days < 90 || days > 365) return json({ error: "bad_request", message: "retention_days must be an integer between 90 and 365" }, 400, NO_STORE);
		update.io_logging_retention_days = days;
	}
	if (body.include_provider_payloads !== undefined) {
		if (typeof body.include_provider_payloads !== "boolean") return json({ error: "bad_request", message: "include_provider_payloads must be boolean" }, 400, NO_STORE);
		update.io_logging_include_provider_payloads = body.include_provider_payloads;
	}
	if (!Object.keys(update).length) return json({ error: "bad_request", message: "No supported logging policy fields were provided" }, 400, NO_STORE);
	try {
		const client = getSupabaseAdmin();
		const now = new Date().toISOString();
		const result = await client.from("workspace_settings").upsert({ workspace_id: access.auth.workspaceId, ...update, io_logging_updated_at: now, updated_at: now }, { onConflict: "workspace_id" }).select("workspace_id,io_logging_enabled,io_logging_retention_days,io_logging_include_provider_payloads,io_logging_billing_status,io_logging_grace_until,io_logging_price_per_million_units_nanos,io_logging_updated_at").maybeSingle();
		if (result.error || !result.data) throw new Error(result.error?.message || "Failed to update I/O logging policy");
		const { data: keys, error: keysError } = await client.from("keys").select("id").eq("workspace_id", access.auth.workspaceId).neq("status", "deleted");
		if (keysError) throw new Error(keysError.message || "Failed to invalidate logging policy cache");
		await Promise.all((keys ?? []).map((key) => setKeyVersion("id", String(key.id), Date.now())));
		await recordWorkspaceAuditEvent(client, { workspaceId: access.auth.workspaceId, actorUserId: access.auth.userId, action: "observability.logging_policy.updated", targetType: "workspace_logging_policy", targetId: access.auth.workspaceId, metadata: { changed_fields: Object.keys(body) }, requestId: access.auth.requestId });
		return json({ data: formatLoggingPolicy(result.data, access.auth.workspaceId) }, 200, NO_STORE);
	} catch (error) { return internalServerError("observability.logging_policy.update", error); }
}

export const observabilityRoutes = new Hono<Env>();
observabilityRoutes.get("/logging-policy", withRuntime(getLoggingPolicy));
observabilityRoutes.patch("/logging-policy", withRuntime(updateLoggingPolicy));
observabilityRoutes.get("/destinations", withRuntime(listDestinations));
observabilityRoutes.post("/destinations", withRuntime(createDestination));
observabilityRoutes.get("/destinations/:id", withRuntime(getDestination));
observabilityRoutes.patch("/destinations/:id", withRuntime(updateDestination));
observabilityRoutes.delete("/destinations/:id", withRuntime(deleteDestination));
