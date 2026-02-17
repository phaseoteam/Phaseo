import { describe, expect, it } from "vitest";
import { guardJson } from "./guards";

describe("guardJson", () => {
	it("parses multipart form-data bodies including files and array fields", async () => {
		const form = new FormData();
		form.set("model", "openai/gpt-4o-transcribe");
		form.append("file", new File([new Uint8Array([1, 2, 3])], "sample.wav", { type: "audio/wav" }));
		form.append("include[]", "logprobs");
		form.append("include", "timestamps");
		form.append("timestamp_granularities[]", "word");
		form.append("provider", JSON.stringify({ order: ["openai"] }));

		const req = new Request("https://gateway.local/v1/audio/transcriptions", {
			method: "POST",
			body: form,
		});

		const result = await guardJson(req, "team_test", "req_test");
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.model).toBe("openai/gpt-4o-transcribe");
		expect(Array.isArray(result.value.include)).toBe(true);
		expect(result.value.include).toEqual(["logprobs", "timestamps"]);
		expect(result.value.timestamp_granularities).toEqual(["word"]);
		expect(result.value.provider).toEqual({ order: ["openai"] });
		expect(typeof File !== "undefined" && result.value.file instanceof File).toBe(true);
	});

	it("returns invalid_json for malformed JSON requests", async () => {
		const req = new Request("https://gateway.local/v1/chat/completions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{not-json",
		});
		const result = await guardJson(req, "team_test", "req_test");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
	});
});
