/**
 * Changed files in reading order (T3's pullRequestFileOrder.logic): source first, with what a file imports ahead of
 * what imports it, then the tests that cover it, then whatever a tool wrote. Ordering by path alone buries the file
 * the change is about under whichever directory sorts first.
 */
export type DiffFileTier = "source" | "test" | "generated";
export type OrderableFile = { path: string; lines: readonly string[] };

const GENERATED_NAMES = new Set(["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb", "Cargo.lock", "go.sum", "composer.lock", "Gemfile.lock"]);
const GENERATED_DIRECTORIES = new Set(["__snapshots__", "__generated__", "dist", "build", "vendor"]);
const TEST_DIRECTORIES = new Set(["__tests__", "tests", "test"]);
const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export function diffFileTier(path: string): DiffFileTier {
	const segments = path.split("/"), name = segments.at(-1) ?? "", directories = segments.slice(0, -1);
	if (GENERATED_NAMES.has(name) || name.endsWith(".snap") || name.endsWith(".min.js") || name.endsWith(".min.css") || /\.generated\./.test(name) || directories.some(segment => GENERATED_DIRECTORIES.has(segment))) return "generated";
	if (/\.(?:test|spec)\./.test(name) || directories.some(segment => TEST_DIRECTORIES.has(segment))) return "test";
	return "source";
}
const stripExtension = (path: string) => { const dot = path.lastIndexOf("."), slash = path.lastIndexOf("/"); return dot > slash ? path.slice(0, dot) : path; };
const baseName = (path: string) => stripExtension(path.split("/").at(-1) ?? "");
function resolveRelative(from: string, specifier: string) {
	const segments = from.split("/").slice(0, -1);
	for (const part of specifier.split("/")) { if (part === "." || part === "") continue; if (part === "..") segments.pop(); else segments.push(part); }
	return segments.join("/");
}
// `import x from "y"`, `import "y"`, `export … from "y"` and `require("y")` all reduce to a quoted specifier after one of three words.
const IMPORT = /(?:\bfrom|\bimport|\brequire\s*\()\s*\(?\s*["']([^"']+)["']/g;
function importedPaths(path: string, lines: readonly string[], byModule: ReadonlyMap<string, string>, byBase: ReadonlyMap<string, string>) {
	const imported = new Set<string>();
	for (const line of lines) for (const match of line.matchAll(IMPORT)) {
		const specifier = match[1] ?? "", target = specifier.startsWith(".") ? resolveRelative(path, specifier) : specifier;
		// TypeScript imports name the `.js` beside a `.ts`, so any module extension is dropped before matching.
		const extension = MODULE_EXTENSIONS.find(candidate => target.endsWith(candidate)), resolved = extension ? target.slice(0, -extension.length) : target;
		const found = byModule.get(resolved) ?? byModule.get(`${resolved}/index`) ?? byBase.get(baseName(resolved));
		if (found !== undefined && found !== path) imported.add(found);
	}
	return imported;
}
/** Kahn's, taking the lowest ready path each step so a change always reads the same way; a cycle falls back to path order. */
function orderByImports(paths: readonly string[], imports: ReadonlyMap<string, ReadonlySet<string>>) {
	const remaining = new Set(paths), ordered: string[] = [], sorted = [...paths].sort((left, right) => left.localeCompare(right));
	while (remaining.size) {
		const candidates = sorted.filter(path => remaining.has(path));
		const next = candidates.find(path => [...(imports.get(path) ?? [])].every(dependency => !remaining.has(dependency))) ?? candidates[0];
		remaining.delete(next); ordered.push(next);
	}
	return ordered;
}
const testedBaseName = (path: string) => (path.split("/").at(-1) ?? "").replace(/\.(?:test|spec)\..*$/, "").replace(/\.[^.]+$/, "");

/** `lines` are the patch's own added and removed lines, which is all the import graph sees. Returns paths in order. */
export function orderDiffFiles(files: readonly OrderableFile[]): string[] {
	const byPath = new Map(files.map(file => [file.path, file]));
	const paths = [...byPath.keys()], tiers = new Map(paths.map(path => [path, diffFileTier(path)]));
	const source = paths.filter(path => tiers.get(path) === "source");
	const byModule = new Map<string, string>(), byBase = new Map<string, string>(), ambiguous = new Set<string>();
	for (const path of source) { byModule.set(stripExtension(path), path); const base = baseName(path); if (byBase.has(base)) ambiguous.add(base); byBase.set(base, path); }
	for (const base of ambiguous) byBase.delete(base);
	const imports = new Map(source.map(path => [path, importedPaths(path, byPath.get(path)!.lines, byModule, byBase)]));
	const orderedSource = orderByImports(source, imports);
	const positions = new Map<string, number>();
	orderedSource.forEach((path, index) => { const base = baseName(path); if (!positions.has(base)) positions.set(base, index); });
	const tests = paths.filter(path => tiers.get(path) === "test").sort((left, right) => (positions.get(testedBaseName(left)) ?? Number.MAX_SAFE_INTEGER) - (positions.get(testedBaseName(right)) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right));
	const generated = paths.filter(path => tiers.get(path) === "generated").sort((left, right) => left.localeCompare(right));
	return [...orderedSource, ...tests, ...generated];
}
/** The changed lines of a unified patch, without the +/- marks. */
export function patchLines(patch: string | undefined) { return (patch ?? "").split("\n").filter(line => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")).map(line => line.slice(1)); }
