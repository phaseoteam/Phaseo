import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import { requireAccountWorkspace } from "./context";

const RULE_FIELDS = new Set(["model", "provider", "session_id", "user_id", "api_key_name", "finish_reason", "input", "output", "total_cost", "total_tokens", "prompt_tokens", "completion_tokens"]);
const RULE_CONDITIONS = new Set(["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "exists", "not_exists", "matches_regex"]);

function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function destinationId(value: unknown) { const id = String(value ?? "").trim(); return id === "arize_ai" ? "arize" : id === "new_relic_ai" ? "new_relic" : id; }
function endpointFor(id: string, config: Record<string, any>) { if (id === "webhook") return String(config.url ?? "").trim(); for (const key of ["otlp_endpoint", "endpoint", "collector_endpoint", "target", "host", "project_url", "base_url", "url"]) { const value = String(config[key] ?? "").trim(); if (value) return value; } return ""; }
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
function sampleTrace(name: string, privateMode: boolean) {
	const now = BigInt(Date.now()) * 1_000_000n;
	const attributes: Array<Record<string, unknown>> = [
		{ key: "trace.name", value: { stringValue: `Test Trace - ${name}` } },
		{ key: "gen_ai.operation.name", value: { stringValue: "chat" } },
		{ key: "gen_ai.provider.name", value: { stringValue: "OpenAI" } },
		{ key: "gen_ai.request.model", value: { stringValue: "openai/gpt-4-turbo" } },
		{ key: "gen_ai.usage.input_tokens", value: { intValue: 50 } },
		{ key: "gen_ai.usage.output_tokens", value: { intValue: 100 } },
	];
	if (!privateMode) attributes.push(
		{ key: "trace.input", value: { stringValue: "What is the capital of France?" } },
		{ key: "trace.output", value: { stringValue: "Paris" } },
	);
	return { resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "phaseo-gateway" } }] }, scopeSpans: [{ scope: { name: "phaseo" }, spans: [{ traceId: crypto.randomUUID().replaceAll("-", ""), spanId: crypto.randomUUID().replaceAll("-", "").slice(0, 16), name: "Test Generation", kind: 3, startTimeUnixNano: now.toString(), endTimeUnixNano: (now + 1_500_000_000n).toString(), status: { code: 1 }, attributes }] }] }] };
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
	const id = destinationId(body.destinationId); const name = String(body.name ?? "").trim(); const samplingRate = Number(body.samplingRate ?? 1); if (!id || !name || !Number.isFinite(samplingRate) || samplingRate < 0 || samplingRate > 1) return c.json({ error: "Invalid broadcast destination" }, 400, PRIVATE_NO_STORE_HEADERS);
	const config = Object.fromEntries(Object.entries(object(body.config)).filter((entry): entry is [string, string] => Boolean(entry[0].trim()) && typeof entry[1] === "string"));
	const groups = (Array.isArray(body.ruleGroups) ? body.ruleGroups : []).map((group: any) => ({ match: group?.match === "and" ? "and" : "or", rules: (Array.isArray(group?.rules) ? group.rules : []).filter((rule: any) => RULE_FIELDS.has(String(rule?.field)) && RULE_CONDITIONS.has(String(rule?.condition))).map((rule: any) => ({ field: String(rule.field), condition: String(rule.condition), value: ["exists", "not_exists"].includes(rule.condition) ? null : String(rule.value ?? "").trim() || null })) })).filter((group: any) => group.rules.length);
	let createdId: string | null = null;
	try {
		const created = await context.client.from("workspace_broadcast_destinations").insert({ workspace_id: context.workspaceId, destination_id: id, name, enabled: true, destination_config: config, privacy_exclude_prompts_and_outputs: Boolean(body.privacyExcludePromptsAndOutputs), sampling_rate: samplingRate, group_join_operator: body.groupJoin === "and" ? "and" : "or" }).select("id").single(); if (created.error) throw created.error; createdId = String(created.data.id);
		const requestedKeys = [...new Set((Array.isArray(body.keyIds) ? body.keyIds : []).map(String).filter(Boolean))];
		if (requestedKeys.length) { const keys = await context.client.from("keys").select("id").eq("workspace_id", context.workspaceId).neq("status", "deleted").in("id", requestedKeys); if (keys.error) throw keys.error; const links = (keys.data ?? []).map((key) => ({ destination_id: createdId, key_id: key.id })); if (links.length) { const inserted = await context.client.from("broadcast_destination_keys").insert(links); if (inserted.error) throw inserted.error; } }
		for (let index = 0; index < groups.length; index++) { const group = groups[index]; const inserted = await context.client.from("broadcast_destination_rule_groups").insert({ destination_id: createdId, name: `Group ${index + 1}`, match_operator: group.match, position: index }).select("id").single(); if (inserted.error) throw inserted.error; const rules = group.rules.map((rule: any, position: number) => ({ rule_group_id: inserted.data.id, ...rule, position })); const ruleResult = await context.client.from("broadcast_destination_rules").insert(rules); if (ruleResult.error) throw ruleResult.error; }
		return c.json({ ok: true, id: createdId }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { if (createdId) await context.client.from("workspace_broadcast_destinations").delete().eq("id", createdId).eq("workspace_id", context.workspaceId); return c.json({ error: error instanceof Error ? error.message : "broadcast_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsBroadcastRouter.put("/broadcast/:destinationId/disable", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const result = await loaded.context.client.from("workspace_broadcast_destinations").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", loaded.row.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "broadcast_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountSettingsBroadcastRouter.delete("/broadcast/:destinationId", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); const result = await loaded.context.client.from("workspace_broadcast_destinations").delete().eq("id", loaded.row.id).eq("workspace_id", loaded.context.workspaceId); if (result.error) return c.json({ error: "broadcast_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS); });
accountSettingsBroadcastRouter.post("/broadcast/:destinationId/status", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); if (loaded.row.destination_id !== "webhook") return c.json({ ok: false, status: "Status check coming soon" }, 200, PRIVATE_NO_STORE_HEADERS); try { const url = safeEndpoint(endpointFor("webhook", object(loaded.row.destination_config))); let response = await fetch(url, { method: "HEAD", headers: headers(object(loaded.row.destination_config)), signal: AbortSignal.timeout(10_000) }); if (response.status === 405) response = await fetch(url, { method: "GET", headers: headers(object(loaded.row.destination_config)), signal: AbortSignal.timeout(10_000) }); return c.json({ ok: response.ok, status: response.ok ? "Connected" : `Failed (${response.status})` }, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ ok: false, status: error instanceof Error ? error.message : "Connection check failed" }, 200, PRIVATE_NO_STORE_HEADERS); } });
accountSettingsBroadcastRouter.post("/broadcast/:destinationId/sample", async (c) => { const loaded = await loadedDestination(c); if (!loaded) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); if (loaded.row.destination_id !== "webhook") return c.json({ error: "Sample trace is only implemented for Webhook currently." }, 409, PRIVATE_NO_STORE_HEADERS); try { const config = object(loaded.row.destination_config); const url = safeEndpoint(endpointFor("webhook", config)); const response = await fetch(url, { method: String(config.method ?? "POST").toUpperCase() === "PUT" ? "PUT" : "POST", headers: headers(config), body: JSON.stringify(sampleTrace(String(loaded.row.name ?? "Broadcast"), Boolean(loaded.row.privacy_exclude_prompts_and_outputs))), signal: AbortSignal.timeout(10_000) }); const text = await response.text(); if (!response.ok) throw new Error(`Destination returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`); return c.json({ ok: true, status: "Sample trace sent", httpStatus: response.status }, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Failed to send sample trace" }, 409, PRIVATE_NO_STORE_HEADERS); } });
accountSettingsBroadcastRouter.post("/broadcast/test-config", async (c) => { const body: Record<string, any> = await c.req.json<Record<string, any>>().catch(() => ({})); const context = await adminContext(c, body.workspaceId); if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS); try { const id = destinationId(body.destinationId); const config = object(body.config); const endpoint = safeEndpoint(endpointFor(id, config)); return c.json({ ok: true, status: `Endpoint validated (${String(config.method ?? "POST").toUpperCase() === "PUT" ? "PUT" : "POST"})`, httpStatus: null, endpoint: endpoint.toString(), headerCount: Object.keys(headers(config)).length }, 200, PRIVATE_NO_STORE_HEADERS); } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Invalid destination" }, 400, PRIVATE_NO_STORE_HEADERS); } });
