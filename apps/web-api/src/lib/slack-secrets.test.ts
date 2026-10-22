import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import {
	base64UrlDecode,
	base64UrlEncode,
	decryptSlackSecrets,
	encryptSlackSecrets,
	signSlackToken,
	verifySlackToken,
} from "./slack-secrets";

// Fixed vectors, computed independently with node:crypto (AES-256-GCM with key
// SHA-256(secret); HMAC-SHA256). The Slack Worker's tests assert the same strings,
// so both sides read and write one format.
const ENCRYPTION_KEY = "phaseo-slack-test-key-v1";
const STATE_SECRET = "phaseo-slack-test-state-secret";
const FIXED_IV = Uint8Array.from({ length: 12 }, (_, index) => index);
const FIXED_NONCE = Uint8Array.from({ length: 16 }, (_, index) => 16 + index);
const SECRETS = { gateway_key: "phaseo_v1_sk_testkid00000_testsecret", bot_token: "xoxb-1-test-token" };
const SECRETS_VECTOR = "v1.AAECAwQFBgcICQoL.YN62pqsypNBE-yEz2RfD-J2TO1mtdRTt1xAT7nHMk3HmI0t4pUHm4kwcX4rzseMY4KY390GaoSkUdqS6tmxNzVrQ55Ft3QHFauex_4liCj6ZWrvs2RVZO_8hbk3EJagKXp2r9wi7";
const TOKEN_NOW = 1_800_000_000_000;
const LINK_PAYLOAD = { installation_id: "00000000-0000-4000-8000-0000000000a1", slack_user_id: "U0TEST0001" };
const TOKEN_VECTOR = "eyJpbnN0YWxsYXRpb25faWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwYTEiLCJzbGFja191c2VyX2lkIjoiVTBURVNUMDAwMSIsInB1cnBvc2UiOiJsaW5rIiwiZXhwIjoxODAwMDAwOTAwLCJub25jZSI6IkVCRVNFeFFWRmhjWUdSb2JIQjBlSHcifQ.4mFmjm_-sgno88ChcHRU7Kp77RRndhBsQQ_GO3YLfNU";

const env = { ENV: "development", SLACK_SECRETS_ENCRYPTION_KEY: ENCRYPTION_KEY, SLACK_STATE_SECRET: STATE_SECRET } as Env;

function fixRandom(bytes: Uint8Array) {
	vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => {
		array.set(bytes.subarray(0, array.length));
		return array;
	}) as typeof crypto.getRandomValues);
}

afterEach(() => vi.restoreAllMocks());

function flipLastCharacter(value: string): string {
	const last = value.at(-1)!;
	return value.slice(0, -1) + (last === "A" ? "B" : "A");
}

describe("Slack secrets encryption", () => {
	it("round-trips a record of strings with a fresh IV each time", async () => {
		const first = await encryptSlackSecrets(env, SECRETS);
		const second = await encryptSlackSecrets(env, SECRETS);
		expect(first).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
		expect(first).not.toBe(second);
		expect(first).not.toContain("xoxb");
		await expect(decryptSlackSecrets(env, first)).resolves.toEqual(SECRETS);
		await expect(decryptSlackSecrets(env, second)).resolves.toEqual(SECRETS);
	});

	it("matches the fixed vector (sorted keys, version.iv.ciphertext)", async () => {
		fixRandom(FIXED_IV);
		await expect(encryptSlackSecrets(env, SECRETS)).resolves.toBe(SECRETS_VECTOR);
		vi.restoreAllMocks();
		await expect(decryptSlackSecrets(env, SECRETS_VECTOR)).resolves.toEqual({ bot_token: "xoxb-1-test-token", gateway_key: "phaseo_v1_sk_testkid00000_testsecret" });
	});

	it("rejects a wrong key, an unknown version, tampering and malformed values", async () => {
		await expect(decryptSlackSecrets({ ...env, SLACK_SECRETS_ENCRYPTION_KEY: "another-key" }, SECRETS_VECTOR)).rejects.toThrow("slack_secrets_undecryptable");
		await expect(decryptSlackSecrets({ ...env, SLACK_SECRETS_ENCRYPTION_KEY_VERSION: "v2" }, SECRETS_VECTOR)).rejects.toThrow("slack_secrets_key_version_unknown");
		await expect(decryptSlackSecrets(env, flipLastCharacter(SECRETS_VECTOR))).rejects.toThrow("slack_secrets_undecryptable");
		await expect(decryptSlackSecrets(env, "v1.not-enough")).rejects.toThrow("slack_secrets_malformed");
		await expect(decryptSlackSecrets(env, "v1.AAEC.AAAA")).rejects.toThrow("slack_secrets_undecryptable");
	});

	it("writes the configured key version and refuses to run without a key", async () => {
		const value = await encryptSlackSecrets({ ...env, SLACK_SECRETS_ENCRYPTION_KEY_VERSION: "v7" }, SECRETS);
		expect(value.startsWith("v7.")).toBe(true);
		await expect(decryptSlackSecrets({ ...env, SLACK_SECRETS_ENCRYPTION_KEY_VERSION: "v7" }, value)).resolves.toEqual(SECRETS);
		await expect(encryptSlackSecrets({ ENV: "development" } as Env, SECRETS)).rejects.toThrow("slack_secrets_encryption_unconfigured");
		await expect(encryptSlackSecrets({ ...env, SLACK_SECRETS_ENCRYPTION_KEY_VERSION: "v.1" }, SECRETS)).rejects.toThrow("slack_secrets_encryption_version_invalid");
		await expect(encryptSlackSecrets(env, { bot_token: 1 } as never)).rejects.toThrow("slack_secrets_value_invalid");
	});

	it("encodes base64url without padding and rejects other alphabets", () => {
		expect(base64UrlEncode(Uint8Array.from([251, 255, 191]))).toBe("-_-_");
		expect([...base64UrlDecode("-_-_")]).toEqual([251, 255, 191]);
		expect(() => base64UrlDecode("+/==")).toThrow("invalid_base64url");
	});
});

