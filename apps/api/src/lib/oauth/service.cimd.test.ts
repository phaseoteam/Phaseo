import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ PHASEO_THIRD_PARTY_OAUTH_ENABLED: true }),
	getSupabaseAdmin: () => ({
		from: () => ({
			select: () => ({
				eq: () => ({
					eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
				}),
			}),
		}),
	}),
}));

import { assertRedirectAllowed, loadOAuthClient } from "./service";

afterEach(() => vi.unstubAllGlobals());

describe("OAuth client ID metadata documents", () => {
	it("loads a validated public CIMD client without dynamic registration", async () => {
		const clientId = "https://client.example/.well-known/oauth-client";
		const fetchMock = vi.fn().mockResolvedValue(Response.json({
			client_id: clientId,
			client_name: "Example MCP Client",
			client_uri: "https://client.example/",
			logo_uri: "https://client.example/logo.png",
			redirect_uris: ["https://client.example/oauth/callback"],
			grant_types: ["authorization_code"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
			scope: "models:read providers:read pricing:read",
		}));
		vi.stubGlobal("fetch", fetchMock);

		const client = await loadOAuthClient(clientId);
		expect(client).toMatchObject({
			id: clientId,
			name: "Example MCP Client",
			client_type: "public",
			redirect_uris: ["https://client.example/oauth/callback"],
			allowed_scopes: ["models:read", "providers:read", "pricing:read"],
			registration_source: "cimd",
		});
		expect(assertRedirectAllowed(client!, "https://client.example/oauth/callback")).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			clientId,
			expect.objectContaining({ redirect: "manual" }),
		);
	});

	it("rejects CIMD metadata redirects instead of following them", async () => {
		const clientId = "https://client.example/oauth/client.json";
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
			status: 302,
			headers: { Location: "https://attacker.example/client.json" },
		}));
		vi.stubGlobal("fetch", fetchMock);

		await expect(loadOAuthClient(clientId)).resolves.toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			clientId,
			expect.objectContaining({ redirect: "manual" }),
		);
	});

	it("negotiates public authentication when ChatGPT prefers private_key_jwt but also supports none", async () => {
		const clientId = "https://chatgpt.com/oauth/client.json";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
			client_id: clientId,
			client_name: "ChatGPT",
			client_uri: "https://chatgpt.com/",
			logo_uri: "https://persistent.oaistatic.com/sonic/misc/openai-logo.png",
			redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
			token_endpoint_auth_method: "private_key_jwt",
			token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
			token_endpoint_auth_signing_alg: "RS256",
			jwks_uri: "https://chatgpt.com/oauth/jwks.json",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
		})));

		const client = await loadOAuthClient(clientId);
		expect(client).toMatchObject({
			id: clientId,
			name: "ChatGPT",
			client_type: "public",
			redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
			registration_source: "cimd",
		});
	});

	it("rejects CIMD clients that only support private_key_jwt", async () => {
		const clientId = "https://private-client.example/client.json";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
			client_id: clientId,
			client_name: "Private Client",
			redirect_uris: ["https://private-client.example/callback"],
			token_endpoint_auth_method: "private_key_jwt",
			token_endpoint_auth_methods_supported: ["private_key_jwt"],
		})));

		await expect(loadOAuthClient(clientId)).resolves.toBeNull();
	});

	it("allows native CIMD loopback callbacks to use an ephemeral port", async () => {
		const clientId = "https://chatgpt.example/oauth/codex/client.json";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
			client_id: clientId,
			client_name: "Codex",
			application_type: "native",
			redirect_uris: ["http://127.0.0.1/callback/client"],
			token_endpoint_auth_method: "none",
		})));
		const client = await loadOAuthClient(clientId);

		expect(assertRedirectAllowed(client!, "http://127.0.0.1:61903/callback/client")).toBe(true);
		expect(assertRedirectAllowed(client!, "http://127.0.0.1:61903/callback/other")).toBe(false);
		expect(assertRedirectAllowed(client!, "http://localhost:61903/callback/client")).toBe(false);
	});

	it("keeps CIMD web-client loopback redirects on their registered port", async () => {
		const clientId = "https://web-client.example/client.json";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
			client_id: clientId,
			client_name: "Web Client",
			application_type: "web",
			redirect_uris: ["http://127.0.0.1/callback/client"],
			token_endpoint_auth_method: "none",
		})));
		const client = await loadOAuthClient(clientId);

		expect(assertRedirectAllowed(client!, "http://127.0.0.1:61903/callback/client")).toBe(false);
	});

	it("rejects metadata that does not bind itself to the exact client_id", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
			client_id: "https://attacker.example/client.json",
			client_name: "Wrong Client",
			redirect_uris: ["https://attacker.example/callback"],
		})));

		await expect(loadOAuthClient("https://mismatch.example/client.json")).resolves.toBeNull();
	});

	it("does not fetch non-HTTPS or root-path client identifiers", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(loadOAuthClient("http://client.example/client.json")).resolves.toBeNull();
		await expect(loadOAuthClient("https://client.example/")).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("stops reading metadata once the document exceeds the byte limit", async () => {
		let pulls = 0;
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls += 1;
				controller.enqueue(new Uint8Array(3_000));
			},
			cancel() {
				cancelled = true;
			},
		});
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));

		await expect(loadOAuthClient("https://large.example/client.json")).resolves.toBeNull();
		expect(cancelled).toBe(true);
		expect(pulls).toBeLessThanOrEqual(3);
	});

	it("rejects JSON metadata that is not an object", async () => {
		for (const [index, metadata] of [null, [], "client"].entries()) {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(metadata)));
			await expect(loadOAuthClient(`https://shape-${index}.example/client.json`)).resolves.toBeNull();
		}
	});

	it("rejects CIMD clients that use reserved Phaseo product names", async () => {
		const clientId = "https://impersonator.example/client.json";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
			client_id: clientId,
			client_name: "Official Phaseo MCP",
			redirect_uris: ["https://impersonator.example/callback"],
		})));

		await expect(loadOAuthClient(clientId)).resolves.toBeNull();
	});

	it("bounds cached metadata documents per origin", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const clientId = String(input);
			return Response.json({
				client_id: clientId,
				client_name: `Client ${new URL(clientId).pathname}`,
				redirect_uris: ["https://cache-limit.example/callback"],
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		const ids = Array.from({ length: 17 }, (_, index) => `https://cache-limit.example/client-${index}.json`);
		for (const id of ids) await expect(loadOAuthClient(id)).resolves.not.toBeNull();
		await expect(loadOAuthClient(ids[0])).resolves.not.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(18);
	});
});
