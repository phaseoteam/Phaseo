import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HyperdriveScope } from "@phaseo/db/hyperdrive-scope";
import { resetRemoteKeySets } from "@phaseo/db/jwt";
import { runWithDatabaseScope } from "@/runtime/database";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import { getSupabaseActor } from "./service";

const ISSUER = "https://phaseo.app";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const env = {
	DATABASE_PROVIDER: "planetscale",
	AUTH_PROVIDER: "better-auth",
	BETTER_AUTH_JWT_ISSUER: ISSUER,
	HYPERDRIVE: { connectionString: "postgres://hyperdrive.invalid/db" },
	GATEWAY_CACHE: {},
} as any;

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
	return new SignJWT({ email: "user@example.com", sid: "session-1", aal: "aal2", role: "user", ...options.claims })
		.setProtectedHeader({ alg: "EdDSA", kid: "k1" })
		.setSubject(USER_ID)
		.setIssuer(options.issuer ?? ISSUER)
		.setAudience(options.audience ?? "phaseo")
		.setIssuedAt()
		.setExpirationTime(options.exp ?? "15m")
		.sign(options.key ?? privateKey);
}

const rows = {
	users: { id: USER_ID, email: "user@example.com", name: "Ada", image: null, created_at: "2026-01-01T00:00:00Z", two_factor_enabled: true, mfa_reenrollment_required: false, banned: false, ban_expires: null, raw_app_meta_data: {}, raw_user_meta_data: {} },
	sessions: { id: "session-1", user_id: USER_ID, expires_at: new Date(Date.now() + 3_600_000).toISOString(), aal: "aal2" },
} as Record<string, Record<string, unknown> | null>;

async function actorFor(token: string, tableRows = rows) {
	const reads: string[] = [];
	const scope = {
		serviceClient: () => ({}),
		client: vi.fn(() => ({
			from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { reads.push(table); return { data: tableRows[table], error: null }; } }) }) }),
		})),
		trackingContext: (ctx: unknown) => ctx,
		trackResponse: (response: Response) => response,
		close: () => undefined,
	};
	const actor = await runWithDatabaseScope(env, { waitUntil: () => undefined }, () => getSupabaseActor(token), () => scope as unknown as HyperdriveScope);
	return { actor, reads, scope };
}

beforeEach(() => {
	resetRemoteKeySets();
	configureRuntime(env);
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
		String(input) === `${ISSUER}/api/auth/jwks` ? Response.json(jwks) : new Response("unexpected", { status: 500 })));
});

afterEach(() => {
	vi.unstubAllGlobals();
	clearRuntime();
});

describe("getSupabaseActor with AUTH_PROVIDER=better-auth", () => {
	it("returns the person for a valid Better Auth JWT", async () => {
		const { actor, scope } = await actorFor(await sign());
		expect(actor).toEqual({ userId: USER_ID, clientId: null, mfaRequired: true, assuranceLevel: "aal2", email: "user@example.com", name: "Ada" });
		expect(scope.client).toHaveBeenCalledWith({ role: "service_role", schemas: ["auth"] });
	});

	it.each([
		["another issuer", { issuer: "https://evil.example" }],
		["another audience", { audience: "authenticated" }],
		["an expired token", { exp: Math.floor(Date.now() / 1000) - 120 }],
	])("rejects %s before reading the database", async (_name, options) => {
		const { actor, reads } = await actorFor(await sign(options));
		expect(actor).toBeNull();
		expect(reads).toEqual([]);
	});

	it("rejects a bad signature", async () => {
		expect((await actorFor(await sign({ key: otherKey }))).actor).toBeNull();
	});

	it("refuses a token issued to a third-party app but keeps Phaseo's own apps", async () => {
		expect((await actorFor(await sign({ claims: { client_id: "partner_app" } }))).actor).toBeNull();
		expect((await actorFor(await sign({ claims: { client_id: "phaseo_desktop" } }))).actor).toMatchObject({ clientId: "phaseo_desktop" });
	});

	it("treats a signed-out session as signed out", async () => {
		expect((await actorFor(await sign(), { ...rows, sessions: null })).actor).toBeNull();
	});
});
