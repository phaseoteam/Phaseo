import { describe, expect, it } from "vitest";
import { selectBatchProviderOptions } from "./batch-provider-options";
describe("batch provider options", () => {
	it("selects only the routed provider", () => {
		const options = { openai: { output_expires_after: { anchor: "created_at", seconds: 3600 } }, mistral: { metadata: { project: "test" } } };
		expect(selectBatchProviderOptions(options, "mistral")).toEqual({ metadata: { project: "test" } });
		expect(selectBatchProviderOptions(options, "anthropic")).toEqual({});
	});
	it.each([null, [], { openai: { input_file_id: "foreign" } }, { mistral: { model: "expensive" } }, { openai: { webhook: { url: "https://example.com" } } }])("rejects structural overrides", (value) => {
		expect(() => selectBatchProviderOptions(value, "openai")).toThrow();
	});
});
