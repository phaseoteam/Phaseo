import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestSigner, signTestToken, type TestSigner } from "@/lib/workload-identity/testing";
import { __resetWorkloadJwksCacheForTests } from "@/lib/workload-identity/verify";

const runtime = vi.hoisted(() => {
	const state = {
		bindings: {} as Record<string, string | undefined>,
		gateEnabled: true,
		issuers: ["https://oidc.vercel.com/acme"] as string[] | null,
		issuerReads: 0,
		gateCalls: [] as Array<Record<string, unknown>>,
		policyRows: [] as Array<Record<string, unknown>>,
		policyQueries: [] as Array<Array<[string, unknown]>>,
		policyError: null as { message: string } | null,
		keyRow: null as Record<string, unknown> | null,
		keyUpdates: [] as Array<Record<string, unknown>>,
		background: [] as Promise<unknown>[],
	};
	const policyQuery = () => {
		const filters: Array<[string, unknown]> = [];
		const chain = {
			select: () => chain,
			eq: (column: string, value: unknown) => {
				filters.push([column, value]);
				if (filters.length === 3) {
					state.policyQueries.push(filters);
					return Promise.resolve({ data: state.policyError ? null : state.policyRows, error: state.policyError });
				}
				return chain;
			},
		};
		return chain;
	};
	const supabase = {
		rpc: async (name: string) => {
			if (name !== "active_workload_identity_issuers") throw new Error(`unexpected rpc ${name}`);
			state.issuerReads += 1;
			return state.issuers ? { data: state.issuers, error: null } : { data: null, error: { message: "boom" } };
		},
		from: (table: string) => {
			if (table === "workload_identity_policies") return policyQuery();
			if (table === "keys") {
				return {
					select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.keyRow, error: null }) }) }),
					update: (payload: Record<string, unknown>) => {
						state.keyUpdates.push(payload);
						return { eq: async () => ({ error: null }) };
					},
				};
			}
			throw new Error(`unexpected table ${table}`);
		},
	};
	return { state, supabase };
});

vi.mock("@/core/feature-flags", () => ({
	isWorkloadIdentityAccessEnabled: async (subject: Record<string, unknown>) => {
		runtime.state.gateCalls.push(subject);
		return runtime.state.gateEnabled;
	},
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => runtime.state.bindings,
	getCache: () => null,
	getSupabaseAdmin: () => runtime.supabase,
	dispatchBackground: (promise: Promise<unknown>) => void runtime.state.background.push(promise),
	configureRuntime: () => undefined,
	clearRuntime: () => undefined,
}));

const { authenticate, __resetAuthCachesForTests } = await import("./auth");
const { __resetWorkloadIdentityAuthCachesForTests } = await import("./workload-identity-auth");
const { __resetLastUsedThrottleForTests } = await import("@/core/last-used-throttle");

const ISSUER = "https://oidc.vercel.com/acme";
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
let signer: TestSigner;
let jwksFetches = 0;

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const now = Math.floor(Date.now() / 1000);
	return {
		iss: ISSUER,
		aud: "https://api.phaseo.app",
		sub: "owner:acme:project:web:environment:production",
		iat: now - 10,
		nbf: now - 10,
		exp: now + 3600,
		owner_id: "team_123",
		project_id: "prj_web",
		environment: "production",
		...overrides,
	};
}

function policyRow(overrides: Record<string, unknown> = {}, keyOverrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "pol_1",
		workspace_id: "ws_1",
		key_id: "key_1",
		provider: "vercel",
		issuer: ISSUER,
		pinned_owner_id: "team_123",
		claim_conditions: { project_id: ["prj_web"], environment: ["production"] },
		max_token_lifetime_seconds: 43200,
		status: "active",
		keys: {
			id: "key_1",
			kid: "0123456789abcdef0123456789abcdef",
			workspace_id: "ws_1",
			status: "active",
			key_kind: "workload_identity",
			expires_at: null,
			ip_allowlist: [],
			created_by: "user_admin",
			...keyOverrides,
		},
		...overrides,
	};
}

function request(token: string, headers: Record<string, string> = {}): Request {
	return new Request("https://api.phaseo.app/v1/chat/completions", {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, ...headers },
	});
}

beforeAll(async () => {
	signer = await makeTestSigner("RS256", "vercel-1");
});

