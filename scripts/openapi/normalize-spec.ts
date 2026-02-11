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
	const hasContact = lines.slice(infoIdx + 1, infoEnd).some((line) => /^ {4}contact:\s*$/.test(line));
	if (hasContact) return;

	const versionIdx = lines.slice(infoIdx + 1, infoEnd).findIndex((line) => /^ {4}version:\s*/.test(line));
	const insertAt = versionIdx === -1 ? infoIdx + 1 : infoIdx + 1 + versionIdx + 1;
	lines.splice(
		insertAt,
		0,
		"    contact:",
		"        name: AI Stats",
		"        url: https://docs.ai-stats.phaseo.app",
		"        email: danielbutler500@gmail.com",
	);
}

function ensureGlobalTag() {
	const tagsIdx = lines.findIndex((line) => line.trim() === "tags:");
	if (tagsIdx !== -1) {
		const tagsEnd = findBlockEnd(tagsIdx + 1, (line) => topLevelKeyRe.test(line));
		const hasGatewayTag = lines
			.slice(tagsIdx + 1, tagsEnd)
			.some((line) => /^ {4}- name:\s*Gateway\s*$/.test(line));
		if (!hasGatewayTag) {
			lines.splice(
				tagsEnd,
				0,
				"    - name: Gateway",
				"      description: Core AI Stats Gateway operations.",
			);
		}
		return;
	}

	const pathsIdx = lines.findIndex((line) => line.trim() === "paths:");
	const insertAt = pathsIdx === -1 ? lines.length : pathsIdx;
	lines.splice(
		insertAt,
		0,
		"tags:",
		"    - name: Gateway",
		"      description: Core AI Stats Gateway operations.",
	);
}

function ensureOperationTags() {
	let i = 0;
	while (i < lines.length) {
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
