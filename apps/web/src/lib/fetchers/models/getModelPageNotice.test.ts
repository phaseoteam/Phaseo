import { parseModelPageNoticeRow } from "./getModelPageNotice";

describe("parseModelPageNoticeRow", () => {
	it("parses a valid notice row", () => {
		expect(
			parseModelPageNoticeRow({
				api_model_id: "openai/gpt-5",
				tone: "warning",
				markdown: "This **model** has limited availability.",
			}),
		).toEqual({
			apiModelId: "openai/gpt-5",
			tone: "warning",
			markdown: "This **model** has limited availability.",
		});
	});

	it("trims the markdown and rejects empty values", () => {
		expect(
			parseModelPageNoticeRow({
				api_model_id: "openai/gpt-5",
				tone: "info",
				markdown: "   ",
			}),
		).toBeNull();
	});

	it("rejects invalid tone values", () => {
		expect(
			parseModelPageNoticeRow({
				api_model_id: "openai/gpt-5",
				tone: "notice",
				markdown: "Heads up",
			}),
		).toBeNull();
	});
});
