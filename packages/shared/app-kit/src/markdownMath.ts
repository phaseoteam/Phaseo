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

			// Native MD4C drops entity text nodes, so use Markdown's literal escape.
			return `\\$${amount}`;
		},
	);
}

function normalizeMathSegment(value: string) {
	return escapeCurrencyDollarSigns(value)
		.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => {
			// Native Markdown parses math spans inside one paragraph; blank lines terminate it.
			return `$$\n${escapeMathPercentages(math).trim().replace(/\r?\n(?:[ \t]*\r?\n)+/g, "\n")}\n$$`;
		})
		.replace(/(?<![\\$])\$([^$\r\n]+?)(?<!\\)\$(?!\$)/g, (_, math: string) => {
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

const codeIndent = /^(?: {4}| {0,3}\t)/;

function findIndentedCodeEnd(value: string, start: number) {
	let lineStart = start;
	while (lineStart < value.length) {
		const newline = value.indexOf("\n", lineStart);
		const lineEnd = newline === -1 ? value.length : newline + 1;
		const line = value.slice(lineStart, lineEnd);
		if (line.trim() && !codeIndent.test(line)) break;
		lineStart = lineEnd;
	}
	return lineStart;
}

export function normalizeChatMarkdown(value: string) {
	let normalized = "";
	let textStart = 0;
	let index = 0;
	let displayMath = false;

	while (index < value.length) {
		if (!displayMath && (index === 0 || value[index - 1] === "\n") && codeIndent.test(value.slice(index, index + 4))) {
			const previousLine = value.slice(value.lastIndexOf("\n", index - 2) + 1, index);
			// Indented code starts a block; it cannot interrupt an ordinary paragraph.
			if (index === textStart || !previousLine.trim() || /^ {0,3}#{1,6}(?:\s|$)/.test(previousLine)) {
				const codeEnd = findIndentedCodeEnd(value, index);
				normalized += normalizeMathSegment(value.slice(textStart, index)) + value.slice(index, codeEnd);
				textStart = index = codeEnd;
				continue;
			}
		}
		const character = value[index];
		if (character === "$" && value[index + 1] === "$" && value[index - 1] !== "\\") {
			displayMath = !displayMath;
			index += 2;
			continue;
		}
		if (character !== "`" && character !== "~") {
			index += 1;
			continue;
		}

		let delimiterLength = 1;
		while (value[index + delimiterLength] === character) {
			delimiterLength += 1;
		}
		const delimiter = character.repeat(delimiterLength);
		const lineStart = value.lastIndexOf("\n", index - 1) + 1;
		const isFence = delimiterLength >= 3 && /^ {0,3}$/.test(value.slice(lineStart, index));
		const codeEnd = isFence
			? findCodeFenceEnd(value, index, delimiter) ?? value.length
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
