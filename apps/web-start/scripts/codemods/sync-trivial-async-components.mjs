// Convert async React components that only await translations, the locale,
// route params or `connection()` into synchronous components (PORTING.md §1).
// Only component bodies (capitalised functions and the default export) are
// rewritten; generateMetadata and other server helpers keep their awaits.
// usage: node sync-trivial-async-components.mjs <file> [file...]
import fs from "node:fs";

/** Index just past the brace that closes the block opening at `open`. */
function matchBrace(code, open) {
	let depth = 0;
	let quote = null;
	for (let i = open; i < code.length; i++) {
		const c = code[i];
		if (quote) {
			if (c === "\\") { i++; continue; }
			if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
		if (c === "/" && code[i + 1] === "/") { const nl = code.indexOf("\n", i); i = nl < 0 ? code.length : nl; continue; }
		if (c === "/" && code[i + 1] === "*") { const end = code.indexOf("*/", i + 2); i = end < 0 ? code.length : end + 1; continue; }
		if (c === "{") depth++;
		else if (c === "}") { depth--; if (depth === 0) return i + 1; }
	}
	return -1;
}

const COMPONENT_START = /(export\s+default\s+async\s+function(?:\s+([A-Za-z_$][\w$]*))?\s*\(|(?:export\s+)?async\s+function\s+([A-Z][\w$]*)\s*\()/g;

function convertBody(body) {
	let out = body;
	out = out.replace(/const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*await\s+Promise\.all\(\s*\[\s*getTranslations\(([^)]*)\)\s*,\s*getLocale\(\)\s*,?\s*\]\s*\);?/g, (_m, t, locale, args) => `const ${t} = useTranslations(${nsArg(args)});\n\tconst ${locale} = useLocale();`);
	out = out.replace(/const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*await\s+Promise\.all\(\s*\[\s*getLocale\(\)\s*,\s*getTranslations\(([^)]*)\)\s*,?\s*\]\s*\);?/g, (_m, locale, t, args) => `const ${locale} = useLocale();\n\tconst ${t} = useTranslations(${nsArg(args)});`);
	out = out.replace(/await\s+getTranslations\(([^)]*)\)/g, (_m, args) => `useTranslations(${nsArg(args)})`);
	out = out.replace(/await\s+getLocale\(\)/g, "useLocale()");
	out = out.replace(/await\s+getFormatter\(([^)]*)\)/g, "useFormatter()");
	out = out.replace(/^[ \t]*await\s+connection\(\);?[ \t]*\n/gm, "");
	out = out.replace(/^[ \t]*setRequestLocale\([^)]*\);?[ \t]*\n/gm, "");
	out = out.replace(/await\s+(params|searchParams|props\.params|props\.searchParams)\b/g, (_m, name) => `use(${name})`);
	return out;
}

function nsArg(args) {
	const trimmed = args.trim();
	if (!trimmed.startsWith("{")) return trimmed;
	const ns = trimmed.match(/namespace\s*:\s*([^,}]+)/);
	return ns ? ns[1].trim() : "";
}

function ensureImport(code, names, from) {
	const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${from.replace(/\//g, "\\/")}["'];?`);
	const match = code.match(re);
	if (match) {
		const existing = match[1].split(",").map((s) => s.trim()).filter(Boolean);
		const merged = [...new Set([...existing, ...names])];
		return code.replace(match[0], `import { ${merged.join(", ")} } from "${from}";`);
	}
	const line = `import { ${names.join(", ")} } from "${from}";\n`;
	const directive = code.match(/^\s*["']use (client|server)["'];?\s*\n/);
	if (directive) return directive[0] + line + code.slice(directive[0].length);
	return line + code;
}

function dropUnusedImport(code, name, from) {
	const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${from.replace(/\//g, "\\/")}["'];?\\n?`);
	const match = code.match(re);
	if (!match) return code;
	const rest = code.replace(match[0], "");
	if (new RegExp(`\\b${name}\\b`).test(rest)) return code;
	const kept = match[1].split(",").map((s) => s.trim()).filter((s) => s && s.replace(/^type\s+/, "").split(/\s+as\s+/)[0] !== name);
	return code.replace(match[0], kept.length ? `import { ${kept.join(", ")} } from "${from}";\n` : "");
}

/** Returns converted code, or null when a component still awaits something else. */
export function convert(code) {
	let out = "";
	let cursor = 0;
	let changed = false;
	let blocked = false;
	for (const match of code.matchAll(COMPONENT_START)) {
		const name = match[2] ?? match[3];
		if (match[3] === undefined && name && /^[a-z]/.test(name) && !match[0].includes("export default")) continue;
		const bodyOpen = code.indexOf("{", code.indexOf(")", match.index) === -1 ? match.index : findParamsEnd(code, match.index + match[0].length - 1));
		if (bodyOpen < 0) continue;
		const bodyClose = matchBrace(code, bodyOpen);
		if (bodyClose < 0) continue;
		const header = code.slice(match.index, bodyOpen).replace(/async\s+function/, "function");
		const body = convertBody(code.slice(bodyOpen, bodyClose));
		if (/\bawait\b/.test(body.replace(/\/\/.*$/gm, ""))) blocked = true;
		out += code.slice(cursor, match.index) + header + body;
		cursor = bodyClose;
		changed = true;
	}
	if (!changed) return code;
	if (blocked) return null;
	out += code.slice(cursor);
	if (/\buseTranslations\(/.test(out) && !/import[^;]*\buseTranslations\b[^;]*from\s*["']next-intl["']/.test(out)) out = ensureImport(out, ["useTranslations"], "next-intl");
	if (/\buseLocale\(/.test(out) && !/import[^;]*\buseLocale\b[^;]*from\s*["']next-intl["']/.test(out)) out = ensureImport(out, ["useLocale"], "next-intl");
	if (/\buseFormatter\(/.test(out) && !/import[^;]*\buseFormatter\b[^;]*from\s*["']next-intl["']/.test(out)) out = ensureImport(out, ["useFormatter"], "next-intl");
	if (/\buse\((params|searchParams|props\.)/.test(out) && !/import[^;]*\buse\b[^;]*from\s*["']react["']/.test(out)) out = ensureImport(out, ["use"], "react");
	for (const name of ["getTranslations", "getLocale", "getFormatter", "setRequestLocale"]) out = dropUnusedImport(out, name, "next-intl/server");
	out = dropUnusedImport(out, "connection", "next/server");
	return out;
}

/** Index of the `)` that closes the parameter list starting at `open` (an index of `(`). */
function findParamsEnd(code, open) {
	let depth = 0;
	for (let i = open; i < code.length; i++) {
		if (code[i] === "(") depth++;
		else if (code[i] === ")") { depth--; if (depth === 0) return i; }
	}
	return open;
}

if (process.argv[1]?.endsWith("sync-trivial-async-components.mjs")) {
	const failed = [];
	let converted = 0;
	for (const file of process.argv.slice(2)) {
		const code = fs.readFileSync(file, "utf8");
		const result = convert(code);
		if (result === null) { failed.push(file); continue; }
		if (result !== code) { fs.writeFileSync(file, result); converted++; }
	}
	console.log(JSON.stringify({ converted, needsManual: failed.length }));
	if (failed.length && process.env.LIST) console.log(failed.join("\n"));
}
