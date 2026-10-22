import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { connectionKeyringFromEnv, decryptConnectionSecret } from "@/lib/mcp-connections-shared";
import { pkceChallenge } from "@/lib/mcp-connections-oauth";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const SERVER = "https://mcp.example.test/mcp";
const KEY = Buffer.alloc(32, 7).toString("base64");
const env = {
	ENV: "production" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	MCP_HUB_ENABLED: "true",
	MCP_CONNECTIONS_KEY_V1: KEY,
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;
const TOKENS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };
const keyring = connectionKeyringFromEnv(env);

type Row = Record<string, any>;
type Upstream = { cimd?: boolean; open?: boolean; revocation?: boolean; tokenError?: string };
type Recorded = { url: URL; method: string; body: string; headers: Headers };

function matches(row: Row, params: URLSearchParams): boolean {
	for (const [column, filter] of params) {
		if (["select", "on_conflict", "order", "limit"].includes(column)) continue;
		const [op, ...rest] = filter.split(".");
		const value = rest.join(".");
		if (op === "eq" && String(row[column]) !== value) return false;
		if (op === "lt" && !(String(row[column]) < value)) return false;
	}
	return true;
}

/** An in-memory PostgREST for the connection tables, plus fake MCP and OAuth servers. */
function world(upstream: Upstream = {}) {
	const tables: Record<string, Row[]> = { mcp_connections: [], mcp_oauth_clients: [], mcp_oauth_pending: [], workspace_audit_events: [] };
	const requests: Recorded[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const body = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
		requests.push({ url, method: request.method, body, headers: request.headers });
		const path = url.pathname;

		if (url.hostname === "cloudflare-dns.com") return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
		if (url.hostname === "mcp.example.test") {
			if (path === "/mcp") {
				if (upstream.open) return Response.json({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: {} } });
				return new Response(null, { status: 401, headers: { "www-authenticate": 'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"' } });
			}
			if (path === "/.well-known/oauth-protected-resource/mcp") {
				return Response.json({ resource: SERVER, authorization_servers: ["https://auth.example.test"], scopes_supported: ["read"] });
			}
		}
		if (url.hostname === "auth.example.test") {
			if (path === "/.well-known/oauth-authorization-server") {
				return Response.json({
					issuer: "https://auth.example.test",
					authorization_endpoint: "https://auth.example.test/authorize",
					token_endpoint: "https://auth.example.test/token",
					registration_endpoint: "https://auth.example.test/register",
					...(upstream.revocation === false ? {} : { revocation_endpoint: "https://auth.example.test/revoke" }),
					code_challenge_methods_supported: ["S256"],
					client_id_metadata_document_supported: upstream.cimd === true,
				});
			}
			if (path === "/register") return Response.json({ client_id: "dcr-client" }, { status: 201 });
			if (path === "/token") {
				if (upstream.tokenError) return Response.json({ error: upstream.tokenError }, { status: 400 });
				return Response.json({ access_token: "upstream-access", refresh_token: "upstream-refresh", token_type: "Bearer", expires_in: 3600, scope: "read" });
			}
			if (path === "/revoke") return new Response(null, { status: 200 });
			return new Response(null, { status: 404 });
		}

		if (path.endsWith("/auth/v1/user")) {
			const id = TOKENS[request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""];
			if (!id) return Response.json({ message: "invalid token" }, { status: 401 });
			return Response.json({ id, email: `${id}@example.com`, app_metadata: {} });
		}
		if (path.endsWith("/workspace_members")) return Response.json([{ role: "member" }]);
		if (path.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);

		const table = path.split("/").pop() ?? "";
		const rows = tables[table];
		if (!rows) throw new Error(`Unexpected fixture request: ${request.method} ${path}${url.search}`);
		if (request.method === "GET") {
			const columns = url.searchParams.get("select");
			const project = (row: Row) => !columns || columns === "*" ? row : Object.fromEntries(columns.split(",").map((column) => [column, row[column] ?? null]));
			return Response.json(rows.filter((row) => matches(row, url.searchParams)).map(project));
		}
		if (request.method === "POST") {
			const incoming = [JSON.parse(body)].flat() as Row[];
			const conflict = url.searchParams.get("on_conflict")?.split(",");
			const stored: Row[] = [];
			for (const row of incoming) {
				const existing = conflict ? rows.find((candidate) => conflict.every((column) => candidate[column] === row[column])) : null;
				if (existing) stored.push(Object.assign(existing, row));
				else if (table === "mcp_oauth_clients" && rows.some((candidate) => candidate.issuer === row.issuer && candidate.registration_kind === row.registration_kind)) {
					return Response.json({ code: "23505", message: "duplicate" }, { status: 409 });
				} else {
					const created = { id: row.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
					rows.push(created);
					stored.push(created);
				}
			}
			return Response.json(stored, { status: 201 });
		}
		if (request.method === "PATCH") {
			const changed = rows.filter((row) => matches(row, url.searchParams));
			for (const row of changed) Object.assign(row, JSON.parse(body));
			return Response.json(changed);
		}
		if (request.method === "DELETE") {
			const removed = rows.filter((row) => matches(row, url.searchParams));
			tables[table] = rows.filter((row) => !removed.includes(row));
			return Response.json(removed);
		}
		throw new Error(`Unexpected method ${request.method}`);
	}));
	return { tables: new Proxy(tables, { get: (target, name: string) => target[name] }), requests };
}

