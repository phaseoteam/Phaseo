import {
	isLiteralElement,
	isPluralElement,
	isSelectElement,
	isTagElement,
	parse,
	type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { printAST } from "@formatjs/icu-messageformat-parser/printer.js";

const ACCENTS: Record<string, string> = {
	a: "á",
	b: "ƀ",
	c: "ç",
	d: "đ",
	e: "ë",
	f: "ƒ",
	g: "ğ",
	h: "ħ",
	i: "ï",
	j: "ĵ",
	k: "ķ",
	l: "ľ",
	m: "ɱ",
	n: "ñ",
	o: "ø",
	p: "þ",
	q: "ɋ",
	r: "ř",
	s: "š",
	t: "ţ",
	u: "ü",
	v: "ṽ",
	w: "ŵ",
	x: "ẋ",
	y: "ÿ",
	z: "ž",
};

const PROTECTED_TOKEN_PATTERN =
	/(?:(?<![\p{L}\p{N}_])(?:Phaseo|Gateway|SSO)(?![\p{L}\p{N}_])|https?:\/\/[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|`[^`]*`)/giu;

export type MessageCatalogValue = string | MessageCatalog;
export type MessageCatalog = { [key: string]: MessageCatalogValue };
export type PseudoLocalized<T> = T extends string
	? string
	: T extends MessageCatalog
		? { [Key in keyof T]: PseudoLocalized<T[Key]> }
		: never;

export function extractProtectedTokens(value: string): string[] {
	return Array.from(value.matchAll(PROTECTED_TOKEN_PATTERN), (match) => match[0]);
}

function accentUnprotectedText(value: string): string {
	let result = "";
	let cursor = 0;

	for (const match of value.matchAll(PROTECTED_TOKEN_PATTERN)) {
		const index = match.index;
		result += accentCharacters(value.slice(cursor, index));
		result += match[0];
		cursor = index + match[0].length;
	}

	return result + accentCharacters(value.slice(cursor));
}

function accentCharacters(value: string): string {
	let result = "";
	for (const character of value) {
		const lower = character.toLowerCase();
		const accented = ACCENTS[lower];
		result += accented
			? character === lower
				? accented
				: accented.toUpperCase()
			: character;
	}
	return result;
}

function pseudoLocalizeAst(
	elements: MessageFormatElement[],
): MessageFormatElement[] {
	return elements.map((element) => {
		if (isLiteralElement(element)) {
			return {
				...element,
				value: accentUnprotectedText(element.value),
			};
		}

		if (isPluralElement(element) || isSelectElement(element)) {
			return {
				...element,
				options: Object.fromEntries(
					Object.entries(element.options).map(([selector, option]) => [
						selector,
						{
							...option,
							value: pseudoLocalizeAst(option.value),
						},
					]),
				),
			};
		}

		if (isTagElement(element)) {
			return {
				...element,
				children: pseudoLocalizeAst(element.children),
			};
		}

		return element;
	});
}

export function pseudoLocalizeMessage(value: string): string {
	const transformed = printAST(pseudoLocalizeAst(parse(value)));
	const expansion = "~".repeat(Math.max(3, Math.ceil(value.length * 0.35)));
	return `⟦${transformed}${expansion}⟧`;
}

export function pseudoLocalizeMessages<T extends MessageCatalogValue>(
	value: T,
): PseudoLocalized<T> {
	if (typeof value === "string") {
		return pseudoLocalizeMessage(value) as PseudoLocalized<T>;
	}

	const result: MessageCatalog = {};
	for (const [key, child] of Object.entries(value)) {
		result[key] = pseudoLocalizeMessages(child);
	}
	return result as PseudoLocalized<T>;
}
