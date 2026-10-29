/**
 * HTML in GitHub issue text, read once from start to end. Nothing here is rendered as HTML (agents get it as text,
 * and the window's Markdown escapes raw HTML); these only tidy what people and bots write.
 */

/** Each `<...>` tag in turn, with `replace` saying what goes in its place; comments (`<!-- -->`) are always dropped. */
export function mapHtmlTags(source: string, replace: (tag: string, name: string, closing: boolean) => string): string {
	let out = "", index = 0;
	while (index < source.length) {
		const open = source.indexOf("<", index);
		if (open < 0) { out += source.slice(index); break; }
		out += source.slice(index, open);
		if (source.startsWith("<!--", open)) {
			const end = source.indexOf("-->", open + 4);
			if (end < 0) { out += source.slice(open); break; }
			index = end + 3;
			continue;
		}
		const close = source.indexOf(">", open + 1);
		const match = close < 0 ? null : /^<(\/?)([a-z][\w-]*)(?=[\s/>])/i.exec(source.slice(open, close + 1));
		if (!match) { out += "<"; index = open + 1; continue; }
		out += replace(source.slice(open, close + 1), match[2]!.toLowerCase(), match[1] === "/");
		index = close + 1;
	}
	return out;
}

/** The text without its HTML comments, such as issue templates' hints. */
export const withoutHtmlComments = (source: string) => mapHtmlTags(source, tag => tag);