function call(path: string, init: RequestInit = {}, token: string | null = "token-a", overrides: Record<string, unknown> = {}) {
	return app.request(`https://phaseo.app/api/account/settings${path}`, {
		...init,
		headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(init.headers ?? {}) },
	}, { ...env, ...overrides }, executionCtx);
}

function sessionCookie(accessToken: string) {
	return `sb-example-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: accessToken, refresh_token: "r" })).toString("base64url")}`;
}

function start(serverUrl = SERVER, overrides: Record<string, unknown> = {}) {
	return call("/connections/start", { method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE, serverUrl, name: "Example Tracker" }) }, "token-a", overrides);
}

function callback(query: Record<string, string>, cookieToken: string | null = "token-a") {
	return app.request(`https://phaseo.app/api/account/settings/connections/callback?${new URLSearchParams(query)}`, {
		headers: cookieToken ? { cookie: sessionCookie(cookieToken) } : {},
	}, env, executionCtx);
}

function location(response: Response): URL {
	return new URL(response.headers.get("location") ?? "");
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Connections sign-in", () => {
	it("registers Phaseo, then sends the person to sign in with PKCE and a resource indicator", async () => {
		const { tables, requests } = world();
		const response = await start();
		expect(response.status).toBe(200);
		const body = await response.json() as { mode: string; authorizationUrl: string; label: string };
		expect(body).toMatchObject({ mode: "authorize", label: "example_tracker" });

		const url = new URL(body.authorizationUrl);
		expect(`${url.origin}${url.pathname}`).toBe("https://auth.example.test/authorize");
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			response_type: "code",
			client_id: "dcr-client",
			redirect_uri: "https://phaseo.app/api/account/settings/connections/callback",
			code_challenge_method: "S256",
			resource: SERVER,
			scope: "read",
		});
		const registration = requests.find((request) => request.url.pathname === "/register");
		expect(JSON.parse(registration?.body ?? "{}")).toMatchObject({ token_endpoint_auth_method: "none", redirect_uris: ["https://phaseo.app/api/account/settings/connections/callback"] });

		const pending = tables.mcp_oauth_pending[0];
		expect(pending).toMatchObject({ user_id: "user-a", workspace_id: WORKSPACE, resource: SERVER, issuer: "https://auth.example.test" });
		expect(pending.state_hash).not.toBe(url.searchParams.get("state"));
		const verifier = await decryptConnectionSecret(keyring, pending.code_verifier_enc, { recordId: pending.id, field: "code_verifier", workspaceId: WORKSPACE, userId: "user-a" });
		expect(await pkceChallenge(verifier)).toBe(url.searchParams.get("code_challenge"));
		expect(tables.mcp_oauth_clients).toHaveLength(1);
	});

	it("uses Phaseo's client metadata document where the server supports it", async () => {
		const { tables, requests } = world({ cimd: true });
		const body = await (await start()).json() as { authorizationUrl: string };
		expect(new URL(body.authorizationUrl).searchParams.get("client_id")).toBe("https://phaseo.app/api/account/settings/connections/client-metadata.json");
		expect(requests.some((request) => request.url.pathname === "/register")).toBe(false);
		expect(tables.mcp_oauth_clients[0]).toMatchObject({ registration_kind: "cimd" });

		const document = await (await call("/connections/client-metadata.json", {}, null)).json();
		expect(document).toMatchObject({
			client_id: "https://phaseo.app/api/account/settings/connections/client-metadata.json",
			redirect_uris: ["https://phaseo.app/api/account/settings/connections/callback"],
			token_endpoint_auth_method: "none",
		});
	});

	it("stores encrypted tokens on callback, once, for the person who started it", async () => {
		const { tables, requests } = world();
		const { authorizationUrl } = await (await start()).json() as { authorizationUrl: string };
		const state = new URL(authorizationUrl).searchParams.get("state") ?? "";

		const response = await callback({ code: "auth-code", state, iss: "https://auth.example.test" });
		expect(response.status).toBe(302);
		expect(location(response).pathname).toBe("/settings/connections");
		expect(location(response).searchParams.get("connected")).toBe("example_tracker");

		const exchange = new URLSearchParams(requests.find((request) => request.url.pathname === "/token")?.body);
		expect(exchange.get("grant_type")).toBe("authorization_code");
		expect(exchange.get("resource")).toBe(SERVER);
		expect(exchange.get("client_id")).toBe("dcr-client");
		expect(await pkceChallenge(exchange.get("code_verifier") ?? "")).toBe(new URL(authorizationUrl).searchParams.get("code_challenge"));

		const connection = tables.mcp_connections[0];
		expect(connection).toMatchObject({ user_id: "user-a", label_slug: "example_tracker", status: "active", auth_kind: "oauth", resource: SERVER });
		expect(JSON.stringify(connection)).not.toContain("upstream-access");
		const context = { recordId: connection.id, workspaceId: WORKSPACE, userId: "user-a" };
		expect(await decryptConnectionSecret(keyring, connection.access_token_enc, { ...context, field: "access_token" })).toBe("upstream-access");
		expect(await decryptConnectionSecret(keyring, connection.refresh_token_enc, { ...context, field: "refresh_token" })).toBe("upstream-refresh");
		expect(tables.mcp_oauth_pending).toHaveLength(0);
		expect(tables.workspace_audit_events[0]).toMatchObject({ action: "mcp_connection.connected", target_type: "mcp_connection" });

		expect(location(await callback({ code: "auth-code", state })).searchParams.get("error")).toBe("state_invalid");
	});

	it("refuses a callback from another signed-in person, or with the wrong issuer", async () => {
		world();
		const stateOf = async () => new URL(((await (await start()).json()) as { authorizationUrl: string }).authorizationUrl).searchParams.get("state") ?? "";
		expect(location(await callback({ code: "c", state: await stateOf() }, "token-b")).searchParams.get("error")).toBe("session_mismatch");
		expect(location(await callback({ code: "c", state: await stateOf() }, null)).searchParams.get("error")).toBe("sign_in_required");
		expect(location(await callback({ code: "c", state: await stateOf(), iss: "https://evil.example.test" })).searchParams.get("error")).toBe("authorization_issuer_mismatch");
	});

	it("saves servers that need no sign-in straight away", async () => {
		const { tables } = world({ open: true });
		const body = await (await start()).json();
		expect(body).toMatchObject({ mode: "connected", label: "example_tracker" });
		expect(tables.mcp_connections[0]).toMatchObject({ auth_kind: "none", access_token_enc: null });
	});

	it("rejects private addresses and reports when Connections are off", async () => {
		world();
		const privateUrl = await start("https://127.0.0.1/mcp");
		expect(privateUrl.status).toBe(400);
		expect(await privateUrl.json()).toMatchObject({ error: "ssrf_url_private_network_not_allowed" });
		expect((await start("http://mcp.example.test/mcp")).status).toBe(400);
		expect((await start(SERVER, { MCP_HUB_ENABLED: undefined })).status).toBe(503);
		expect((await start(SERVER, { MCP_CONNECTIONS_KEY_V1: undefined })).status).toBe(503);
	});
});

