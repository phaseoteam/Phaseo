import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const forbiddenDomains = [
	{
		label: "legacy Phaseo .ai domain",
		pattern: new RegExp(`phaseo${"\\."}ai`, "giu"),
	},
	{
		label: "legacy AI Stats Phaseo subdomain",
		pattern: new RegExp(`ai-stats${"\\."}phaseo${"\\."}app`, "giu"),
	},
];

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
	encoding: "utf8",
	maxBuffer: 64 * 1024 * 1024,
})
	.split("\0")
	.filter(Boolean);

function decodeUtf16BigEndian(contents) {
	const swapped = Buffer.allocUnsafe(contents.length);
	for (let index = 0; index + 1 < contents.length; index += 2) {
		swapped[index] = contents[index + 1];
		swapped[index + 1] = contents[index];
	}
	return swapped.toString("utf16le");
}

function decodeTrackedText(contents) {
	if (contents.length >= 2 && contents[0] === 0xff && contents[1] === 0xfe) {
		return contents.subarray(2).toString("utf16le");
	}
	if (contents.length >= 2 && contents[0] === 0xfe && contents[1] === 0xff) {
		return decodeUtf16BigEndian(contents.subarray(2));
	}
	if (!contents.includes(0)) return contents.toString("utf8");

	const pairs = Math.floor(contents.length / 2);
	if (pairs === 0) return null;

	let evenNuls = 0;
	let oddNuls = 0;
	for (let index = 0; index + 1 < contents.length; index += 2) {
		if (contents[index] === 0) evenNuls += 1;
		if (contents[index + 1] === 0) oddNuls += 1;
	}

	const evenRatio = evenNuls / pairs;
	const oddRatio = oddNuls / pairs;
	if (oddRatio > 0.3 && evenRatio < 0.05) return contents.toString("utf16le");
	if (evenRatio > 0.3 && oddRatio < 0.05) return decodeUtf16BigEndian(contents);
	return null;
}

const violations = [];

for (const path of trackedFiles) {
	// This immutable replay snapshot preserves production's old identifiers.
	// Active schema definitions and forward migrations remain subject to this check.
	if (path === "supabase/baseline/schema.sql") continue;
	const text = decodeTrackedText(readFileSync(path));
	if (text === null) continue;

	for (const { label, pattern } of forbiddenDomains) {
		for (const match of text.matchAll(pattern)) {
			const line = text.slice(0, match.index).split("\n").length;
			violations.push(`${path}:${line}: ${label} (${match[0]})`);
		}
	}
}

if (violations.length > 0) {
	console.error("Non-canonical Phaseo domain references found:");
	for (const violation of violations) console.error(`- ${violation}`);
	console.error("Use phaseo.app (or an appropriate phaseo.app subdomain).\n");
	process.exit(1);
}

console.log(
	`Canonical domain check passed across ${trackedFiles.length} tracked files.`,
);