describe("Slack signed tokens", () => {
	it("matches the fixed vector and verifies it", async () => {
		fixRandom(FIXED_NONCE);
		const token = await signSlackToken(env, "link", LINK_PAYLOAD, 900, TOKEN_NOW);
		expect(token).toBe(TOKEN_VECTOR);
		vi.restoreAllMocks();
		const verified = await verifySlackToken(env, "link", TOKEN_VECTOR, TOKEN_NOW + 1_000);
		expect(verified).toEqual({ ok: true, payload: { ...LINK_PAYLOAD, purpose: "link", exp: 1_800_000_900, nonce: "EBESExQVFhcYGRobHB0eHw" } });
	});

	it("rejects an expired token at and after its expiry", async () => {
		await expect(verifySlackToken(env, "link", TOKEN_VECTOR, 1_800_000_900_000)).resolves.toEqual({ ok: false, reason: "expired" });
		await expect(verifySlackToken(env, "link", TOKEN_VECTOR, TOKEN_NOW + 3_600_000)).resolves.toEqual({ ok: false, reason: "expired" });
	});

	it("rejects a token minted for another purpose", async () => {
		await expect(verifySlackToken(env, "install", TOKEN_VECTOR, TOKEN_NOW)).resolves.toEqual({ ok: false, reason: "wrong_purpose" });
	});

	it("rejects tampered payloads and signatures, other secrets and malformed tokens", async () => {
		const [payload, signature] = TOKEN_VECTOR.split(".");
		const forged = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ ...LINK_PAYLOAD, slack_user_id: "U0ATTACKER", purpose: "link", exp: 1_800_000_900, nonce: "x" })));
		await expect(verifySlackToken(env, "link", `${forged}.${signature}`, TOKEN_NOW)).resolves.toEqual({ ok: false, reason: "bad_signature" });
		await expect(verifySlackToken(env, "link", `${payload}.${flipLastCharacter(signature)}`, TOKEN_NOW)).resolves.toEqual({ ok: false, reason: "bad_signature" });
		await expect(verifySlackToken(env, "link", `${payload}.${signature.slice(0, 20)}`, TOKEN_NOW)).resolves.toEqual({ ok: false, reason: "bad_signature" });
		await expect(verifySlackToken({ ...env, SLACK_STATE_SECRET: "another-secret" }, "link", TOKEN_VECTOR, TOKEN_NOW)).resolves.toEqual({ ok: false, reason: "bad_signature" });
		for (const token of ["", "abc", `${payload}.`, `${payload}.${signature}.extra`, `${payload}.+/+/`, 42, null, "a".repeat(5_000)]) {
			await expect(verifySlackToken(env, "link", token, TOKEN_NOW)).resolves.toEqual({ ok: false, reason: "malformed" });
		}
	});

	it("keeps purpose, expiry and nonce out of the caller's control", async () => {
		const token = await signSlackToken(env, "install", { purpose: "link", exp: 9_999_999_999, nonce: "chosen", workspace_id: "w" }, 600, TOKEN_NOW);
		const verified = await verifySlackToken(env, "install", token, TOKEN_NOW);
		expect(verified.ok).toBe(true);
		if (verified.ok) {
			expect(verified.payload).toMatchObject({ purpose: "install", exp: 1_800_000_600, workspace_id: "w" });
			expect(verified.payload.nonce).not.toBe("chosen");
		}
	});

	it("does nothing without a state secret", async () => {
		await expect(signSlackToken({ ENV: "development" } as Env, "link", {}, 60)).rejects.toThrow("slack_state_secret_unconfigured");
		await expect(verifySlackToken({ ENV: "development" } as Env, "link", TOKEN_VECTOR)).resolves.toEqual({ ok: false, reason: "unconfigured" });
		await expect(signSlackToken(env, "link", {}, 0)).rejects.toThrow("slack_token_ttl_invalid");
	});
});
