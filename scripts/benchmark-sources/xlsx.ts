import { inflateRawSync } from "node:zlib";
import { htmlText } from "./parse";

/** Files in a zip archive, read from its central directory. Stored and deflated entries only, which is all xlsx uses. */
export function unzip(buffer: Buffer): Map<string, Buffer> {
	const files = new Map<string, Buffer>();
	let end = buffer.length - 22;
	while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
	if (end < 0) throw new Error("Not a zip archive.");
	const count = buffer.readUInt16LE(end + 10);
	let offset = buffer.readUInt32LE(end + 16);
	for (let index = 0; index < count; index += 1) {
		if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
		const method = buffer.readUInt16LE(offset + 10);
		const compressedSize = buffer.readUInt32LE(offset + 20);
		const nameLength = buffer.readUInt16LE(offset + 28);
		const extraLength = buffer.readUInt16LE(offset + 30);
		const commentLength = buffer.readUInt16LE(offset + 32);
		const localOffset = buffer.readUInt32LE(offset + 42);
		const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
		const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
		const data = buffer.subarray(dataStart, dataStart + compressedSize);
		if (method === 0) files.set(name, data);
		else if (method === 8) files.set(name, inflateRawSync(data));
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return files;
}

const columnIndex = (reference: string) => [...reference.replace(/\d+$/, "")].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;

/** The first worksheet of an xlsx workbook as rows of cell text (shared and inline strings resolved). */
export function xlsxRows(buffer: Buffer): string[][] {
	const files = unzip(buffer);
	const shared = [...(files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)]
		.map((item) => htmlText([...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((text) => text[1]).join("")));
	const sheet = files.get("xl/worksheets/sheet1.xml")?.toString("utf8");
	if (!sheet) throw new Error("Workbook has no first sheet.");
	return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
		const cells: string[] = [];
		for (const cell of row[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const [, reference, attributes, body = ""] = cell;
			const type = attributes.match(/t="(\w+)"/)?.[1];
			const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
			const text = type === "s" ? shared[Number(value)] ?? "" : type === "inlineStr" ? htmlText(body) : htmlText(value);
			cells[columnIndex(reference)] = text;
		}
		return Array.from(cells, (cell) => cell ?? "");
	});
}
