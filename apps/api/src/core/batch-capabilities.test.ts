import { describe, expect, it } from "vitest";

import {
	buildUnsupportedBatchModePayload,
	resolveBatchInputMode,
	resolveBatchProvidersForMode,
	resolveRequestedBatchProviders,
} from "./batch-capabilities";

describe("batch capabilities", () => {
	it("resolves file and inline batch input modes", () => {
		expect(resolveBatchInputMode({ input_file_id: "file_123", endpoint: "/v1/responses" })).toEqual({
			ok: true,
			mode: "file",
		});
		expect(resolveBatchInputMode({ requests: [{ body: { model: "gpt-5.4-nano" } }], endpoint: "/v1/responses" })).toEqual({
			ok: true,
			mode: "inline",
		});
		expect(resolveBatchInputMode({ input_file_id: "file_123", requests: [{}] })).toEqual({
			ok: false,
			reason: "ambiguous_batch_input",
		});
	});

	it("extracts provider preferences from routing shapes", () => {
		expect(resolveRequestedBatchProviders("anthropic")).toEqual(["anthropic"]);
		expect(resolveRequestedBatchProviders({ only: ["google", "x-ai"] })).toEqual(["google", "x-ai"]);
		expect(resolveRequestedBatchProviders({ order: ["openai", "openai"] })).toEqual(["openai"]);
	});

	it("returns docs-rich unsupported mode payloads", () => {
		const providers = resolveBatchProvidersForMode({
			mode: "file",
			requestedProviders: ["anthropic"],
		});
		expect(providers).toEqual([]);
		const payload = buildUnsupportedBatchModePayload({
			mode: "file",
			requestedProviders: ["anthropic"],
		});
		expect((payload.error as any).reason).toBe("batch_input_mode_not_supported");
		expect((payload.error as any).providers[0].documentation_url).toContain("anthropic");
	});
});
