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

	it("escapes each consecutive percentage sign inside math delimiters", () => {
		expect(normalizeChatMarkdown("$a%%b$")).toBe("$a\\%\\%b$");
	});

	it("does not normalize currency or math syntax inside code", () => {
		expect(
			normalizeChatMarkdown(
				"Inline `const price = '$80%$'` and $80%$.\n\n```ts\nconst price = '$80%$';\n```",
			),
		).toBe(
			"Inline `const price = '$80%$'` and $80\\%$.\n\n```ts\nconst price = '$80%$';\n```",
		);
	});

	it("preserves dollar-prefixed monetary amounts alongside inline math", () => {
		expect(
			normalizeChatMarkdown(
				"The final price is $72, so the discount is $28 = $28\\%$.",
			),
		).toBe(
			"The final price is &#36;72, so the discount is &#36;28 = $28\\%$.",
		);
	});

	it("preserves multiple plain currency amounts", () => {
		expect(normalizeChatMarkdown("Prices are $5 and $7.")).toBe(
			"Prices are &#36;5 and &#36;7.",
		);
	});

	it("does not treat inline math expressions as monetary amounts", () => {
		expect(normalizeChatMarkdown("$2 + 2$ = $4$")).toBe(
			"$2 + 2$ = $4$",
		);
	});
});
