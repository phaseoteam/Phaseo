import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import { requireAccountWorkspace } from "./context";
import { decryptBroadcastConfig, encryptBroadcastConfig } from "./broadcast-config-crypto";
import {
	AVAILABLE_BROADCAST_DESTINATION_IDS,
	BROADCAST_RULE_CONDITIONS,
	BROADCAST_RULE_FIELDS,
	broadcastDestinationEndpoint as endpointFor,
	isBroadcastDestinationLimitError,
	normalizeBroadcastDestinationId as destinationId,
	otlpTracesEndpoint,
} from "./broadcast-destinations";

const RULE_FIELDS = new Set<string>(BROADCAST_RULE_FIELDS);
const RULE_CONDITIONS = new Set<string>(BROADCAST_RULE_CONDITIONS);
const EXECUTABLE_DESTINATIONS = new Set<string>(AVAILABLE_BROADCAST_DESTINATION_IDS);

function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function safeEndpoint(value: string): URL {
	let url: URL; try { url = new URL(value); } catch { throw new Error("Endpoint must be a valid absolute URL."); }
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Endpoint must use http or https without URL credentials.");
	const host = url.hostname.toLowerCase();
	if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || /^(0|10|127|169\.254|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::1" || /^(fc|fd|fe80:)/.test(host)) throw new Error("Private or loopback endpoint addresses are not allowed.");
	return url;
}
function headers(config: Record<string, any>): Record<string, string> {
	let parsed: Record<string, string> = {};
	try { const value = JSON.parse(String(config.headers_json ?? "{}")); if (value && typeof value === "object" && !Array.isArray(value)) parsed = Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")); } catch {}
	const result: Record<string, string> = { "Content-Type": "application/json", ...parsed };
	if (config.auth_header && !result.Authorization && !(result as any).authorization) result.Authorization = String(config.auth_header);
	return result;
}
export async function fetchBroadcastEndpoint(url: URL, init: RequestInit): Promise<Response> {
	const response = await fetch(url, { ...init, redirect: "manual" });
	if (response.status >= 300 && response.status < 400) {
		throw new Error("Broadcast destination redirects are not allowed.");
	}
	return response;
}
function validateDestinationConfig(id: string, config: Record<string, any>) {
	const target = safeEndpoint(endpointFor(id, config));
	if (id === "webhook") {
		const method = String(config.method ?? "POST").trim().toUpperCase();
		if (!["POST", "PUT"].includes(method)) throw new Error("Webhook method must be POST or PUT");
		if (typeof config.headers_json === "string" && config.headers_json.trim()) {
			let parsed: unknown;
			try { parsed = JSON.parse(config.headers_json); } catch { throw new Error("Webhook headers must be valid JSON"); }
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((value) => typeof value !== "string")) throw new Error("Webhook headers must be a JSON object containing string values");
		}
	}
	return target;
}
function sampleTrace(name: string, privateMode: boolean) {
	const now = BigInt(Date.now()) * 1_000_000n;
	const attributes: Array<Record<string, unknown>> = [
		{ key: "trace.name", value: { stringValue: `Test Trace - ${name}` } },
		{ key: "gen_ai.operation.name", value: { stringValue: "chat" } },
		{ key: "gen_ai.provider.name", value: { stringValue: "OpenAI" } },
		{ key: "gen_ai.request.model", value: { stringValue: "openai/gpt-4-turbo" } },
		{ key: "gen_ai.usage.input_tokens", value: { intValue: "50" } },
		{ key: "gen_ai.usage.output_tokens", value: { intValue: "100" } },
	];
	if (!privateMode) attributes.push(
		{ key: "trace.input", value: { stringValue: "What is the capital of France?" } },
		{ key: "trace.output", value: { stringValue: "Paris" } },
	);
	return { resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "phaseo-gateway" } }] }, scopeSpans: [{ scope: { name: "phaseo" }, spans: [{ traceId: crypto.randomUUID().replaceAll("-", ""), spanId: crypto.randomUUID().replaceAll("-", "").slice(0, 16), name: "Test Generation", kind: 3, startTimeUnixNano: now.toString(), endTimeUnixNano: (now + 1_500_000_000n).toString(), status: { code: 1 }, attributes }] }] }] };
}

async function sendOtlpSample(config: Record<string, any>, payload: unknown) {
	const response = await fetchBroadcastEndpoint(safeEndpoint(otlpTracesEndpoint(config)), {
		method: "POST",
		headers: { Accept: "application/json", ...headers(config) },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(10_000),
	});
	const raw = await response.text();
	let body: Record<string, any> = {};
	try { body = raw ? object(JSON.parse(raw)) : {}; } catch {}
	const partial = object(body.partialSuccess ?? body.partial_success);
	const rejected = Number(partial.rejectedSpans ?? partial.rejected_spans ?? 0);
	if (!response.ok) throw new Error(`OTLP collector returned ${response.status}${raw ? `: ${raw.slice(0, 200)}` : ""}`);
	if (Number.isFinite(rejected) && rejected > 0) {
		throw new Error(`OTLP collector rejected ${rejected} spans${partial.errorMessage ? `: ${String(partial.errorMessage).slice(0, 200)}` : ""}`);
	}
	return response.status;
}

