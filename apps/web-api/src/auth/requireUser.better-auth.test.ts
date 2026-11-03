import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HyperdriveScope } from "@phaseo/db/hyperdrive-scope";
import { resetRemoteKeySets } from "@phaseo/db/jwt";
import type { Env } from "@/env";
import { runWithDataScope, type DataScope } from "@/data/scope";
import { getAuthenticatedDataClient } from "@/data/supabase";
import { requireUser } from "./requireUser";

const ISSUER = "https://phaseo.app";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const env = {
	DATABASE_PROVIDER: "planetscale",
	AUTH_PROVIDER: "better-auth",
	BETTER_AUTH_JWT_ISSUER: ISSUER,
	HYPERDRIVE: { connectionString: "postgres://hyperdrive.invalid/db" },
} as unknown as Env;

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: { keys: JWK[] };

beforeAll(async () => {
	const pair = await generateKeyPair("EdDSA", { crv: "Ed25519" });
	privateKey = pair.privateKey;
	otherKey = (await generateKeyPair("EdDSA", { crv: "Ed25519" })).privateKey;
	jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "EdDSA" }] };
});

function sign(options: { issuer?: string; audience?: string; exp?: number | string; key?: CryptoKey; claims?: Record<string, unknown> } = {}) {
	return new SignJWT({ email: "user@example.com", sid: "session-1", aal: "aal1", role: "user", two_factor_enabled: false, ...options.claims })
		.setProtectedHeader({ alg: "EdDSA", kid: "k1" })
		.setSubject(USER_ID)
		.setIssuer(options.issuer ?? ISSUER)
		.setAudience(options.audience ?? "phaseo")
		.setIssuedAt()
		.setExpirationTime(options.exp ?? "15m")
		.sign(options.key ?? privateKey);
}

type Rows = { users: Record<string, unknown> | null; sessions: Record<string, unknown> | null };
const future = () => new Date(Date.now() + 3_600_000).toISOString();

function scopeWith(rows: Rows) {
	const reads: Array<{ table: string; options: unknown }> = [];
	const authClient = (options: unknown) => ({
		from: (table: "users" | "sessions") => ({
			select: () => ({ eq: () => ({ maybeSingle: async () => { reads.push({ table, options }); return { data: rows[table], error: null }; } }) }),
		}),
	});
	const db = {
		serviceClient: () => ({}),
		client: vi.fn((options: { role: string }) => (options.role === "service_role" ? authClient(options) : { user: options })),
		trackingContext: (ctx: unknown) => ctx,
		trackResponse: (response: Response) => response,
		close: () => undefined,
	};
	const scope: DataScope = { db: db as unknown as HyperdriveScope, verifiedClaims: new Map(), userClients: new Map() };
	return { scope, db, reads };
}

const userRow = (overrides: Record<string, unknown> = {}) => ({
	id: USER_ID, email: "user@example.com", name: "Ada", image: null, created_at: "2026-01-01T00:00:00Z",
	two_factor_enabled: false, mfa_reenrollment_required: false, banned: false, ban_expires: null,
	raw_app_meta_data: { provider: "google" }, raw_user_meta_data: { avatar_url: "https://a/b.png" }, ...overrides,
});
const sessionRow = (overrides: Record<string, unknown> = {}) => ({ id: "session-1", user_id: USER_ID, expires_at: future(), aal: "aal1", ...overrides });

const request = (token: string) => new Request("https://phaseo.app/api/account/auth/workspaces", { headers: { authorization: `Bearer ${token}` } });

async function run(token: string, rows: Rows = { users: userRow(), sessions: sessionRow() }) {
	const { scope, db, reads } = scopeWith(rows);
	const result = await runWithDataScope(env, { waitUntil: () => undefined }, async () => ({
		user: await requireUser(request(token), env),
		userClient: getAuthenticatedDataClient(env, request(token)),
	}), scope);
	return { ...result, db, reads };
}

