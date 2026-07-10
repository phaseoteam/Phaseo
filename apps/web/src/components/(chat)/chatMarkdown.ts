import { createMathPlugin } from "@streamdown/math";

export const chatMarkdownPlugins = {
	math: createMathPlugin({ singleDollarTextMath: true }),
};

function escapeMathPercentages(value: string) {
	return value.replace(/(^|[^\\])%/g, "$1\\%");
}

export function normalizeChatMarkdown(value: string) {
	return value
		.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => {
			return `$$\n${escapeMathPercentages(math).trim()}\n$$`;
		})
		.replace(/(?<!\$)\$([^$\r\n]+?)\$(?!\$)/g, (_, math: string) => {
			return `$${escapeMathPercentages(math)}$`;
		});
}
