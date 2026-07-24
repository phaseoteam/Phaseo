import { parseModelPageNoticeRow } from "./getModelPageNotice";

describe("parseModelPageNoticeRow", () => {
	it("parses a valid notice row", () => {
		expect(parseModelPageNoticeRow({
			api_model_id: "openai/gpt-5",
			tone: "warning",
			markdown: "This **model** has limited availability.",
		})).toEqual({
			apiModelId: "openai/gpt-5",
			tone: "warning",
			markdown: "This **model** has limited availability.",
		});
	});

	it("rejects empty markdown and invalid tones", () => {
		expect(parseModelPageNoticeRow({ api_model_id: "openai/gpt-5", tone: "info", markdown: "   " })).toBeNull();
		expect(parseModelPageNoticeRow({ api_model_id: "openai/gpt-5", tone: "notice", markdown: "Heads up" })).toBeNull();
	});
});
