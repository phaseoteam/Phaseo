import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { jwksUrlForIssuer, presetProviderForIssuer } from "./issuers";
import {
	__resetWorkloadJwksCacheForTests,
	createJwksSource,
	verifyWorkloadToken,
	type JwksSource,
	type WorkloadTokenClaims,
} from "./verify";
import {
	matchWorkloadIdentityPolicy,
	validateWorkloadIdentityPolicy,
	type WorkloadIdentityPolicy,
} from "./policy";
import { base64Url, makeTestSigner, signTestToken, type TestSigner } from "./testing";

const NOW = 1_800_000_000;
const VERCEL_ISSUER = "https://oidc.vercel.com/acme";
const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";

const makeSigner = makeTestSigner;
const sign = signTestToken;
type Signer = TestSigner;

function vercelClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		iss: VERCEL_ISSUER,
		aud: "https://api.phaseo.app",
		sub: "owner:acme:project:acme_website:environment:production",
		iat: NOW - 60,
		nbf: NOW - 60,
		exp: NOW + 3600,
		owner: "acme",
		owner_id: "team_123",
		project: "acme_website",
		project_id: "prj_456",
		environment: "production",
		...overrides,
	};
}

function staticJwks(keysByUrl: Record<string, JsonWebKey[]>): JwksSource & { calls: Array<{ url: string; forceRefresh: boolean }> } {
	const calls: Array<{ url: string; forceRefresh: boolean }> = [];
	return {
		calls,
		async getKeys(url, options = {}) {
			calls.push({ url, forceRefresh: Boolean(options.forceRefresh) });
			const keys = keysByUrl[url];
			if (!keys) throw new Error("not found");
			return keys;
		},
	};
}

let rsa: Signer;
let ec: Signer;
let other: Signer;

beforeAll(async () => {
	rsa = await makeSigner("RS256", "vercel-key-1");
	ec = await makeSigner("ES256", "gh-key-1");
	other = await makeSigner("RS256", "vercel-key-1");
});

describe("issuers", () => {
	it("recognises Vercel team/global and GitHub Actions issuers", () => {
		expect(presetProviderForIssuer("https://oidc.vercel.com")).toBe("vercel");
		expect(presetProviderForIssuer(VERCEL_ISSUER)).toBe("vercel");
		expect(presetProviderForIssuer(GITHUB_ISSUER)).toBe("github_actions");
		expect(presetProviderForIssuer(`${GITHUB_ISSUER}/my-enterprise`)).toBe("github_actions");
		expect(jwksUrlForIssuer(VERCEL_ISSUER, "vercel")).toBe("https://oidc.vercel.com/acme/.well-known/jwks");
		// Enterprise issuers share GitHub's global key set.
		expect(jwksUrlForIssuer(`${GITHUB_ISSUER}/my-enterprise`, "github_actions")).toBe(`${GITHUB_ISSUER}/.well-known/jwks`);
	});

	it("rejects lookalike issuers", () => {
		for (const issuer of [
			"http://oidc.vercel.com/acme",
			"https://oidc.vercel.com.evil.example/acme",
			"https://oidc.vercel.com/acme/extra",
			"https://oidc.vercel.com/acme/",
			"https://evil.com/token.actions.githubusercontent.com",
			"https://token.actions.githubusercontent.com:8443",
		]) {
			expect(presetProviderForIssuer(issuer)).toBeNull();
		}
		expect(jwksUrlForIssuer(VERCEL_ISSUER, "github_actions")).toBeNull();
	});
});