beforeEach(() => {
	resetRemoteKeySets();
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
		String(input) === `${ISSUER}/api/auth/jwks` ? Response.json(jwks) : new Response("unexpected", { status: 500 })));
});

afterEach(() => vi.unstubAllGlobals());

describe("requireUser with AUTH_PROVIDER=better-auth", () => {
	it("accepts a valid Better Auth JWT and lets the user client act with database claims", async () => {
		const { user, userClient, reads } = await run(await sign());
		expect(user).toEqual({
			id: USER_ID,
			email: "user@example.com",
			createdAt: "2026-01-01T00:00:00Z",
			appMetadata: { provider: "google" },
			userMetadata: { name: "Ada", full_name: "Ada", avatar_url: "https://a/b.png" },
			factors: [],
		});
		expect(reads.map((read) => read.table).sort()).toEqual(["sessions", "users"]);
		expect(reads[0]?.options).toEqual({ role: "service_role", schemas: ["auth"] });
		expect(userClient).toEqual({ user: { role: "authenticated", claims: expect.objectContaining({ sub: USER_ID, role: "authenticated", user_role: "user", session_id: "session-1", aal: "aal1" }) } });
	});

	it.each([
		["another issuer", { issuer: "https://evil.example" }],
		["another audience", { audience: "authenticated" }],
		["an expired token", { exp: Math.floor(Date.now() / 1000) - 120 }],
	])("rejects %s", async (_name, options) => {
		const { user, userClient, reads } = await run(await sign(options));
		expect(user).toBeNull();
		expect(userClient).toBeNull();
		expect(reads).toEqual([]);
	});

	it("rejects a bad signature", async () => {
		expect((await run(await sign({ key: otherKey }))).user).toBeNull();
	});

	it("rejects a Supabase-style opaque or foreign token without touching the database", async () => {
		const { user, reads } = await run("opaque-session-token");
		expect(user).toBeNull();
		expect(reads).toEqual([]);
	});

	it("treats a signed-out, expired or someone else's session as signed out", async () => {
		expect((await run(await sign(), { users: userRow(), sessions: null })).user).toBeNull();
		expect((await run(await sign(), { users: userRow(), sessions: sessionRow({ expires_at: "2020-01-01T00:00:00Z" }) })).user).toBeNull();
		expect((await run(await sign(), { users: userRow(), sessions: sessionRow({ user_id: "someone-else" }) })).user).toBeNull();
	});

	it("treats a banned user as signed out until the ban expires", async () => {
		expect((await run(await sign(), { users: userRow({ banned: true }), sessions: sessionRow() })).user).toBeNull();
		expect((await run(await sign(), { users: userRow({ banned: true, ban_expires: "2020-01-01T00:00:00Z" }), sessions: sessionRow() })).user).not.toBeNull();
	});

	it("needs an aal2 session when two-factor is on", async () => {
		const twoFactor = { users: userRow({ two_factor_enabled: true }), sessions: sessionRow() };
		expect((await run(await sign(), twoFactor)).user).toBeNull();
		const verified = await run(await sign({ claims: { aal: "aal2" } }), { ...twoFactor, sessions: sessionRow({ aal: "aal2" }) });
		expect(verified.user?.factors).toEqual([{ id: "better-auth-totp", factor_type: "totp", status: "verified" }]);
		expect((await run(await sign({ claims: { aal: "aal2" } }), { users: userRow({ mfa_reenrollment_required: true }), sessions: sessionRow({ aal: "aal2" }) })).user).toBeNull();
	});

	it("is signed out when the issuer isn't configured", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { scope } = scopeWith({ users: userRow(), sessions: sessionRow() });
		const unconfigured = { ...env, BETTER_AUTH_JWT_ISSUER: undefined } as Env;
		const user = await runWithDataScope(unconfigured, { waitUntil: () => undefined }, async () => requireUser(request(await sign()), unconfigured), scope);
		expect(user).toBeNull();
		expect(errors).toHaveBeenCalled();
		errors.mockRestore();
	});
});
