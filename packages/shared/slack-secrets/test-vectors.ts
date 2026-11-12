// Fixed vectors for the Slack agent's secrets and signed tokens, computed
// independently with node:crypto (AES-256-GCM with key SHA-256(secret);
// HMAC-SHA256). web-api's and the Slack Worker's tests both assert them, so a
// change to either copy of the format fails both. Test values only.

export const SLACK_SECRETS_TEST_VECTORS = {
	encryptionKey: "phaseo-slack-test-key-v1",
	stateSecret: "phaseo-slack-test-state-secret",
	/** crypto.getRandomValues output for the IV, then for the token nonce. */
	fixedIv: Uint8Array.from({ length: 12 }, (_, index) => index),
	fixedNonce: Uint8Array.from({ length: 16 }, (_, index) => 16 + index),
	secrets: { gateway_key: "phaseo_v1_sk_testkid00000_testsecret", bot_token: "xoxb-1-test-token" },
	secretsVector: "v1.AAECAwQFBgcICQoL.YN62pqsypNBE-yEz2RfD-J2TO1mtdRTt1xAT7nHMk3HmI0t4pUHm4kwcX4rzseMY4KY390GaoSkUdqS6tmxNzVrQ55Ft3QHFauex_4liCj6ZWrvs2RVZO_8hbk3EJagKXp2r9wi7",
	tokenNow: 1_800_000_000_000,
	linkPayload: { installation_id: "00000000-0000-4000-8000-0000000000a1", slack_user_id: "U0TEST0001" },
	linkTtlSeconds: 900,
	tokenVector: "eyJpbnN0YWxsYXRpb25faWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwYTEiLCJzbGFja191c2VyX2lkIjoiVTBURVNUMDAwMSIsInB1cnBvc2UiOiJsaW5rIiwiZXhwIjoxODAwMDAwOTAwLCJub25jZSI6IkVCRVNFeFFWRmhjWUdSb2JIQjBlSHcifQ.4mFmjm_-sgno88ChcHRU7Kp77RRndhBsQQ_GO3YLfNU",
	tokenNonce: "EBESExQVFhcYGRobHB0eHw",
} as const;
