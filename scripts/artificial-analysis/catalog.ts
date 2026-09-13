import { applyEdits, findNodeAtLocation, modify, parseTree } from "jsonc-parser";

/** Change only the benchmarks property; preserve unrelated JSON representation. */
export function writeBenchmarks(text: string, benchmarks: Array<Record<string, unknown>>) {
	JSON.parse(text);
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const indent = text.match(/(?:\r?\n)([\t ]+)"/)?.[1] ?? "  ";
	const tree = parseTree(text)!;
	const node = findNodeAtLocation(tree, ["benchmarks"]);
	const formatted = JSON.stringify(benchmarks, null, indent).replace(/\n/g, eol + indent);
	if (node) return text.slice(0, node.offset) + formatted + text.slice(node.offset + node.length);
	// Insert without a formatter, which otherwise also reflows the preceding property.
	const inserted = applyEdits(text, modify(text, ["benchmarks"], benchmarks, {}));
	const property = findNodeAtLocation(parseTree(inserted)!, ["benchmarks"])!.parent!;
	return inserted.slice(0, property.offset) + eol + indent + '"benchmarks": ' + formatted + inserted.slice(property.offset + property.length);
}
