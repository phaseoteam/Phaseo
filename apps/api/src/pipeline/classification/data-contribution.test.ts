import { describe, expect, it } from "vitest";
import { dataContributionQueueStatus, deterministicContributionBucket, normalizeDataContributionPolicy, sanitizeDataContributionPayload } from "./data-contribution";

describe("data contribution sampling", () => {
	it("is deterministic and bounded", async () => {
		const first = await deterministicContributionBucket("workspace", "request", "v1");
		const second = await deterministicContributionBucket("workspace", "request", "v1");
		expect(first).toBe(second);
		expect(first).toBe(2947);
		expect(first).toBeGreaterThanOrEqual(0);
		expect(first).toBeLessThan(10_000);
	});

	it("defaults to full redacted retention, ten percent classification, and one percent discount", () => {
		expect(normalizeDataContributionPolicy({ dataContributionEnabled: true })).toEqual({
			enabled: true,
			policyVersion: null,
			sampleRateBps: 10000,
			classifierSampleRateBps: 1000,
			discountBps: 100,
		});
	});

	it("redacts structured secrets and common personal information before retention", () => {
		const result = sanitizeDataContributionPayload({
			authorization: "Bearer should-never-remain",
			password: "hunter2",
			message: "Email me at person@example.com or +44 7700 900123. Card 4242 4242 4242 4242, IP 192.168.1.4.",
			image_url: "https://cdn.example.com/image.png?signature=secret#fragment",
		});
		expect(result.value).toEqual({
			authorization: "[REDACTED]",
			password: "[REDACTED]",
			message: "Email me at [EMAIL] or [PHONE]. Card [CREDIT_CARD], IP [IP_ADDRESS].",
			image_url: "https://cdn.example.com/image.png",
		});
		expect(result.redactionCount).toBeGreaterThanOrEqual(6);
	});

	it("never retains media bytes, whatever their size or provider format", () => {
		const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
		const longBase64 = "A".repeat(4096);
		const result = sanitizeDataContributionPayload({
			messages: [{
				role: "user",
				content: [
					{ type: "image_url", image_url: { url: `data:image/png;base64,${tinyPng}` } },
					{ type: "image", source: { type: "base64", media_type: "image/png", data: tinyPng } },
					{ inline_data: { mime_type: "image/png", data: tinyPng } },
					{ type: "input_audio", input_audio: { data: tinyPng, format: "wav" } },
					{ type: "text", text: `See ![x](data:image/png;base64,${tinyPng}) here` },
				],
			}],
			data: [{ b64_json: tinyPng }],
			output: [{ type: "image_generation_call", result: longBase64 }],
		});
		expect(result.value).toEqual({
			messages: [{
				role: "user",
				content: [
					{ type: "image_url", image_url: { url: "[REDACTED_DATA_URL]" } },
					{ type: "image", source: { type: "base64", media_type: "image/png", data: "[REDACTED_BASE64]" } },
					{ inline_data: { mime_type: "image/png", data: "[REDACTED_BASE64]" } },
					{ type: "input_audio", input_audio: { data: "[REDACTED_BASE64]", format: "wav" } },
					{ type: "text", text: "See ![x]([REDACTED_DATA_URL]) here" },
				],
			}],
			data: [{ b64_json: "[REDACTED_BASE64]" }],
			output: [{ type: "image_generation_call", result: "[REDACTED_BASE64]" }],
		});
		expect(JSON.stringify(result.value)).not.toContain(tinyPng);
	});

	it("keeps ordinary text that only looks like an identifier", () => {
		const result = sanitizeDataContributionPayload({ data: "hello", id: "chatcmpl-abc123", text: "short base64 aGVsbG8=" });
		expect(result.value).toEqual({ data: "hello", id: "chatcmpl-abc123", text: "short base64 aGVsbG8=" });
	});

	it("retains every request while queueing only the independent classifier sample", () => {
		expect(dataContributionQueueStatus(999, 1000)).toBe("pending");
		expect(dataContributionQueueStatus(1000, 1000)).toBe("retained");
		expect(dataContributionQueueStatus(9999, 10000)).toBe("pending");
	});
});