describe("Connections list and removal", () => {
	it("lists only the caller's connections and never returns tokens", async () => {
		const { tables } = world();
		tables.mcp_connections.push(
			{ id: "00000000-0000-4000-8000-0000000000c1", workspace_id: WORKSPACE, user_id: "user-a", label_slug: "linear", display_name: "Linear", server_url: SERVER, access_token_enc: "mcpv1.x.y", status: "active", created_at: "2026-10-22T00:00:00Z" },
			{ id: "00000000-0000-4000-8000-0000000000c2", workspace_id: WORKSPACE, user_id: "user-b", label_slug: "notion", display_name: "Notion", server_url: SERVER, status: "active", created_at: "2026-10-22T00:00:00Z" },
		);
		const response = await call(`/connections?workspaceId=${WORKSPACE}`);
		const body = await response.json() as { enabled: boolean; mcpUrl: string; connections: Row[] };
		expect(body.enabled).toBe(true);
		expect(body.mcpUrl).toBe("https://mcp.phaseo.app/mcp");
		expect(body.connections.map((row) => row.label_slug)).toEqual(["linear"]);
		expect(JSON.stringify(body)).not.toContain("mcpv1");
		expect((await call(`/connections?workspaceId=${WORKSPACE}`, {}, "token-a", { MCP_HUB_ENABLED: undefined }).then((r) => r.json()))).toMatchObject({ enabled: false, connections: [] });
	});

	it("revokes upstream, removes the connection and records it", async () => {
		const { tables, requests } = world();
		const { authorizationUrl } = await (await start()).json() as { authorizationUrl: string };
		await callback({ code: "auth-code", state: new URL(authorizationUrl).searchParams.get("state") ?? "" });
		const id = tables.mcp_connections[0].id;

		expect((await call(`/connections/${id}?workspaceId=${WORKSPACE}`, { method: "DELETE" }, "token-b")).status).toBe(404);
		const response = await call(`/connections/${id}?workspaceId=${WORKSPACE}`, { method: "DELETE" });
		expect(await response.json()).toEqual({ success: true, upstreamRevoked: true });
		const revoke = new URLSearchParams(requests.find((request) => request.url.pathname === "/revoke")?.body);
		expect(revoke.get("token")).toBe("upstream-refresh");
		expect(revoke.get("token_type_hint")).toBe("refresh_token");
		expect(tables.mcp_connections).toHaveLength(0);
		expect(tables.workspace_audit_events.at(-1)).toMatchObject({ action: "mcp_connection.disconnected" });
	});
});
