import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isCustomIssuer, jwksUrlForIssuer, providerForIssuer } from "./issuers";
import { __resetWorkloadJwksCacheForTests, createJwksSource, verifyWorkloadToken, type JwksSource, type WorkloadTokenClaims } from "./verify";
import { matchWorkloadIdentityPolicy, validateWorkloadIdentityPolicy, type WorkloadIdentityPolicy } from "./policy";
import { base64Url, makeTestSigner, signTestToken, type TestSigner } from "./testing";

const NOW = 1_800_000_000;
const AWS_ISSUER = "https://0b1e8a9c-2d3f-4a5b-8c7d-9e0f1a2b3c4d.tokens.sts.global.api.aws";
const CIRCLECI_ORG = "7d1c3a52-0b1e-4c6f-9a2d-3e4f5a6b7c8d";
const CIRCLECI_ISSUER = `https://oidc.circleci.com/org/${CIRCLECI_ORG}`;
const CUSTOM_ISSUER = "https://oidc.example.com/clusters/prod";
const DISCOVERY_URL = `${CUSTOM_ISSUER}/.well-known/openid-configuration`;
const CUSTOM_JWKS_URL = "https://oidc.example.com/clusters/prod/keys";

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		iss: CUSTOM_ISSUER,
		aud: "https://api.phaseo.app",
		sub: "system:serviceaccount:prod:api",
		iat: NOW - 60,
		exp: NOW + 3600,
		...overrides,
	};
}

function staticJwks(keysByUrl: Record<string, JsonWebKey[]>): JwksSource {
	return {
		async getKeys(url) {
			const keys = keysByUrl[url];
			if (!keys) throw new Error("not found");
			return keys;
		},
	};
}

function customSource(documents: Record<string, unknown>) {
	const fetches: string[] = [];
	const fetchImpl = vi.fn(async (url: string) => {
		fetches.push(url);
		return url in documents
			? new Response(JSON.stringify(documents[url]), { status: 200, headers: { "content-type": "application/json" } })
			: new Response("not found", { status: 404 });
	});
	return { fetches, source: createJwksSource({ fetchImpl: fetchImpl as unknown as typeof fetch }) };
}

let rsa: TestSigner;

beforeAll(async () => {
	rsa = await makeTestSigner("RS256", "custom-key-1");
});

beforeEach(() => __resetWorkloadJwksCacheForTests());

describe("preset issuers", () => {
	it("maps each preset issuer to its own JWKS URL", () => {
		expect(jwksUrlForIssuer("https://gitlab.com", "gitlab")).toBe("https://gitlab.com/oauth/discovery/keys");
		expect(jwksUrlForIssuer("https://accounts.google.com", "google_cloud")).toBe("https://www.googleapis.com/oauth2/v3/certs");
		expect(jwksUrlForIssuer("https://agent.buildkite.com", "buildkite")).toBe("https://agent.buildkite.com/.well-known/jwks");
		expect(jwksUrlForIssuer(CIRCLECI_ISSUER, "circleci")).toBe(`${CIRCLECI_ISSUER}/.well-known/jwks-pub.json`);
		expect(jwksUrlForIssuer(AWS_ISSUER, "aws")).toBe(`${AWS_ISSUER}/.well-known/jwks.json`);
		// Custom issuers use discovery, and a preset URL never resolves for the wrong provider.
		expect(jwksUrlForIssuer(CUSTOM_ISSUER, "custom")).toBeNull();
		expect(jwksUrlForIssuer("https://gitlab.com", "google_cloud")).toBeNull();
		expect(providerForIssuer("https://gitlab.com")).toBe("gitlab");
		expect(providerForIssuer(AWS_ISSUER)).toBe("aws");
	});

	it("validates each preset's pinned owner claim", () => {
		const cases: Array<[Parameters<typeof validateWorkloadIdentityPolicy>[0], true | string]> = [
			[{ provider: "gitlab", issuer: "https://gitlab.com", claimConditions: { project_id: ["42"] } }, true],
			[{ provider: "gitlab", issuer: "https://gitlab.com", claimConditions: { namespace_id: ["42"] } }, 'claim "project_id" is required for gitlab policies'],
			[{ provider: "gitlab", issuer: "https://gitlab.acme.dev", claimConditions: { project_id: ["42"] } }, "issuer is not a gitlab issuer"],
			[{ provider: "google_cloud", issuer: "https://accounts.google.com", claimConditions: { sub: ["1044"] } }, true],
			[{ provider: "buildkite", issuer: "https://agent.buildkite.com", claimConditions: { organization_id: ["org-uuid"] } }, true],
			[{ provider: "aws", issuer: AWS_ISSUER, claimConditions: { sub: ["arn:aws:iam::123456789012:role/api"] } }, true],
			[{ provider: "circleci", issuer: CIRCLECI_ISSUER, claimConditions: { "oidc.circleci.com/org-id": [CIRCLECI_ORG] } }, true],
			// A CircleCI issuer belongs to one organization.
			[
				{ provider: "circleci", issuer: CIRCLECI_ISSUER, claimConditions: { "oidc.circleci.com/org-id": ["someone-else"] } },
				'claim "oidc.circleci.com/org-id" must be the organization ID in the issuer',
			],
		];
		for (const [input, expected] of cases) {
			const result = validateWorkloadIdentityPolicy(input);
			if (expected === true) expect(result.ok, JSON.stringify(input)).toBe(true);
			else expect(result).toMatchObject({ ok: false, errors: expect.arrayContaining([expected]) });
		}
	});

	it("verifies ES384 tokens, as AWS issues by default", async () => {
		const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-384" }, true, ["sign", "verify"]) as CryptoKeyPair;
		const publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey) as JsonWebKey), kid: "aws-key-1", alg: "ES384", use: "sig" };
		const body = base64Url(JSON.stringify(claims({ iss: AWS_ISSUER, sub: "arn:aws:iam::123456789012:role/api" })));
		const header = base64Url(JSON.stringify({ typ: "JWT", alg: "ES384", kid: "aws-key-1" }));
		const signature = base64Url(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-384" }, pair.privateKey, new TextEncoder().encode(`${header}.${body}`))));
		const jwks = staticJwks({ [`${AWS_ISSUER}/.well-known/jwks.json`]: [publicJwk] });
		const options = { jwks, nowSeconds: NOW, configuredIssuers: new Set([AWS_ISSUER]) };
		expect(await verifyWorkloadToken(`${header}.${body}.${signature}`, options)).toMatchObject({ ok: true, provider: "aws" });
		// The same signature labelled ES256 does not verify.
		const relabelled = base64Url(JSON.stringify({ typ: "JWT", alg: "ES256", kid: "aws-key-1" }));
		expect((await verifyWorkloadToken(`${relabelled}.${body}.${signature}`, options)).ok).toBe(false);
	});
});

