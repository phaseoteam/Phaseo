import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { betterAuthJwtConfigFromEnv, databaseClaims, needsSecondFactor, readBetterAuthIdentity, remoteKeySet, resetRemoteKeySets, verifyBetterAuthJwt, type BetterAuthJwtConfig } from "../src/auth/jwt";

const config: BetterAuthJwtConfig = { issuer: "https://phaseo.app", audience: "phaseo", jwksUrl: "https://phaseo.app/api/auth/jwks" };

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: { keys: JWK[] };

beforeAll(async () => {
	// Better Auth's jwt plugin signs with EdDSA (Ed25519) by default.
	const pair = await generateKeyPair("EdDSA", { crv: "Ed25519" });
	signingKey = pair.privateKey;
	otherKey = (await generateKeyPair("EdDSA", { crv: "Ed25519" })).privateKey;
	jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "key-1", alg: "EdDSA" }] };
});

afterEach(() => {
	vi.unstubAllGlobals();
	resetRemoteKeySets();
});

function token(overrides: { issuer?: string; audience?: string; expiresAt?: number | string; key?: CryptoKey; kid?: string; claims?: Record<string, unknown> } = {}) {
	return new SignJWT({ email: "user@example.com", sid: "session-1", aal: "aal1", role: "user", ...overrides.claims })
		.setProtectedHeader({ alg: "EdDSA", kid: overrides.kid ?? "key-1" })
		.setSubject("00000000-0000-4000-8000-000000000001")
		.setIssuer(overrides.issuer ?? config.issuer)
		.setAudience(overrides.audience ?? config.audience)
		.setIssuedAt()
		.setExpirationTime(overrides.expiresAt ?? "15m")
		.sign(overrides.key ?? signingKey);
}

const local = () => createLocalJWKSet(jwks);