async function adminContext(c: any, workspaceId: unknown) { const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(workspaceId ?? "") }); return context && ["owner", "admin"].includes(context.role.toLowerCase()) ? context : null; }
async function loadedDestination(c: any) {
	const user = await requireUser(c.req.raw, c.env); if (!user) return null;
	const client = getDataClient(c.env); const row = await client.from("workspace_broadcast_destinations").select("*").eq("id", c.req.param("destinationId")).maybeSingle(); if (row.error || !row.data?.workspace_id) return null;
	const context = await adminContext(c, row.data.workspace_id); return context ? { context, row: row.data } : null;
}

export const accountSettingsBroadcastRouter = new Hono<{ Bindings: Env }>();

accountSettingsBroadcastRouter.post("/broadcast", async (c) => {
	const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const context = await adminContext(c, body.workspaceId); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const id = destinationId(body.destinationId); const name = String(body.name ?? "").trim(); const samplingRate = Number(body.samplingRate ?? 1); if (!EXECUTABLE_DESTINATIONS.has(id) || !name || !Number.isFinite(samplingRate) || samplingRate < 0 || samplingRate > 1) return c.json({ error: "This Broadcast destination is not available yet" }, 400, PRIVATE_NO_STORE_HEADERS);
	const config = Object.fromEntries(Object.entries(object(body.config)).filter((entry): entry is [string, string] => Boolean(entry[0].trim()) && typeof entry[1] === "string"));
	const groups = (Array.isArray(body.ruleGroups) ? body.ruleGroups : []).map((group: any) => ({ match: group?.match === "and" ? "and" : "or", rules: (Array.isArray(group?.rules) ? group.rules : []).filter((rule: any) => RULE_FIELDS.has(String(rule?.field)) && RULE_CONDITIONS.has(String(rule?.condition))).map((rule: any) => ({ field: String(rule.field), condition: String(rule.condition), value: ["exists", "not_exists"].includes(rule.condition) ? null : String(rule.value ?? "").trim() || null })) })).filter((group: any) => group.rules.length);
	let createdId: string | null = null;
	try {
		validateDestinationConfig(id, config);
		const encrypted = await encryptBroadcastConfig(c.env, config);
		const created = await context.client.from("workspace_broadcast_destinations").insert({ workspace_id: context.workspaceId, destination_id: id, name, enabled: true, destination_config: {}, destination_config_ciphertext: encrypted.ciphertext, destination_config_iv: encrypted.iv, destination_config_key_version: encrypted.keyVersion, privacy_exclude_prompts_and_outputs: Boolean(body.privacyExcludePromptsAndOutputs), sampling_rate: samplingRate, group_join_operator: body.groupJoin === "and" ? "and" : "or", include_generation_metadata: body.includeGenerationMetadata !== false, include_cost_metadata: body.includeCostMetadata !== false, include_identity_metadata: body.includeIdentityMetadata !== false, include_request_context: body.includeRequestContext !== false }).select("id").single(); if (created.error) throw created.error; createdId = String(created.data.id);
		const includeKeyIds = [...new Set((Array.isArray(body.includeKeyIds) ? body.includeKeyIds : []).map(String).filter(Boolean))];
		const excludeKeyIds = [...new Set((Array.isArray(body.excludeKeyIds) ? body.excludeKeyIds : []).map(String).filter(Boolean))];
		if (includeKeyIds.some((keyId) => excludeKeyIds.includes(keyId))) throw new Error("An API key cannot be both included and excluded");
		const requestedKeys = [...new Set([...includeKeyIds, ...excludeKeyIds])];
		if (requestedKeys.length) { const keys = await context.client.from("keys").select("id").eq("workspace_id", context.workspaceId).neq("status", "deleted").in("id", requestedKeys); if (keys.error) throw keys.error; if ((keys.data ?? []).length !== requestedKeys.length) throw new Error("One or more API keys are unavailable"); const links = (keys.data ?? []).map((key) => ({ destination_id: createdId, key_id: key.id, filter_mode: excludeKeyIds.includes(String(key.id)) ? "exclude" : "include" })); const inserted = await context.client.from("broadcast_destination_keys").insert(links); if (inserted.error) throw inserted.error; }
		for (let index = 0; index < groups.length; index++) { const group = groups[index]; const inserted = await context.client.from("broadcast_destination_rule_groups").insert({ destination_id: createdId, name: `Group ${index + 1}`, match_operator: group.match, position: index }).select("id").single(); if (inserted.error) throw inserted.error; const rules = group.rules.map((rule: any, position: number) => ({ rule_group_id: inserted.data.id, ...rule, position })); const ruleResult = await context.client.from("broadcast_destination_rules").insert(rules); if (ruleResult.error) throw ruleResult.error; }
		return c.json({ ok: true, id: createdId }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		if (createdId) await context.client.from("workspace_broadcast_destinations").delete().eq("id", createdId).eq("workspace_id", context.workspaceId);
		if (isBroadcastDestinationLimitError(error)) return c.json({ error: "Destination limit reached for this type", code: "destination_limit_reached" }, 409, PRIVATE_NO_STORE_HEADERS);
		return c.json({ error: error instanceof Error ? error.message : "broadcast_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsBroadcastRouter.put("/broadcast/:destinationId/disable", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const result = await loaded.context.client.from("workspace_broadcast_destinations").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", loaded.row.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "broadcast_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountSettingsBroadcastRouter.put("/broadcast/:destinationId/enable", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); if (!EXECUTABLE_DESTINATIONS.has(String(loaded.row.destination_id))) return c.json({ error: "This Broadcast destination is not available yet" }, 409, PRIVATE_NO_STORE_HEADERS); const result = await loaded.context.client.from("workspace_broadcast_destinations").update({ enabled: true, updated_at: new Date().toISOString() }).eq("id", loaded.row.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "broadcast_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountSettingsBroadcastRouter.delete("/broadcast/:destinationId", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const result = await loaded.context.client.from("workspace_broadcast_destinations").delete().eq("id", loaded.row.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "broadcast_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountSettingsBroadcastRouter.post("/broadcast/:destinationId/status", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); try { const config = await decryptBroadcastConfig(c.env, loaded.row); if (loaded.row.destination_id === "otel_collector") { const status = await sendOtlpSample(config, sampleTrace(String(loaded.row.name ?? "OpenTelemetry"), true)); return c.json({ ok: true, status: "Connected", httpStatus: status }, 200, PRIVATE_NO_STORE_HEADERS); } if (loaded.row.destination_id !== "webhook") return c.json({ ok: false, status: "Coming soon" }, 200, PRIVATE_NO_STORE_HEADERS); const url = safeEndpoint(endpointFor("webhook", config)); const response = await fetchBroadcastEndpoint(url, { method: String(config.method ?? "POST").toUpperCase() === "PUT" ? "PUT" : "POST", headers: { ...headers(config), "X-Test-Connection": "true" }, body: JSON.stringify({ resourceSpans: [] }), signal: AbortSignal.timeout(10_000) }); return c.json({ ok: response.ok || response.status === 400, status: response.ok || response.status === 400 ? "Connected" : `Failed (${response.status})`, httpStatus: response.status }, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ ok: false, status: error instanceof Error ? error.message : "Connection check failed" }, 200, PRIVATE_NO_STORE_HEADERS); } });
accountSettingsBroadcastRouter.post("/broadcast/:destinationId/sample", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); if (!EXECUTABLE_DESTINATIONS.has(String(loaded.row.destination_id))) return c.json({ error: "Sample trace is not implemented for this destination." }, 409, PRIVATE_NO_STORE_HEADERS); try { const config = await decryptBroadcastConfig(c.env, loaded.row); const payload = sampleTrace(String(loaded.row.name ?? "Broadcast"), Boolean(loaded.row.privacy_exclude_prompts_and_outputs)); if (loaded.row.destination_id === "otel_collector") { const status = await sendOtlpSample(config, payload); return c.json({ ok: true, status: "Sample trace sent", httpStatus: status }, 200, PRIVATE_NO_STORE_HEADERS); } const url = safeEndpoint(endpointFor("webhook", config)); const response = await fetchBroadcastEndpoint(url, { method: String(config.method ?? "POST").toUpperCase() === "PUT" ? "PUT" : "POST", headers: headers(config), body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) }); const text = await response.text(); if (!response.ok) throw new Error(`Destination returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`); return c.json({ ok: true, status: "Sample trace sent", httpStatus: response.status }, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Failed to send sample trace" }, 409, PRIVATE_NO_STORE_HEADERS); } });
accountSettingsBroadcastRouter.post("/broadcast/test-config", async (c) => { const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const context = await adminContext(c, body.workspaceId); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); try { const id = destinationId(body.destinationId); if (!EXECUTABLE_DESTINATIONS.has(id)) return c.json({ error: "This Broadcast destination is not available yet" }, 400, PRIVATE_NO_STORE_HEADERS); const config = object(body.config); const endpoint = safeEndpoint(endpointFor(id, config)); if (id === "webhook") { const response = await fetchBroadcastEndpoint(endpoint, { method: String(config.method ?? "POST").toUpperCase() === "PUT" ? "PUT" : "POST", headers: { ...headers(config), "X-Test-Connection": "true" }, body: JSON.stringify({ resourceSpans: [] }), signal: AbortSignal.timeout(10_000) }); if (!response.ok && response.status !== 400) throw new Error(`Webhook returned ${response.status}`); return c.json({ ok: true, status: "Connection verified", httpStatus: response.status, endpoint: endpoint.toString(), headerCount: Object.keys(headers(config)).length }, 200, PRIVATE_NO_STORE_HEADERS); } return c.json({ ok: true, status: "Endpoint validated", httpStatus: null, endpoint: endpoint.toString(), headerCount: Object.keys(headers(config)).length }, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Invalid destination" }, 400, PRIVATE_NO_STORE_HEADERS); } });