describe("custom issuers", () => {
	it("accepts only public https issuers on hosts no preset owns", () => {
		for (const issuer of [CUSTOM_ISSUER, "https://oidc.example.com", "https://westeurope.oic.prod-aks.azure.com/tid/uid/", "https://gitlab.acme.dev"]) {
			expect(isCustomIssuer(issuer), issuer).toBe(true);
			expect(providerForIssuer(issuer)).toBe("custom");
		}
		for (const issuer of [
			"http://oidc.example.com",
			"https://oidc.example.com:8443",
			"https://user:pw@oidc.example.com",
			"https://oidc.example.com/?x=1",
			"https://oidc.example.com/#x",
			"https://OIDC.example.com",
			" https://oidc.example.com",
			"https://10.0.0.1",
			"https://[::1]",
			"https://localhost",
			"https://metadata.google.internal",
			"https://printer.local",
			"https://intranet",
			// Hosts that belong to a preset must use it, with its pinned owner claim.
			"https://gitlab.com/group",
			"https://oidc.vercel.com/acme/extra",
			"https://accounts.google.com/o",
			"https://oidc.circleci.com",
			"https://tokens.sts.global.api.aws",
			"https://agent.buildkite.com/x",
			"https://token.actions.githubusercontent.com/a/b",
		]) {
			expect(isCustomIssuer(issuer), issuer).toBe(false);
		}
	});

	it("finds the keys through the discovery document, then serves both from cache", async () => {
		const { fetches, source } = customSource({
			[DISCOVERY_URL]: { issuer: CUSTOM_ISSUER, jwks_uri: CUSTOM_JWKS_URL },
			[CUSTOM_JWKS_URL]: { keys: [rsa.publicJwk] },
		});
		const token = await signTestToken(rsa, claims());
		const options = { jwks: source, nowSeconds: NOW, configuredIssuers: new Set([CUSTOM_ISSUER]) };
		expect(await verifyWorkloadToken(token, options)).toMatchObject({ ok: true, provider: "custom" });
		expect(await verifyWorkloadToken(token, options)).toMatchObject({ ok: true });
		expect(fetches).toEqual([DISCOVERY_URL, CUSTOM_JWKS_URL]);
	});

	it("checks the exact issuer on cached discovery documents too", async () => {
		const { fetches, source } = customSource({
			"https://oidc.example.com/.well-known/openid-configuration": { issuer: "https://oidc.example.com", jwks_uri: "https://oidc.example.com/keys" },
			"https://oidc.example.com/keys": { keys: [rsa.publicJwk] },
		});
		const configuredIssuers = new Set(["https://oidc.example.com", "https://oidc.example.com/"]);
		const exact = await signTestToken(rsa, claims({ iss: "https://oidc.example.com" }));
		const slashed = await signTestToken(rsa, claims({ iss: "https://oidc.example.com/" }));
		expect(await verifyWorkloadToken(exact, { jwks: source, nowSeconds: NOW, configuredIssuers })).toMatchObject({ ok: true });
		expect(await verifyWorkloadToken(slashed, { jwks: source, nowSeconds: NOW, configuredIssuers })).toEqual({ ok: false, reason: "workload_jwks_unavailable" });
		expect(fetches).toHaveLength(2);
	});

	it("stops reading a discovery body without Content-Length once it passes 64 KB", async () => {
		let pulled = 0;
		const chunk = new TextEncoder().encode(" ".repeat(16 * 1024));
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += 1;
				controller.enqueue(chunk);
			},
		});
		const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
		const source = createJwksSource({ fetchImpl: fetchImpl as unknown as typeof fetch });
		await expect(source.getJwksUri!(CUSTOM_ISSUER)).rejects.toThrow("jwks_too_large");
		// The body is endless; reading stops just past the cap.
		expect(pulled).toBeLessThanOrEqual(6);
	});

	it("never discovers an issuer that no policy names, or without the configured list", async () => {
		const { fetches, source } = customSource({});
		const token = await signTestToken(rsa, claims());
		expect(await verifyWorkloadToken(token, { jwks: source, nowSeconds: NOW, configuredIssuers: new Set(["https://other.example.com"]) }))
			.toEqual({ ok: false, reason: "workload_issuer_not_trusted" });
		expect(await verifyWorkloadToken(token, { jwks: source, nowSeconds: NOW })).toEqual({ ok: false, reason: "workload_issuer_not_trusted" });
		expect(fetches).toEqual([]);
	});

	it("refuses discovery documents for another issuer or with keys off the issuer's host", async () => {
		for (const document of [
			{ issuer: "https://attacker.example.net", jwks_uri: CUSTOM_JWKS_URL },
			{ issuer: CUSTOM_ISSUER, jwks_uri: "https://attacker.example.net/keys" },
			{ issuer: CUSTOM_ISSUER, jwks_uri: "http://oidc.example.com/keys" },
			{ issuer: CUSTOM_ISSUER, jwks_uri: "https://oidc.example.com:8443/keys" },
			{ issuer: CUSTOM_ISSUER },
		]) {
			__resetWorkloadJwksCacheForTests();
			const { fetches, source } = customSource({ [DISCOVERY_URL]: document, "https://attacker.example.net/keys": { keys: [rsa.publicJwk] } });
			const token = await signTestToken(rsa, claims());
			expect(await verifyWorkloadToken(token, { jwks: source, nowSeconds: NOW, configuredIssuers: new Set([CUSTOM_ISSUER]) }))
				.toEqual({ ok: false, reason: "workload_jwks_unavailable" });
			expect(fetches).toEqual([DISCOVERY_URL]);
		}
	});

	it("pins the claim the policy chooses and matches on it", () => {
		const base = { provider: "custom" as const, issuer: CUSTOM_ISSUER, pinnedClaim: "sub", claimConditions: { sub: ["system:serviceaccount:prod:api"] } };
		expect(validateWorkloadIdentityPolicy(base)).toMatchObject({ ok: true, value: { pinnedClaim: "sub" } });
		for (const [input, error] of [
			[{ pinnedClaim: null }, "owner_claim must be a claim name such as sub"],
			[{ pinnedClaim: "aud" }, "owner_claim must be a claim name such as sub"],
			[{ pinnedClaim: "__proto__" }, "owner_claim must be a claim name such as sub"],
			[{ pinnedClaim: "constructor" }, "owner_claim must be a claim name such as sub"],
			[{ claimConditions: {} }, 'claim "sub" is required for custom policies'],
			[{ issuer: "https://gitlab.com" }, "issuer must be a public https URL on a host that is not a preset platform's"],
		] as const) {
			expect(validateWorkloadIdentityPolicy({ ...base, ...input })).toMatchObject({ ok: false, errors: expect.arrayContaining([error]) });
		}
		// A preset ignores a pinned claim supplied with it.
		expect(validateWorkloadIdentityPolicy({ provider: "gitlab", issuer: "https://gitlab.com", pinnedClaim: "sub", claimConditions: { project_id: ["1"] } }))
			.toMatchObject({ ok: true, value: { pinnedClaim: null } });

		const policy: WorkloadIdentityPolicy = {
			id: "pol_custom",
			workspaceId: "ws_1",
			keyId: "key_1",
			provider: "custom",
			issuer: CUSTOM_ISSUER,
			pinnedClaim: "workspaceUuid",
			claimConditions: { workspaceUuid: ["{ws-1}"], "oidc.example.com/env": ["prod"] },
			maxTokenLifetimeSeconds: 43_200,
			status: "active",
		};
		const tokenClaims = claims({ workspaceUuid: "{ws-1}", "oidc.example.com/env": "prod" }) as WorkloadTokenClaims;
		expect(matchWorkloadIdentityPolicy(tokenClaims, [policy])).toMatchObject({ ok: true });
		expect(matchWorkloadIdentityPolicy({ ...tokenClaims, workspaceUuid: "{ws-2}" }, [policy])).toMatchObject({ ok: false });
		// A stored custom policy that lost its pinned claim never matches.
		expect(matchWorkloadIdentityPolicy(tokenClaims, [{ ...policy, pinnedClaim: null }])).toMatchObject({ ok: false });
	});
});