describe("verifyBetterAuthJwt", () => {
	it("accepts a token from the configured issuer for the phaseo audience", async () => {
		const result = await verifyBetterAuthJwt(await token(), config, local());
		expect(result).toMatchObject({ ok: true, claims: { sub: "00000000-0000-4000-8000-000000000001", email: "user@example.com", aal: "aal1" } });
	});

	it("rejects another issuer", async () => {
		expect(await verifyBetterAuthJwt(await token({ issuer: "https://evil.example" }), config, local())).toEqual({ ok: false, reason: "issuer" });
	});

	it("rejects another audience", async () => {
		expect(await verifyBetterAuthJwt(await token({ audience: "authenticated" }), config, local())).toEqual({ ok: false, reason: "audience" });
	});

	it("rejects an expired token", async () => {
		const expiredAt = Math.floor(Date.now() / 1000) - 60;
		expect(await verifyBetterAuthJwt(await token({ expiresAt: expiredAt }), config, local())).toEqual({ ok: false, reason: "expired" });
	});

	it("rejects a token signed by a key that is not in the JWKS", async () => {
		expect(await verifyBetterAuthJwt(await token({ key: otherKey }), config, local())).toEqual({ ok: false, reason: "signature" });
	});

	it("rejects a tampered payload", async () => {
		const [header, , signature] = (await token()).split(".");
		const forged = Buffer.from(JSON.stringify({ sub: "someone-else", iss: config.issuer, aud: config.audience, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
		expect(await verifyBetterAuthJwt(`${header}.${forged}.${signature}`, config, local())).toEqual({ ok: false, reason: "signature" });
	});

	it("rejects an unknown key id and a token without exp", async () => {
		expect(await verifyBetterAuthJwt(await token({ kid: "key-2" }), config, local())).toEqual({ ok: false, reason: "unknown_key" });
		const noExp = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA", kid: "key-1" }).setSubject("u").setIssuer(config.issuer).setAudience(config.audience).sign(signingKey);
		expect(await verifyBetterAuthJwt(noExp, config, local())).toEqual({ ok: false, reason: "claims" });
	});

	it("rejects an HMAC token even if its secret were the public key", async () => {
		const hs = await new SignJWT({}).setProtectedHeader({ alg: "HS256", kid: "key-1" }).setSubject("u").setIssuer(config.issuer).setAudience(config.audience).setExpirationTime("5m").sign(new TextEncoder().encode("secret"));
		expect(await verifyBetterAuthJwt(hs, config, local())).toEqual({ ok: false, reason: "algorithm" });
	});

	it("rejects non-JWT bearer values without fetching keys", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect(await verifyBetterAuthJwt("opaque-session-token", config)).toEqual({ ok: false, reason: "malformed" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("fetches the JWKS once per isolate and reuses it", async () => {
		const fetchMock = vi.fn(async () => Response.json(jwks));
		vi.stubGlobal("fetch", fetchMock);
		expect((await verifyBetterAuthJwt(await token(), config)).ok).toBe(true);
		expect((await verifyBetterAuthJwt(await token(), config)).ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(config.jwksUrl);
		expect(remoteKeySet(config.jwksUrl)).toBe(remoteKeySet(config.jwksUrl));
	});

	it("reports an unreachable JWKS as unavailable, not as a bad token", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
		expect(await verifyBetterAuthJwt(await token(), config)).toEqual({ ok: false, reason: "jwks_unavailable" });
	});
});

describe("betterAuthJwtConfigFromEnv", () => {
	it("needs an issuer and derives the JWKS URL and audience", () => {
		expect(betterAuthJwtConfigFromEnv({})).toBeNull();
		expect(betterAuthJwtConfigFromEnv({ BETTER_AUTH_URL: "https://phaseo.app/" })).toEqual(config);
		expect(betterAuthJwtConfigFromEnv({ BETTER_AUTH_JWT_ISSUER: "https://staging.phaseo.app", BETTER_AUTH_URL: "https://phaseo.app", BETTER_AUTH_JWT_AUDIENCE: "x", BETTER_AUTH_JWKS_URL: "https://keys.example/jwks" })).toEqual({
			issuer: "https://staging.phaseo.app",
			audience: "x",
			jwksUrl: "https://keys.example/jwks",
		});
	});
});

describe("readBetterAuthIdentity", () => {
	const reader = (rows: Record<string, unknown>) => {
		const columns: Record<string, string> = {};
		return {
			columns,
			from: (table: string) => ({
				select: (selected: string) => {
					columns[table] = selected;
					return { eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }) };
				},
			}),
		};
	};
	const user = { id: "u", banned: false, ban_expires: null };
	const session = { id: "s", user_id: "u", expires_at: "2999-01-01T00:00:00Z", aal: "aal1" };

	it("returns the rows for a live session and never selects the session token", async () => {
		const auth = reader({ users: user, sessions: session });
		expect(await readBetterAuthIdentity(auth, { sub: "u", sid: "s" })).toEqual({ user, session });
		expect(auth.columns.sessions).not.toMatch(/token/);
	});

	it("refuses a missing sid, a foreign or expired session and a current ban", async () => {
		expect(await readBetterAuthIdentity(reader({ users: user, sessions: session }), { sub: "u" })).toBeNull();
		expect(await readBetterAuthIdentity(reader({ users: user, sessions: { ...session, user_id: "x" } }), { sub: "u", sid: "s" })).toBeNull();
		expect(await readBetterAuthIdentity(reader({ users: user, sessions: { ...session, expires_at: "2000-01-01T00:00:00Z" } }), { sub: "u", sid: "s" })).toBeNull();
		expect(await readBetterAuthIdentity(reader({ users: { ...user, banned: true }, sessions: session }), { sub: "u", sid: "s" })).toBeNull();
	});
});

describe("databaseClaims and needsSecondFactor", () => {
	it("always sets the database role and keeps Better Auth's role apart", () => {
		expect(databaseClaims({ sub: "u", role: "admin", sid: "s", aal: "aal2" })).toEqual({ sub: "u", aal: "aal2", session_id: "s", user_role: "admin", role: "authenticated" });
		expect(databaseClaims({ sub: "u", role: "authenticated", session_id: "s" })).toEqual({ sub: "u", session_id: "s", role: "authenticated" });
	});

	it("matches the web's MFA rule", () => {
		expect(needsSecondFactor({ two_factor_enabled: true, aal: "aal1" })).toBe(true);
		expect(needsSecondFactor({ two_factor_enabled: true, aal: "aal2" })).toBe(false);
		expect(needsSecondFactor({ two_factor_enabled: false, aal: "aal1" })).toBe(false);
		expect(needsSecondFactor({ mfa_reenrollment_required: true, aal: "aal2" })).toBe(true);
	});
});
