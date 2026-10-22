// Internal endpoints Phaseo's MCP server (apps/mcp) uses to list and call the
// tools of a person's connected MCP servers. Two credentials are required: the
// MCP resource server's secret (HTTP Basic, as for /oauth/mcp/token-exchange)
// and the person's own MCP access token (subject_token), which is re-checked
// here so the MCP worker cannot act for anyone but the signed-in person. The
// token must carry the connections:use scope.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { clearRuntime, configureRuntime, getSupabaseAdmin } from "@/runtime/env";
import { CONNECTIONS_USE_SCOPE } from "@/lib/authz/capabilities";
import { authenticateManagement } from "@/pipeline/before/auth";
import { HubError, callHubTool, listHubTools, type HubOwner } from "@core/mcp-hub/hub";
import { hubDeps, hubEnabled, hubKeyring } from "@core/mcp-hub/deps";
import { McpUpstreamError } from "@core/mcp-hub/upstream-client";
import { SsrfError } from "@core/ssrf";

export const internalMcpHubRoutes = new Hono<Env>();

const RESOURCE_SERVER_CLIENT_ID = "phaseo_mcp_resource_server";
const MAX_ARGUMENT_BYTES = 256 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

function constantTimeEqualText(left: string, right: string): boolean {
	const length = Math.max(left.length, right.length);
	let difference = left.length === right.length ? 0 : 1;
	for (let index = 0; index < length; index += 1) {
		difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
	}
	return difference === 0;
}

function resourceServerAuthorized(request: Request, configured: string): boolean {
	const header = request.headers.get("authorization") ?? "";
	if (configured.length < 64 || !header.toLowerCase().startsWith("basic ") || header.length > 2048) return false;
	let decoded: string;
	try { decoded = atob(header.slice(6).trim()); } catch { return false; }
	const separator = decoded.indexOf(":");
	return separator > 0 &&
		decoded.slice(0, separator) === RESOURCE_SERVER_CLIENT_ID &&
		constantTimeEqualText(decoded.slice(separator + 1), configured);
}

type Authorized = { owner: HubOwner; body: Record<string, unknown> } | { response: Response };

async function authorize(c: any): Promise<Authorized> {
	const env = c.env;
	if (!hubEnabled(env)) return { response: c.json({ error: "connections_unavailable" }, 404, NO_STORE) };
	if (!resourceServerAuthorized(c.req.raw, String(env.PHASEO_MCP_RESOURCE_SERVER_SECRET ?? "").trim())) {
		return { response: c.json({ error: "invalid_client" }, 401, NO_STORE) };
	}
	const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
	if (!body || typeof body !== "object" || Array.isArray(body)) return { response: c.json({ error: "invalid_body" }, 400, NO_STORE) };
	const subjectToken = typeof body.subject_token === "string" ? body.subject_token.trim() : "";
	const resource = typeof body.resource === "string" ? body.resource.trim() : "";
	if (!subjectToken || !resource || subjectToken.length > 8192) return { response: c.json({ error: "invalid_request" }, 400, NO_STORE) };

	const auth = await authenticateManagement(new Request(c.req.url, { headers: { Authorization: `Bearer ${subjectToken}` } }), {
		useKvCache: false,
		allowResourceBoundOAuthKey: true,
	});
	if (!auth.ok || auth.authMethod !== "oauth" || !auth.userId || !auth.workspaceId || auth.oauthResource !== resource) {
		return { response: c.json({ error: "invalid_token" }, 401, NO_STORE) };
	}
	const scopes = auth.oauthScopes ?? auth.scopes ?? [];
	if (!scopes.includes(CONNECTIONS_USE_SCOPE)) return { response: c.json({ error: "insufficient_scope", scope: CONNECTIONS_USE_SCOPE }, 403, NO_STORE) };
	return { owner: { workspaceId: auth.workspaceId, userId: auth.userId }, body };
}

function failure(c: any, error: unknown) {
	if (error instanceof HubError) return c.json({ error: error.code, message: error.message }, error.code === "not_found" ? 404 : 409, NO_STORE);
	if (error instanceof SsrfError) return c.json({ error: error.code, message: "The connected server's address is not allowed." }, 502, NO_STORE);
	if (error instanceof McpUpstreamError) return c.json({ error: `upstream_${error.code}`, message: error.message }, 502, NO_STORE);
	return c.json({ error: "hub_failed", message: "The connected server could not be reached." }, 502, NO_STORE);
}

internalMcpHubRoutes.post("/tools", async (c) => {
	configureRuntime(c.env);
	try {
		const authorized = await authorize(c);
		if ("response" in authorized) return authorized.response;
		const keyring = hubKeyring(c.env);
		if (!keyring) return c.json({ error: "connections_unavailable" }, 503, NO_STORE);
		return c.json(await listHubTools(hubDeps(c.env, keyring), authorized.owner), 200, NO_STORE);
	} catch (error) {
		return failure(c, error);
	} finally {
		clearRuntime();
	}
});

internalMcpHubRoutes.post("/call", async (c) => {
	configureRuntime(c.env);
	const started = Date.now();
	let logged: Record<string, unknown> | null = null;
	try {
		const authorized = await authorize(c);
		if ("response" in authorized) return authorized.response;
		const keyring = hubKeyring(c.env);
		if (!keyring) return c.json({ error: "connections_unavailable" }, 503, NO_STORE);
		const { owner, body } = authorized;
		const connectionId = typeof body.connection_id === "string" ? body.connection_id : "";
		const tool = typeof body.tool === "string" ? body.tool : "";
		const args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? body.arguments as Record<string, unknown> : {};
		const requestBytes = new TextEncoder().encode(JSON.stringify(args)).byteLength;
		if (!connectionId || !tool || tool.length > 256) return c.json({ error: "invalid_request" }, 400, NO_STORE);
		if (requestBytes > MAX_ARGUMENT_BYTES) return c.json({ error: "arguments_too_large" }, 413, NO_STORE);
		logged = { workspace_id: owner.workspaceId, user_id: owner.userId, connection_id: connectionId, surface: "mcp", tool_name: tool, request_bytes: requestBytes };
		try {
			const outcome = await callHubTool(hubDeps(c.env, keyring), owner, { connectionId, tool, arguments: args });
			Object.assign(logged, { status: outcome.status, error_code: outcome.errorCode, response_bytes: outcome.responseBytes, injection_flagged: outcome.injectionFlagged });
			return c.json({ result: outcome.result, injectionFlagged: outcome.injectionFlagged }, 200, NO_STORE);
		} catch (error) {
			const code = error instanceof HubError || error instanceof SsrfError ? error.code : error instanceof McpUpstreamError ? `upstream_${error.code}` : "hub_failed";
			Object.assign(logged, { status: error instanceof HubError && error.code === "tool_disabled" ? "blocked" : "error", error_code: code });
			if (error instanceof HubError && error.code === "not_found") logged = null;
			return failure(c, error);
		}
	} catch (error) {
		return failure(c, error);
	} finally {
		if (logged) {
			// The metering record: timing, sizes and outcome, never arguments or results.
			const row = { ...logged, latency_ms: Date.now() - started };
			const insert = Promise.resolve(getSupabaseAdmin().from("mcp_tool_calls").insert(row)).then(() => undefined, () => undefined);
			try { c.executionCtx.waitUntil(insert); } catch { await insert; }
		}
		clearRuntime();
	}
});
