import type { Processor } from "unified";
import { guardInlineMath } from "./remarkRichBlocks";

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[]; position?: unknown };
type Root = { type: "root"; children: MarkdownNode[] };

/**
 * GitHub tables parse in time that grows with the square of the document's table rows (micromark with the table
 * extension): 900 rows take about 330 ms and 1,800 about 1.4 s, on every render of the message. Cutting a table into
 * smaller tables in the same document does not help; parsing them as separate documents does.
 *
 * `extractLargeTables` lifts each long top-level table out of the message, leaving a marker comment in its place;
 * `remarkLargeTables` parses each lifted table in pieces of `pieceRows` rows (each its own small document) and puts the
 * joined table where the marker was, before any other plugin runs. The result is the tree the whole message would
 * have parsed to.
 */
export const extractTablesFrom = 150;
const pieceRows = 100;
const placeholder = (index: number) => `<!--phaseo-large-table:${index}-->`;
const placeholderPattern = /^<!--phaseo-large-table:(\d+)-->$/;

const fence = /^ {0,3}(`{3,}|~{3,})/;
const delimiterRow = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
// A reference definition may be used inside a table; a table parsed on its own would not know it.
const definition = /^ {0,3}\[[^\]\n]+\]:/m;

/**
 * Lifts tables that start a top-level block (column 0, after a blank line or at the start), have at least
 * `extractTablesFrom` rows, and end at a blank line or the end. Anything else stays where it is.
 */
export function extractLargeTables(markdown: string): { text: string; tables: string[] } {
	// Cheap exit for the usual message: no table long enough to matter.
	if (markdown.length < extractTablesFrom * 8 || !markdown.includes("\n|") || definition.test(markdown)) return { text: markdown, tables: [] };
	const lines = markdown.split("\n"), out: string[] = [], tables: string[] = [];
	let open: string | undefined;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const marker = fence.exec(line)?.[1];
		if (open) { if (marker && marker[0] === open[0] && marker.length >= open.length && !line.slice(line.indexOf(marker) + marker.length).trim()) open = undefined; out.push(line); continue; }
		if (marker) { open = marker; out.push(line); continue; }
		const next = lines[index + 1] ?? "";
		const starts = line.includes("|") && !/^\s/.test(line) && (index === 0 || !lines[index - 1].trim()) && next.includes("-") && delimiterRow.test(next);
		if (!starts) { out.push(line); continue; }
		let end = index + 2;
		while (end < lines.length && lines[end].trim() && lines[end].includes("|")) end++;
		// A following line without a pipe would still be a row of the table, so such a table stays in place.
		if (end - index - 2 < extractTablesFrom || (end < lines.length && lines[end].trim())) { out.push(...lines.slice(index, end)); index = end - 1; continue; }
		out.push(placeholder(tables.length));
		tables.push(lines.slice(index, end).join("\n"));
		index = end - 1;
	}
	return tables.length ? { text: out.join("\n"), tables } : { text: markdown, tables: [] };
}

const withoutPositions = (node: MarkdownNode) => { delete node.position; node.children?.forEach(withoutPositions); };

/**
 * The remark plugin: each marker becomes its table, parsed piece by piece with the processor's own parser. A piece's
 * positions point into the piece, not the message, so plugins that read the source by position must not see them: the
 * dollar rule (remarkMathGuard) is applied here, against the piece's own text, and the positions are then removed.
 */
export function remarkLargeTables(this: Processor, options: { tables: readonly string[] }) {
	const parse = (markdown: string) => { const root = this.parse(markdown) as Root; guardInlineMath(root, markdown); root.children.forEach(withoutPositions); return root; };
	return (tree: Root) => {
		if (!options.tables.length) return;
		tree.children = tree.children.flatMap((node): MarkdownNode[] => {
			const index = node.type === "html" ? placeholderPattern.exec(node.value?.trim() ?? "")?.[1] : undefined;
			const source = index === undefined ? undefined : options.tables[Number(index)];
			if (source === undefined) return [node];
			const [header, delimiter, ...rows] = source.split("\n");
			let table: MarkdownNode | undefined;
			for (let from = 0; from < rows.length; from += pieceRows) {
				const piece = parse([header, delimiter, ...rows.slice(from, from + pieceRows)].join("\n")).children;
				// Not one table (should not happen): parse the whole table as one document instead.
				if (piece.length !== 1 || piece[0].type !== "table") return parse(source).children;
				if (table) table.children?.push(...piece[0].children?.slice(1) ?? []); else table = piece[0];
			}
			return table ? [table] : [];
		});
	};
}
