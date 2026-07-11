import { createMathPlugin } from "@streamdown/math";

export const chatMarkdownPlugins = {
	math: createMathPlugin({ singleDollarTextMath: true }),
};

function escapeMathPercentages(value: string) {
	return value.replace(/(^|[^\\])%/g, "$1\\%");
}

function isSingleDollar(value: string, index: number) {
	return (
		value[index] === "$" &&
		value[index - 1] !== "$" &&
		value[index + 1] !== "$" &&
		value[index - 1] !== "\\"
	);
}

function findClosingDollar(value: string, start: number) {
	for (let index = start; index < value.length; index += 1) {
		if (value[index] === "\n" || value[index] === "\r") return null;
		if (!isSingleDollar(value, index)) continue;
		if (/\d/.test(value[index + 1] ?? "")) return null;
		return index;
	}
	return null;
}

function isMathExpression(value: string) {
	return /[\\=+*^_()[\]{}%]/.test(value);
}

function escapeCurrencyDollarSigns(value: string) {
	return value.replace(
		/\$(\d+(?:,\d{3})*(?:\.\d+)?)(?=$|[\s,.;:!?)]|\$)/g,
		(match, amount: string, offset: number, source: string) => {
			if (!isSingleDollar(source, offset)) return match;

			const amountEnd = offset + match.length;
			const closingDollar = findClosingDollar(source, amountEnd);
			if (
				closingDollar !== null &&
				(closingDollar === amountEnd ||
					isMathExpression(source.slice(offset + 1, closingDollar)))
			) {
				return match;
			}

			return `&#36;${amount}`;
		},
	);
}

export function normalizeChatMarkdown(value: string) {
	return escapeCurrencyDollarSigns(value)
		.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => {
			return `$$\n${escapeMathPercentages(math).trim()}\n$$`;
		})
		.replace(/(?<!\$)\$([^$\r\n]+?)\$(?!\$)/g, (_, math: string) => {
			return `$${escapeMathPercentages(math)}$`;
		});
}