beforeEach(() => {
	runtime.state.bindings = {};
	runtime.state.gateEnabled = true;
	runtime.state.gateCalls = [];
	runtime.state.issuers = [ISSUER];
	runtime.state.issuerReads = 0;
	runtime.state.policyRows = [policyRow()];
	runtime.state.policyQueries = [];
	runtime.state.policyError = null;
	runtime.state.keyRow = null;
	runtime.state.keyUpdates = [];
	runtime.state.background = [];
	jwksFetches = 0;
	__resetAuthCachesForTests();
	__resetWorkloadIdentityAuthCachesForTests();
	__resetWorkloadJwksCacheForTests();
	__resetLastUsedThrottleForTests();
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url !== JWKS_URL) return new Response("not found", { status: 404 });
		jwksFetches += 1;
		return new Response(JSON.stringify({ keys: [signer.publicJwk] }), { status: 200 });
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("authenticate with workload identity tokens", () => {
	it("authenticates as the policy's key, logged as api_key", async () => {
		const result = await authenticate(request(await signTestToken(signer, claims())));
		expect(result).toEqual({
			ok: true,
			apiKeyId: "key_1",
			apiKeyRef: "kid_0123456789abcdef0123456789abcdef",
			apiKeyKid: "0123456789abcdef0123456789abcdef",
			workspaceId: "ws_1",
			userId: "user_admin",
			internal: false,
			authMethod: "api_key",
		});
		expect(runtime.state.policyQueries).toEqual([[["issuer", ISSUER], ["pinned_owner_id", "team_123"], ["status", "active"]]]);
		await Promise.all(runtime.state.background);
		expect(runtime.state.keyUpdates).toHaveLength(1);
	});

	it("is off when the kill switch is set to false", async () => {
		runtime.state.bindings = { WORKLOAD_IDENTITY_AUTH_ENABLED: "false" };
		const result = await authenticate(request(await signTestToken(signer, claims())));
		expect(result).toEqual({ ok: false, reason: "invalid_key_format" });
		expect(jwksFetches).toBe(0);
	});

	it("leaves other JWTs on the existing path", async () => {
		const result = await authenticate(request(await signTestToken(signer, claims({ iss: "https://evil.example.com" }))));
		expect(result).toEqual({ ok: false, reason: "invalid_key_format" });
		expect(jwksFetches).toBe(0);
	});

	it("never fetches keys for an issuer no active policy names", async () => {
		const result = await authenticate(request(await signTestToken(signer, claims({ iss: "https://oidc.vercel.com/some-other-team" }))));
		expect(result).toEqual({ ok: false, reason: "workload_issuer_not_trusted" });
		expect(jwksFetches).toBe(0);
		expect(runtime.state.policyQueries).toHaveLength(0);
	});

	it("reads the configured issuers once per minute, not per request", async () => {
		for (let i = 0; i < 3; i += 1) {
			await authenticate(request(await signTestToken(signer, claims({ iss: `https://oidc.vercel.com/random-${i}` }))));
		}
		await authenticate(request(await signTestToken(signer, claims())));
		expect(runtime.state.issuerReads).toBe(1);
	});

	it("fails closed when the configured issuers cannot be read", async () => {
		runtime.state.issuers = null;
		expect(await authenticate(request(await signTestToken(signer, claims())))).toEqual({ ok: false, reason: "db_error" });
		expect(jwksFetches).toBe(0);
	});

	it("serves repeat requests from the verified-token cache", async () => {
		const token = await signTestToken(signer, claims());
		for (let i = 0; i < 5; i += 1) expect((await authenticate(request(token))).ok).toBe(true);
		expect(jwksFetches).toBe(1);
		expect(runtime.state.policyQueries).toHaveLength(1);
	});

	it("reuses the policy cache across different tokens from the same owner", async () => {
		await authenticate(request(await signTestToken(signer, claims())));
		await authenticate(request(await signTestToken(signer, claims({ iat: Math.floor(Date.now() / 1000) - 5 }))));
		expect(runtime.state.policyQueries).toHaveLength(1);
		expect(jwksFetches).toBe(1);
	});

	it("refuses workspaces outside the Statsig gate, deciding per workspace", async () => {
		runtime.state.gateEnabled = false;
		const token = await signTestToken(signer, claims());
		expect(await authenticate(request(token))).toEqual({ ok: false, reason: "workload_identity_not_enabled" });
		expect(runtime.state.gateCalls).toEqual([{
			workspaceId: "ws_1",
			apiKeyId: "key_1",
			apiKeyRef: "kid_0123456789abcdef0123456789abcdef",
			apiKeyKid: "0123456789abcdef0123456789abcdef",
		}]);
		// A refusal is not cached: once the workspace joins the gate, the same token works.
		runtime.state.gateEnabled = true;
		expect((await authenticate(request(token))).ok).toBe(true);
	});

	it("stops accepting a cached token once the workspace leaves the gate", async () => {
		const token = await signTestToken(signer, claims());
		expect((await authenticate(request(token))).ok).toBe(true);
		runtime.state.gateEnabled = false;
		expect(await authenticate(request(token))).toEqual({ ok: false, reason: "workload_identity_not_enabled" });
		// The refusal came from the cache path: no new verification or policy read.
		expect(jwksFetches).toBe(1);
		expect(runtime.state.policyQueries).toHaveLength(1);
	});

	it("never consults Statsig for tokens that match no policy", async () => {
		await authenticate(request(await signTestToken(signer, claims({ environment: "preview" }))));
		await authenticate(request(await signTestToken(signer, claims({ iss: "https://evil.example.com" }))));
		expect(runtime.state.gateCalls).toHaveLength(0);
	});

	it("rejects tokens that match no policy", async () => {
		const wrongEnv = await authenticate(request(await signTestToken(signer, claims({ environment: "preview" }))));
		expect(wrongEnv).toEqual({ ok: false, reason: "workload_identity_no_matching_policy" });
		const noOwner = await authenticate(request(await signTestToken(signer, claims({ owner_id: undefined }))));
		expect(noOwner).toEqual({ ok: false, reason: "workload_identity_no_matching_policy" });
	});

	it("fails closed when two workspaces trust the same workload, unless one is named", async () => {
		runtime.state.policyRows = [
			policyRow(),
			policyRow({ id: "pol_2", workspace_id: "ws_2", key_id: "key_2" }, { id: "key_2", workspace_id: "ws_2", kid: "fedcba9876543210fedcba9876543210" }),
		];
		const token = await signTestToken(signer, claims());
		expect(await authenticate(request(token))).toEqual({ ok: false, reason: "workload_identity_ambiguous" });
		expect(await authenticate(request(token, { "x-phaseo-workspace": "ws_2" }))).toMatchObject({ ok: true, workspaceId: "ws_2", apiKeyId: "key_2" });
	});

	it("honours key status, kind, expiry and IP allowlist", async () => {
		const token = await signTestToken(signer, claims());
		runtime.state.policyRows = [policyRow({}, { status: "revoked" })];
		expect(await authenticate(request(token))).toEqual({ ok: false, reason: "key_not_found_or_revoked" });

		__resetWorkloadIdentityAuthCachesForTests();
		runtime.state.policyRows = [policyRow({}, { key_kind: "standard" })];
		expect(await authenticate(request(token))).toEqual({ ok: false, reason: "key_not_found_or_revoked" });

		__resetWorkloadIdentityAuthCachesForTests();
		runtime.state.policyRows = [policyRow({}, { expires_at: "2020-01-01T00:00:00Z" })];
		expect(await authenticate(request(token))).toEqual({ ok: false, reason: "key_expired" });

		__resetWorkloadIdentityAuthCachesForTests();
		runtime.state.policyRows = [policyRow({}, { ip_allowlist: [{ label: "office", address: "203.0.113.0/24" }] })];
		expect(await authenticate(request(token, { "cf-connecting-ip": "198.51.100.7" }))).toEqual({ ok: false, reason: "key_ip_not_allowed" });
		expect((await authenticate(request(token, { "cf-connecting-ip": "203.0.113.9" }))).ok).toBe(true);
		// The cached success still checks the caller's IP.
		expect(await authenticate(request(token, { "cf-connecting-ip": "198.51.100.7" }))).toEqual({ ok: false, reason: "key_ip_not_allowed" });
	});

	it("stops serving a cached token once its key expires", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			runtime.state.policyRows = [policyRow({}, { expires_at: new Date(Date.now() + 5_000).toISOString() })];
			const token = await signTestToken(signer, claims());
			expect((await authenticate(request(token))).ok).toBe(true);
			vi.setSystemTime(Date.now() + 6_000);
			// Policy rows are still cached, so this checks the token cache honours the key expiry.
			expect(await authenticate(request(token))).toEqual({ ok: false, reason: "key_expired" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("reports verifier and database failures", async () => {
		const expired = await signTestToken(signer, claims({ exp: Math.floor(Date.now() / 1000) - 3600 }));
		expect(await authenticate(request(expired))).toEqual({ ok: false, reason: "workload_token_expired" });
		runtime.state.policyError = { message: "boom" };
		expect(await authenticate(request(await signTestToken(signer, claims())))).toEqual({ ok: false, reason: "db_error" });
	});

	it("refuses a workload key's kid presented as an API key", async () => {
		runtime.state.keyRow = {
			id: "key_1",
			workspace_id: "ws_1",
			status: "active",
			hash: "workload_identity:random",
			key_kind: "workload_identity",
		};
		const result = await authenticate(request("phaseo_v1_sk_0123456789abcdef0123456789abcdef_guess"), { useKvCache: false });
		expect(result).toEqual({ ok: false, reason: "key_not_found_or_revoked" });
	});
});