describe("verifyWorkloadToken", () => {
	const vercelJwksUrl = "https://oidc.vercel.com/acme/.well-known/jwks";
	const githubJwksUrl = `${GITHUB_ISSUER}/.well-known/jwks`;

	it("accepts a valid RS256 Vercel token", async () => {
		const token = await sign(rsa, vercelClaims());
		const result = await verifyWorkloadToken(token, { jwks: staticJwks({ [vercelJwksUrl]: [rsa.publicJwk] }), nowSeconds: NOW });
		expect(result).toMatchObject({ ok: true, provider: "vercel", claims: { owner_id: "team_123" } });
	});

	it("accepts a valid ES256 GitHub Actions token", async () => {
		const token = await sign(ec, {
			iss: GITHUB_ISSUER,
			aud: "https://api.phaseo.app",
			sub: "repo:acme/app:ref:refs/heads/main",
			iat: NOW,
			exp: NOW + 300,
			repository_owner_id: "42",
		});
		const result = await verifyWorkloadToken(token, { jwks: staticJwks({ [githubJwksUrl]: [ec.publicJwk] }), nowSeconds: NOW });
		expect(result).toMatchObject({ ok: true, provider: "github_actions" });
	});

	it("rejects tokens signed by a different key with the same kid", async () => {
		const token = await sign(other, vercelClaims());
		const result = await verifyWorkloadToken(token, { jwks: staticJwks({ [vercelJwksUrl]: [rsa.publicJwk] }), nowSeconds: NOW });
		expect(result).toEqual({ ok: false, reason: "workload_token_invalid_signature" });
	});

	it("rejects a tampered payload", async () => {
		const token = await sign(rsa, vercelClaims());
		const [header, , signature] = token.split(".");
		const forged = `${header}.${base64Url(JSON.stringify(vercelClaims({ owner_id: "team_victim" })))}.${signature}`;
		const result = await verifyWorkloadToken(forged, { jwks: staticJwks({ [vercelJwksUrl]: [rsa.publicJwk] }), nowSeconds: NOW });
		expect(result).toEqual({ ok: false, reason: "workload_token_invalid_signature" });
	});

	it("rejects none, HMAC and crit headers before fetching keys", async () => {
		const jwks = staticJwks({ [vercelJwksUrl]: [rsa.publicJwk] });
		for (const header of [{ alg: "none" }, { alg: "HS256" }, { crit: ["b64"] }]) {
			const token = await sign(rsa, vercelClaims(), header);
			const result = await verifyWorkloadToken(token, { jwks, nowSeconds: NOW });
			expect(result).toEqual({ ok: false, reason: "workload_token_unsupported_alg" });
		}
		expect(jwks.calls).toHaveLength(0);
	});

	it("refuses issuers outside the allowlist without fetching", async () => {
		const jwks = staticJwks({});
		const token = await sign(rsa, vercelClaims({ iss: "https://attacker.example.com" }));
		expect(await verifyWorkloadToken(token, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_issuer_not_trusted" });
		expect(jwks.calls).toHaveLength(0);
	});

	it("requires tokens minted for Phaseo before fetching keys", async () => {
		const jwks = staticJwks({ [vercelJwksUrl]: [rsa.publicJwk] });
		for (const aud of ["https://vercel.com/acme", ["https://vercel.com/acme", "sts.amazonaws.com"]]) {
			const token = await sign(rsa, vercelClaims({ aud }));
			expect(await verifyWorkloadToken(token, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_wrong_audience" });
		}
		expect(jwks.calls).toHaveLength(0);
		const multi = await sign(rsa, vercelClaims({ aud: ["https://vercel.com/acme", "https://api.phaseo.app"] }));
		expect((await verifyWorkloadToken(multi, { jwks, nowSeconds: NOW })).ok).toBe(true);
	});

	it("checks exp, nbf and maximum lifetime with clock skew", async () => {
		const jwks = staticJwks({ [vercelJwksUrl]: [rsa.publicJwk] });
		const expired = await sign(rsa, vercelClaims({ exp: NOW - 61 }));
		expect(await verifyWorkloadToken(expired, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_expired" });
		const withinSkew = await sign(rsa, vercelClaims({ exp: NOW - 30 }));
		expect((await verifyWorkloadToken(withinSkew, { jwks, nowSeconds: NOW })).ok).toBe(true);
		const future = await sign(rsa, vercelClaims({ nbf: NOW + 120, iat: NOW + 120, exp: NOW + 600 }));
		expect(await verifyWorkloadToken(future, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_not_yet_valid" });
		const longLived = await sign(rsa, vercelClaims({ exp: NOW + 13 * 3600 }));
		expect(await verifyWorkloadToken(longLived, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_lifetime_too_long" });
	});

	it("rejects missing or malformed claims", async () => {
		const jwks = staticJwks({ [vercelJwksUrl]: [rsa.publicJwk] });
		for (const overrides of [{ aud: undefined }, { aud: [] }, { exp: "soon" }, { iat: undefined }, { nbf: "x" }]) {
			const token = await sign(rsa, vercelClaims(overrides));
			expect(await verifyWorkloadToken(token, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_malformed" });
		}
		expect(await verifyWorkloadToken("a.b", { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_malformed" });
		expect(await verifyWorkloadToken(`${"a".repeat(9000)}.b.c`, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_malformed" });
	});

	it("refetches once on an unknown kid, then fails", async () => {
		const jwks = staticJwks({ [vercelJwksUrl]: [rsa.publicJwk] });
		const token = await sign(rsa, vercelClaims(), { kid: "rotated-away" });
		expect(await verifyWorkloadToken(token, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_key_not_found" });
		expect(jwks.calls.map((call) => call.forceRefresh)).toEqual([false, true]);
	});

	it("rejects a key whose declared alg differs", async () => {
		const jwks = staticJwks({ [vercelJwksUrl]: [{ ...rsa.publicJwk, alg: "RS512" } as JsonWebKey] });
		const token = await sign(rsa, vercelClaims());
		expect(await verifyWorkloadToken(token, { jwks, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_token_invalid_signature" });
	});

	it("reports JWKS outages distinctly", async () => {
		const token = await sign(rsa, vercelClaims());
		expect(await verifyWorkloadToken(token, { jwks: staticJwks({}), nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_jwks_unavailable" });
	});
});

describe("createJwksSource", () => {
	const url = "https://oidc.vercel.com/acme/.well-known/jwks";

	beforeEach(() => __resetWorkloadJwksCacheForTests());

	function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
		return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
	}

	it("caches in the isolate and in KV", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ keys: [{ kid: "k1", kty: "RSA" }] }));
		const store = new Map<string, string>();
		const kv = {
			get: vi.fn(async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null)),
			put: vi.fn(async (key: string, value: string) => void store.set(key, value)),
		} as unknown as KVNamespace;
		let now = 0;
		const source = createJwksSource({ kv, fetchImpl: fetchImpl as unknown as typeof fetch, nowMs: () => now });
		await source.getKeys(url);
		await source.getKeys(url);
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		// A new isolate (cleared L1) reads KV instead of the issuer.
		__resetWorkloadJwksCacheForTests();
		now = 1;
		expect(await source.getKeys(url)).toEqual([{ kid: "k1", kty: "RSA" }]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("rate-limits forced refreshes", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ keys: [] }));
		let now = 1_000_000;
		const source = createJwksSource({ fetchImpl: fetchImpl as unknown as typeof fetch, nowMs: () => now });
		await source.getKeys(url, { forceRefresh: true });
		await source.getKeys(url, { forceRefresh: true });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		now += 61_000;
		await source.getKeys(url, { forceRefresh: true });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("counts failed and concurrent forced refreshes toward the limit", async () => {
		const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));
		const source = createJwksSource({ fetchImpl: fetchImpl as unknown as typeof fetch, nowMs: () => 5_000_000 });
		const results = await Promise.allSettled(Array.from({ length: 4 }, () => source.getKeys(url, { forceRefresh: true })));
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
		await source.getKeys(url, { forceRefresh: true });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("backs off after a failed fetch and shares concurrent fetches", async () => {
		let status = 404;
		const fetchImpl = vi.fn(async () => status === 200 ? jsonResponse({ keys: [] }) : new Response("missing", { status }));
		let now = 9_000_000;
		const source = createJwksSource({ fetchImpl: fetchImpl as unknown as typeof fetch, nowMs: () => now });
		const first = await Promise.allSettled(Array.from({ length: 3 }, () => source.getKeys(url)));
		expect(first.every((result) => result.status === "rejected")).toBe(true);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		for (let i = 0; i < 5; i += 1) await expect(source.getKeys(url)).rejects.toThrow("jwks_backoff");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		now += 61_000;
		status = 200;
		await expect(source.getKeys(url)).resolves.toEqual([]);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("does not follow redirects and caps the response size", async () => {
		const redirecting = createJwksSource({
			fetchImpl: (async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })) as unknown as typeof fetch,
		});
		await expect(redirecting.getKeys(url)).rejects.toThrow("jwks_http_302");

		__resetWorkloadJwksCacheForTests();
		const huge = createJwksSource({
			fetchImpl: (async () => new Response(`{"keys":[],"pad":"${"x".repeat(70_000)}"}`)) as unknown as typeof fetch,
		});
		await expect(huge.getKeys(url)).rejects.toThrow("jwks_too_large");
	});
});

describe("trust policies", () => {
	function policy(overrides: Partial<WorkloadIdentityPolicy> = {}): WorkloadIdentityPolicy {
		return {
			id: "pol_1",
			workspaceId: "ws_1",
			keyId: "key_1",
			provider: "vercel",
			issuer: VERCEL_ISSUER,
			claimConditions: { owner_id: ["team_123"], project_id: ["prj_456"], environment: ["production"] },
			maxTokenLifetimeSeconds: 43_200,
			status: "active",
			...overrides,
		};
	}
	const claims = vercelClaims() as WorkloadTokenClaims;

	it("requires pinned immutable IDs per provider", () => {
		const missing = validateWorkloadIdentityPolicy({
			provider: "vercel",
			issuer: VERCEL_ISSUER,
			claimConditions: { owner: ["acme"] },
		});
		expect(missing).toMatchObject({ ok: false, errors: ['claim "owner_id" is required for vercel policies'] });

		const github = validateWorkloadIdentityPolicy({
			provider: "github_actions",
			issuer: GITHUB_ISSUER,
			claimConditions: { repository_owner_id: ["42"], repository_id: ["7"] },
		});
		expect(github).toMatchObject({ ok: true, value: { maxTokenLifetimeSeconds: 43_200 } });
	});

	it("rejects mismatched issuers, reserved claims and bad values", () => {
		const result = validateWorkloadIdentityPolicy({
			provider: "github_actions",
			issuer: VERCEL_ISSUER,
			claimConditions: { aud: ["x"], "bad name": ["x"], repository_owner_id: [" 42"] },
			maxTokenLifetimeSeconds: 10,
		});
		expect(result.ok).toBe(false);
		if (result.ok === false) {
			expect(result.errors).toEqual(expect.arrayContaining([
				"issuer is not a github_actions issuer",
				'claim "aud" cannot be a condition',
				'claim name "bad name" is invalid',
				'claim "repository_owner_id" values must be non-empty trimmed strings',
				"maxTokenLifetimeSeconds must be an integer from 60 to 43200",
			]));
		}
	});

	it("matches exactly one active policy", () => {
		expect(matchWorkloadIdentityPolicy(claims, [policy()])).toMatchObject({ ok: true, policy: { id: "pol_1" } });
		expect(matchWorkloadIdentityPolicy(claims, [policy({ status: "disabled" })])).toEqual({ ok: false, reason: "workload_identity_no_matching_policy" });
		expect(matchWorkloadIdentityPolicy(claims, [policy({ claimConditions: { owner_id: ["team_123"], environment: ["preview"] } })]))
			.toEqual({ ok: false, reason: "workload_identity_no_matching_policy" });
		// Platform default audiences never match, even if a stored policy is otherwise satisfied.
		expect(matchWorkloadIdentityPolicy({ ...claims, aud: "https://vercel.com/acme" }, [policy()]))
			.toEqual({ ok: false, reason: "workload_identity_no_matching_policy" });
		expect(matchWorkloadIdentityPolicy(claims, [policy({ maxTokenLifetimeSeconds: 600 })]))
			.toEqual({ ok: false, reason: "workload_identity_no_matching_policy" });
	});

	it("fails closed on ambiguity unless a workspace is named", () => {
		const both = [policy(), policy({ id: "pol_2", workspaceId: "ws_2", keyId: "key_2" })];
		expect(matchWorkloadIdentityPolicy(claims, both)).toEqual({ ok: false, reason: "workload_identity_ambiguous" });
		expect(matchWorkloadIdentityPolicy(claims, both, { workspaceId: "ws_2" })).toMatchObject({ ok: true, policy: { id: "pol_2" } });
	});

	it("never matches a stored policy that lost its pinned claim", () => {
		expect(matchWorkloadIdentityPolicy(claims, [policy({ claimConditions: { environment: ["production"] } })]))
			.toEqual({ ok: false, reason: "workload_identity_no_matching_policy" });
	});

	it("compares numeric claims as strings and ignores object claims", () => {
		const numeric = { ...claims, owner_id: 123 } as WorkloadTokenClaims;
		expect(matchWorkloadIdentityPolicy(numeric, [policy({ claimConditions: { owner_id: ["123"] } })]).ok).toBe(true);
		const objectClaim = { ...claims, owner_id: { id: "team_123" } } as unknown as WorkloadTokenClaims;
		expect(matchWorkloadIdentityPolicy(objectClaim, [policy()]).ok).toBe(false);
	});
});
