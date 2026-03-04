import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultSpecPath = resolve("apps/docs/openapi/v1/openapi.yaml");
const specPath = resolve(process.argv[2] ?? defaultSpecPath);

const raw = readFileSync(specPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
let lines = raw.split(/\r?\n/);

const hasTrailingNewline = raw.endsWith("\n");

const methodLineRe = /^ {8}(get|post|put|patch|delete|options|head|trace):\s*$/;
const topLevelKeyRe = /^\S[^:]*:\s*$/;
const pathLineRe = /^ {4}\/[^:]*:\s*$/;

function findBlockEnd(start: number, isEnd: (line: string) => boolean): number {
	let i = start;
	while (i < lines.length && !isEnd(lines[i])) {
		i += 1;
	}
	return i;
}

function ensureInfoContact() {
	const infoIdx = lines.findIndex((line) => line.trim() === "info:");
	if (infoIdx === -1) return;

	const infoEnd = findBlockEnd(infoIdx + 1, (line) => topLevelKeyRe.test(line));
	const infoBlock = lines.slice(infoIdx + 1, infoEnd);
	const childIndent =
		infoBlock
			.map((line) => /^(\s+)(title|description|version|contact):\s*/.exec(line))
			.find(Boolean)?.[1].length ?? 2;
	const childPad = " ".repeat(childIndent);
	const nestedPad = " ".repeat(childIndent * 2);
	const hasContact = infoBlock.some((line) => new RegExp(`^ {${childIndent}}contact:\\s*$`).test(line));
	if (hasContact) return;

	const versionIdx = infoBlock.findIndex((line) =>
		new RegExp(`^ {${childIndent}}version:\\s*`).test(line),
	);
	const insertAt = versionIdx === -1 ? infoIdx + 1 : infoIdx + 1 + versionIdx + 1;
	lines.splice(
		insertAt,
		0,
		`${childPad}contact:`,
		`${nestedPad}name: AI Stats`,
		`${nestedPad}url: https://docs.ai-stats.phaseo.app`,
		`${nestedPad}email: danielbutler500@gmail.com`,
	);
}

function ensureGlobalTag() {
	// Only treat top-level `tags:` as the global tags block.
	// Operation-level tags are indented and must not be used here.
	const tagsIdx = lines.findIndex((line) => /^tags:\s*$/.test(line));
	if (tagsIdx !== -1) {
		const tagsEnd = findBlockEnd(tagsIdx + 1, (line) => topLevelKeyRe.test(line));
		const tagsBlock = lines.slice(tagsIdx + 1, tagsEnd);
		const tagItemIndent =
			tagsBlock
				.map((line) => /^(\s+)-/.exec(line))
				.find(Boolean)?.[1].length ?? 2;
		const tagNameIndent = tagItemIndent * 2;
		let hasGatewayTag = false;
		for (let idx = 0; idx < tagsBlock.length; idx += 1) {
			const line = tagsBlock[idx];
			if (new RegExp(`^ {${tagItemIndent}}- name:\\s*Gateway\\s*$`).test(line)) {
				hasGatewayTag = true;
				break;
			}
			// Also handle expanded sequence style:
			// "<indent>-" followed by "<indent*2>name: Gateway"
			if (
				new RegExp(`^ {${tagItemIndent}}-\\s*$`).test(line) &&
				new RegExp(`^ {${tagNameIndent}}name:\\s*Gateway\\s*$`).test(tagsBlock[idx + 1] ?? "")
			) {
				hasGatewayTag = true;
				break;
			}
		}
		if (!hasGatewayTag) {
			lines.splice(
				tagsEnd,
				0,
				`${" ".repeat(tagItemIndent)}-`,
				`${" ".repeat(tagNameIndent)}name: Gateway`,
				`${" ".repeat(tagNameIndent)}description: Core AI Stats Gateway operations.`,
			);
		}
		return;
	}

	const pathsIdx = lines.findIndex((line) => /^paths:\s*$/.test(line));
	const insertAt = pathsIdx === -1 ? lines.length : pathsIdx;
	let tagItemIndent = 2;
	if (pathsIdx !== -1) {
		const firstPathLine = lines.slice(pathsIdx + 1).find((line) => /^(\s+)\/[^:]*:\s*$/.test(line));
		const match = firstPathLine ? /^(\s+)\/[^:]*:\s*$/.exec(firstPathLine) : null;
		if (match?.[1]) {
			tagItemIndent = match[1].length;
		}
	}
	const tagNameIndent = tagItemIndent * 2;
	lines.splice(
		insertAt,
		0,
		"tags:",
		`${" ".repeat(tagItemIndent)}-`,
		`${" ".repeat(tagNameIndent)}name: Gateway`,
		`${" ".repeat(tagNameIndent)}description: Core AI Stats Gateway operations.`,
	);
}

function ensureOperationTags() {
	const pathsIdx = lines.findIndex((line) => /^paths:\s*$/.test(line));
	if (pathsIdx === -1) return;
	let pathsEnd = findBlockEnd(pathsIdx + 1, (line) => topLevelKeyRe.test(line));

	let i = pathsIdx + 1;
	while (i < pathsEnd) {
		if (!methodLineRe.test(lines[i])) {
			i += 1;
			continue;
		}

		const opStart = i + 1;
		const opEnd = findBlockEnd(opStart, (line) => {
			if (methodLineRe.test(line)) return true;
			if (pathLineRe.test(line)) return true;
			return topLevelKeyRe.test(line);
		});

		const hasTags = lines.slice(opStart, opEnd).some((line) => /^ {12}tags:\s*$/.test(line));
		if (!hasTags) {
			let insertAt = opStart;
			while (insertAt < opEnd && /^ {12}x-[^:]+:\s*.*$/.test(lines[insertAt])) {
				insertAt += 1;
				while (insertAt < opEnd && /^ {16,}\S/.test(lines[insertAt])) {
					insertAt += 1;
				}
			}
			lines.splice(insertAt, 0, "            tags:", "                - Gateway");
			pathsEnd += 2;
			i = opEnd + 2;
			continue;
		}

		i = opEnd;
	}
}

ensureInfoContact();
ensureGlobalTag();
ensureOperationTags();

let next = lines.join(eol);
if (hasTrailingNewline && !next.endsWith(eol)) {
	next += eol;
}
if (!hasTrailingNewline && next.endsWith(eol)) {
	next = next.slice(0, -eol.length);
}

if (next !== raw) {
	writeFileSync(specPath, next);
	console.log(`Normalized OpenAPI spec: ${specPath}`);
} else {
	console.log(`OpenAPI spec already normalized: ${specPath}`);
}
