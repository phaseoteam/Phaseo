import { afterEach, describe, expect, it, vi } from "vitest";
import {
	awsSigningKeyCacheSize,
	clearAwsSigningKeyCache,
	getAwsSigningKey,
	signAwsV4Request,
	toHex,
} from "../bedrock-utils";

const BASE_ARGS = {
	method: "POST",
	url: "https://bedrock-mantle.us-west-2.api.aws/v1/chat/completions?b=2&a=1",
	body: "{\"model\":\"m\",\"messages\":[]}",
	region: "us-west-2",
	service: "bedrock",
	accessKeyId: "AKIDEXAMPLE",
	secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
	headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
};

describe("AWS SigV4 signing", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		clearAwsSigningKeyCache();
	});

	it("derives the AWS documented example signing key", async () => {
		// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
		const key = await getAwsSigningKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20150830", "us-east-1", "iam");
		expect(toHex(key)).toBe("c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9");
	});

	it("reuses the derived key per secret, day, region and service", async () => {
		const signSpy = vi.spyOn(crypto.subtle, "sign");
		await getAwsSigningKey("secret-a", "20260102", "us-west-2", "bedrock");
		const derivations = signSpy.mock.calls.length;
		expect(derivations).toBe(4);
		await getAwsSigningKey("secret-a", "20260102", "us-west-2", "bedrock");
		expect(signSpy.mock.calls.length).toBe(derivations);
		for (const [secret, day, region, service] of [
			["secret-b", "20260102", "us-west-2", "bedrock"],
			["secret-a", "20260103", "us-west-2", "bedrock"],
			["secret-a", "20260102", "us-east-1", "bedrock"],
			["secret-a", "20260102", "us-west-2", "aws-external-anthropic"],
		]) {
			const before = signSpy.mock.calls.length;
			await getAwsSigningKey(secret, day, region, service);
			expect(signSpy.mock.calls.length - before).toBe(4);
		}
	});

	it("keeps the cache bounded", async () => {
		for (let i = 0; i < 200; i += 1) {
			await getAwsSigningKey(`secret-${i}`, "20260102", "us-west-2", "bedrock");
		}
		expect(awsSigningKeyCacheSize()).toBeLessThanOrEqual(64);
	});

	it("produces signatures identical to the uncached implementation across days, regions and services", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const results: Record<string, string> = {};
		for (const when of ["2026-01-02T03:04:05Z", "2026-01-03T00:00:01Z"] as const) {
			vi.setSystemTime(new Date(when));
			results[when] = (await signAwsV4Request(BASE_ARGS)).Authorization;
			// Signing again (warm cache) yields the same signature.
			expect((await signAwsV4Request(BASE_ARGS)).Authorization).toBe(results[when]);
		}
		vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
		results.session = (await signAwsV4Request({
			...BASE_ARGS,
			region: "eu-central-1",
			service: "aws-external-anthropic",
			sessionToken: "session-token",
		})).Authorization;
		// Recorded from the uncached implementation (commit 9f81174876).
		expect(results).toMatchInlineSnapshot(`
			{
			  "2026-01-02T03:04:05Z": "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260102/us-west-2/bedrock/aws4_request, SignedHeaders=accept;content-type;host;x-amz-content-sha256;x-amz-date, Signature=c46ebb6fd857c124a88a853a3836908964f094911da867374cd587ee498151b6",
			  "2026-01-03T00:00:01Z": "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260103/us-west-2/bedrock/aws4_request, SignedHeaders=accept;content-type;host;x-amz-content-sha256;x-amz-date, Signature=88a7ea9868885676df68f23175b57338c1634debdba43e0cc69b7cb5ea1eec6b",
			  "session": "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260102/eu-central-1/aws-external-anthropic/aws4_request, SignedHeaders=accept;content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=9ee5a4e940a49e057721da2743919fa8990c3ff1bf2af247501fcd35e909caa6",
			}
		`);
	});
});
