jest.mock("@streamdown/math", () => ({
	createMathPlugin: jest.fn((options) => options),
}), { virtual: true });

import { createMathPlugin } from "@streamdown/math";
import { chatMarkdownPlugins, normalizeChatMarkdown } from "./chatMarkdown";

describe("chatMarkdownPlugins", () => {
	it("enables single-dollar inline math for assistant messages", () => {
		expect(createMathPlugin).toHaveBeenCalledWith({
			singleDollarTextMath: true,
		});
		expect(chatMarkdownPlugins.math).toEqual({
			singleDollarTextMath: true,
		});
	});

	it("escapes percentage signs inside math delimiters", () => {
		expect(
			normalizeChatMarkdown(
				"After 20% off, you pay $80%$.\n\n$$0.80 \\times 0.90 = 72%$$",
			),
		).toBe(
			"After 20% off, you pay $80\\%$.\n\n$$\n0.80 \\times 0.90 = 72\\%\n$$",
		);
	});
});
