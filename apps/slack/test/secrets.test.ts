import { afterEach, describe, expect, it, vi } from "vitest";
import { SLACK_SECRETS_TEST_VECTORS as VECTORS } from "../../../packages/shared/slack-secrets/test-vectors";
import * as webApi from "../../web-api/src/lib/slack-secrets";
import { linkUrl } from "../src/access";
import { decryptSlackSecrets, encryptSlackSecrets, signSlackToken, verifySlackToken } from "../src/lib/slack-secrets";
import { testWorld } from "./fakes";

// The same fixed vectors web-api's tests assert (packages/shared/slack-secrets),
// so the Worker reads what web-api writes and web-api accepts what the Worker signs.

const env = { SLACK_SECRETS_ENCRYPTION_KEY: VECTORS.encryptionKey, SLACK_STATE_SECRET: VECTORS.stateSecret };

function fixRandom(bytes: Uint8Array) {
	vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => {
		array.set(bytes.subarray(0, array.length));
		return array;
	}) as typeof crypto.getRandomValues);
}

afterEach(() => vi.restoreAllMocks());

describe("shared Slack secrets vectors", () => {
	it("encrypts to and decrypts the fixed vector", async () => {
		fixRandom(VECTORS.fixedIv);
		await expect(encryptSlackSecrets(env, VECTORS.secrets)).resolves.toBe(VECTORS.secretsVector);
		vi.restoreAllMocks();
		await expect(decryptSlackSecrets(env, VECTORS.secretsVector)).resolves.toEqual(VECTORS.secrets);
	});

	it("signs and verifies the fixed link token", async () => {
		fixRandom(VECTORS.fixedNonce);
		await expect(signSlackToken(env, "link", VECTORS.linkPayload, VECTORS.linkTtlSeconds, VECTORS.tokenNow)).resolves.toBe(VECTORS.tokenVector);
		vi.restoreAllMocks();
		await expect(verifySlackToken(env, "link", VECTORS.tokenVector, VECTORS.tokenNow + 1_000)).resolves.toEqual({
			ok: true,
			payload: { ...VECTORS.linkPayload, purpose: "link", exp: VECTORS.tokenNow / 1000 + VECTORS.linkTtlSeconds, nonce: VECTORS.tokenNonce },
		});
	});

	it("reads secrets web-api wrote and writes secrets web-api reads", async () => {
		const fromWebApi = await webApi.encryptSlackSecrets(env, { bot_token: "xoxb-1-test-token", gateway_key: "phaseo_v1_sk_testkid00000_testsecret", bot_refresh_token: "xoxe-1-test-refresh" });
		await expect(decryptSlackSecrets(env, fromWebApi)).resolves.toMatchObject({ bot_refresh_token: "xoxe-1-test-refresh" });
		const fromWorker = await encryptSlackSecrets(env, { client_secret: "test-client-secret", signing_secret: "test-signing-secret" });
		await expect(webApi.decryptSlackSecrets(env, fromWorker)).resolves.toEqual({ client_secret: "test-client-secret", signing_secret: "test-signing-secret" });
	});

	it("signs link buttons that web-api's link confirmation accepts, for 15 minutes", async () => {
		const world = testWorld({ envOverrides: { SLACK_STATE_SECRET: VECTORS.stateSecret } });
		const url = new URL(await linkUrl(world.env, VECTORS.linkPayload.installation_id, VECTORS.linkPayload.slack_user_id, VECTORS.tokenNow));
		const token = url.searchParams.get("token");
		await expect(webApi.verifySlackToken(env, "link", token, VECTORS.tokenNow + 899_000)).resolves.toMatchObject({ ok: true, payload: VECTORS.linkPayload });
		await expect(webApi.verifySlackToken(env, "link", token, VECTORS.tokenNow + 900_000)).resolves.toEqual({ ok: false, reason: "expired" });
		await expect(webApi.verifySlackToken(env, "install", token, VECTORS.tokenNow)).resolves.toEqual({ ok: false, reason: "wrong_purpose" });
	});
});
