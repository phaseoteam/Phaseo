import { createMathPlugin } from "@streamdown/math";

export const chatMarkdownPlugins = {
	math: createMathPlugin({ singleDollarTextMath: true }),
};

function escapeMathPercentages(value: string) {
	return value.replace(/(?<!\\)%/g, "\\%");
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

function normalizeMathSegment(value: string) {
	return escapeCurrencyDollarSigns(value)
		.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => {
			return `$$\n${escapeMathPercentages(math).trim()}\n$$`;
		})
		.replace(/(?<!\$)\$([^$\r\n]+?)\$(?!\$)/g, (_, math: string) => {
			return `$${escapeMathPercentages(math)}$`;
		});
}

function findCodeFenceEnd(
	value: string,
	start: number,
	delimiter: string,
) {
	let lineStart = value.indexOf("\n", start + delimiter.length);
	while (lineStart !== -1) {
		lineStart += 1;
		const lineEnd = value.indexOf("\n", lineStart);
		const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
		if (new RegExp(`^ {0,3}${delimiter[0]}{${delimiter.length},}`).test(line)) {
			return lineEnd === -1 ? value.length : lineEnd + 1;
		}
		lineStart = lineEnd;
	}
	return null;
}

function findInlineCodeEnd(value: string, start: number, delimiter: string) {
	let index = start + delimiter.length;
	while (index < value.length) {
		const closingIndex = value.indexOf(delimiter, index);
		if (closingIndex === -1 || value.slice(index, closingIndex).includes("\n")) {
			return null;
		}
		const before = value[closingIndex - 1];
		const after = value[closingIndex + delimiter.length];
		if (before !== "`" && after !== "`") {
			return closingIndex + delimiter.length;
		}
		index = closingIndex + delimiter.length;
	}
	return null;
}

export function normalizeChatMarkdown(value: string) {
	let normalized = "";
	let textStart = 0;
	let index = 0;

	while (index < value.length) {
		const character = value[index];
		if (character !== "`" && character !== "~") {
			index += 1;
			continue;
		}

		let delimiterLength = 1;
		while (value[index + delimiterLength] === character) {
			delimiterLength += 1;
		}
		const delimiter = character.repeat(delimiterLength);
		const isFence =
			delimiterLength >= 3 &&
			(index === 0 || value[index - 1] === "\n");
		const codeEnd = isFence
			? findCodeFenceEnd(value, index, delimiter)
			: character === "`"
				? findInlineCodeEnd(value, index, delimiter)
				: null;
		if (codeEnd === null) {
			index += delimiterLength;
			continue;
		}

		normalized += normalizeMathSegment(value.slice(textStart, index));
		normalized += value.slice(index, codeEnd);
		textStart = codeEnd;
		index = codeEnd;
	}

	return normalized + normalizeMathSegment(value.slice(textStart));
}
