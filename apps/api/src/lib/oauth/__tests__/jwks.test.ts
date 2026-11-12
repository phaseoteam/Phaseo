/**
 * Forced JWKS refreshes run before any signature check, so forged tokens with
 * random kids must not be able to drive Supabase fetches, KV churn or the
 * error marker that would break genuine logins.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetOAuthJwksStateForTests, getJWKSWithCache, getJWKSWithRetry } from "../jwks";
import { validateOAuthToken } from "../jwt";

const SUPABASE_URL = "https://proj.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

type Signer = { privateKey: CryptoKey; publicJwk: JsonWebKey };

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makeSigner(kid: string): Promise<Signer> {
	const pair = await crypto.subtle.generateKey(
		{ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
		true,
		["sign", "verify"],
	) as CryptoKeyPair;
	const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey) as JsonWebKey;
	return { privateKey: pair.privateKey, publicJwk: { ...publicJwk, kid, alg: "RS256", use: "sig" } as JsonWebKey };
}

async function signToken(signer: Signer, kid: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const encode = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
	const input = `${encode({ alg: "RS256", typ: "JWT", kid })}.${encode({
		iss: ISSUER,
		aud: "authenticated",
		iat: now - 5,
		exp: now + 3600,
		user_id: "user_1",
		workspace_id: "ws_1",
		client_id: "client_1",
	})}`;
	const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signer.privateKey, new TextEncoder().encode(input)));
	return `${input}.${base64Url(signature)}`;
}

function makeKv() {
	const store = new Map<string, string>();
	const ops = { puts: [] as string[], deletes: [] as string[] };
	const kv = {
		async get(key: string, type?: string) {
			const value = store.get(key);
			if (value === undefined) return null;
			return type === "json" ? JSON.parse(value) : value;
		},
		async put(key: string, value: string) {
			ops.puts.push(key);
			store.set(key, value);
		},
		async delete(key: string) {
			ops.deletes.push(key);
			store.delete(key);
		},
	};
	return { kv: kv as unknown as KVNamespace, store, ops };
}

/** Mirrors the OAuth call sites in pipeline/before/auth.ts and oauth.ts. */
async function verify(token: string, kv: KVNamespace, nowMs: number) {
	let jwks = await getJWKSWithCache(SUPABASE_URL, kv);
	let validation = await validateOAuthToken(token, jwks.keys, ISSUER, "authenticated");
	if (!validation.valid && validation.error?.includes("Public key not found")) {
		jwks = await getJWKSWithRetry(SUPABASE_URL, kv, true, nowMs);
		validation = await validateOAuthToken(token, jwks.keys, ISSUER, "authenticated");
	}
	return validation;
}

let good: Signer;
let rotated: Signer;
let attacker: Signer;
let served: () => JsonWebKey[];
let failFetch = false;
let fetches = 0;

beforeAll(async () => {
	[good, rotated, attacker] = await Promise.all([makeSigner("good"), makeSigner("rotated"), makeSigner("attacker")]);
});

beforeEach(() => {
	__resetOAuthJwksStateForTests();
	served = () => [good.publicJwk];
	failFetch = false;
	fetches = 0;
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		if (String(input) !== JWKS_URL) return new Response("not found", { status: 404 });
		fetches += 1;
		if (failFetch) return new Response("unavailable", { status: 503 });
		return new Response(JSON.stringify({ keys: served() }), { status: 200 });
	}));
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("OAuth JWKS forced refresh", () => {
	it("lets many forged tokens with random kids force at most one fetch per minute", async () => {
		const { kv, store, ops } = makeKv();
		const now = Date.now();
		const genuine = await signToken(good, "good");
		expect((await verify(genuine, kv, now)).valid).toBe(true);
		expect(fetches).toBe(1);
		ops.puts.length = 0;

		for (let i = 0; i < 50; i += 1) {
			const forged = await signToken(attacker, `kid-${crypto.randomUUID()}`);
			const result = await verify(forged, kv, now + i * 1000);
			expect(result.valid).toBe(false);
		}

		expect(fetches).toBe(2);
		// The good JWKS is never deleted, and no error marker is written.
		expect(ops.deletes).not.toContain("oauth:jwks");
		expect(store.has("oauth:jwks:error")).toBe(false);
		expect(ops.puts.filter((key) => key === "oauth:jwks")).toHaveLength(1);
		expect((await verify(genuine, kv, now + 59_000)).valid).toBe(true);
		expect(fetches).toBe(2);
	});

	it("keeps genuine tokens working when a forced refresh fails", async () => {
		const { kv, store } = makeKv();
		const now = Date.now();
		const genuine = await signToken(good, "good");
		expect((await verify(genuine, kv, now)).valid).toBe(true);

		failFetch = true;
		const forged = await signToken(attacker, "random-kid");
		expect((await verify(forged, kv, now)).error).toContain("Public key not found");
		expect(fetches).toBe(2);
		expect(store.has("oauth:jwks:error")).toBe(false);
		expect(store.has("oauth:jwks")).toBe(true);

		// Later forged tokens inside the window do not fetch again.
		await verify(await signToken(attacker, "another-kid"), kv, now + 30_000);
		expect(fetches).toBe(2);
		expect((await verify(genuine, kv, now + 30_000)).valid).toBe(true);
	});

	it("serves this isolate's last JWKS when KV is not in use", async () => {
		const now = Date.now();
		// No KV: the first call fetches; forced refreshes inside the window do not.
		const first = await getJWKSWithCache(SUPABASE_URL, null);
		expect(first.keys).toHaveLength(1);
		await getJWKSWithRetry(SUPABASE_URL, null, true, now);
		const throttled = await getJWKSWithRetry(SUPABASE_URL, null, true, now + 1_000);
		expect(fetches).toBe(2);
		expect(throttled.keys.map((key) => (key as { kid?: string }).kid)).toEqual(["good"]);
	});

	it("still picks up a rotated key once the window has passed", async () => {
		const { kv } = makeKv();
		const now = Date.now();
		expect((await verify(await signToken(good, "good"), kv, now)).valid).toBe(true);
		// A forged token uses the refresh slot just before the real rotation.
		await verify(await signToken(attacker, "random-kid"), kv, now);
		served = () => [good.publicJwk, rotated.publicJwk];
		const rotatedToken = await signToken(rotated, "rotated");
		expect((await verify(rotatedToken, kv, now + 10_000)).valid).toBe(false);
		expect((await verify(rotatedToken, kv, now + 61_000)).valid).toBe(true);
		expect((await verify(rotatedToken, kv, now + 62_000)).valid).toBe(true);
		expect(fetches).toBe(3);
	});
});
