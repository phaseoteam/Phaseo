#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
import { loadOpenApi, buildIR, stringifyIR } from "@ai-stats/oapi-core";
import { backendTs } from "@ai-stats/oapi-backend-ts";
import { backendPython } from "@ai-stats/oapi-backend-python";
import { backendGo } from "@ai-stats/oapi-backend-go";
import { backendCsharp } from "@ai-stats/oapi-backend-csharp";
import { backendRuby } from "@ai-stats/oapi-backend-ruby";
import { backendPhp } from "@ai-stats/oapi-backend-php";
import { backendJava } from "@ai-stats/oapi-backend-java";
import { backendCpp } from "@ai-stats/oapi-backend-cpp";
import { backendRust } from "@ai-stats/oapi-backend-rust";

const args = process.argv.slice(2);
const rawCommand = args[0];
const { command, forcedLang } = parseCommand(rawCommand);

if (!command || command === "--help" || command === "-h") {
	printHelp();
	process.exit(0);
}

if (command === "gen") {
	await runGen(args.slice(1), forcedLang);
} else if (command === "ir") {
	await runIr(args.slice(1));
} else {
	console.error(`Unknown command "${command}".`);
	printHelp();
	process.exit(1);
}

async function runGen(argv: string[], forcedLang: string | null): Promise<void> {
	const options = parseArgs(argv);
	const specPath = requireOption(options, "spec");
	const doc = await loadOpenApi(specPath);
	const { ir, diagnostics } = buildIR(doc, {});
	printDiagnostics(diagnostics);
	if (diagnostics.some((diag) => diag.level === "error")) {
		process.exit(1);
	}

	const languages = resolveLanguages(options, forcedLang);
	if (languages.length === 0) {
		console.error("No languages resolved for generation.");
		process.exit(1);
	}

	if ((options.out || options.sdk) && languages.length > 1) {
		console.error("Use --out or --sdk only when generating a single language.");
		process.exit(1);
	}

	for (const language of languages) {
		const backend = resolveBackend(language);
		const outDir = resolveOutDir(options, language);
		if (!outDir) {
			console.error(`Missing --out/--sdk and no default SDK mapping for "${language}".`);
			process.exit(1);
		}
		await cleanGenerated(outDir);
		const files = await backend.generate(ir, { outDir });
		await writeGeneratedFiles(outDir, files);
		await writeManifest(outDir, files);
	}
}

async function runIr(argv: string[]): Promise<void> {
	const options = parseArgs(argv);
	const specPath = requireOption(options, "spec");
	const outFile = requireOption(options, "out");

	const doc = await loadOpenApi(specPath);
	const { ir, diagnostics } = buildIR(doc, {});
	printDiagnostics(diagnostics);
	if (diagnostics.some((diag) => diag.level === "error")) {
		process.exit(1);
	}

	await fs.mkdir(path.dirname(outFile), { recursive: true });
	await fs.writeFile(outFile, stringifyIR(ir), "utf8");
}

function resolveBackend(lang: string) {
	if (lang === "ts" || lang === "typescript") {
		return backendTs;
	}
	if (lang === "py" || lang === "python") {
		return backendPython;
	}
	if (lang === "go") {
		return backendGo;
	}
	if (lang === "csharp" || lang === "cs") {
		return backendCsharp;
	}
	if (lang === "ruby" || lang === "rb") {
		return backendRuby;
	}
	if (lang === "php") {
		return backendPhp;
	}
	if (lang === "java") {
		return backendJava;
	}
	if (lang === "cpp" || lang === "c++") {
		return backendCpp;
	}
	if (lang === "rust" || lang === "rs") {
		return backendRust;
	}
	console.error(`Unsupported language "${lang}".`);
	process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string> {
	const options: Record<string, string> = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg?.startsWith("--")) {
			const key = arg.slice(2);
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				options[key] = "true";
			} else {
				options[key] = value;
				i += 1;
			}
		}
	}
	return options;
}

function requireOption(options: Record<string, string>, key: string): string {
	const value = options[key];
	if (!value) {
		console.error(`Missing --${key}.`);
		process.exit(1);
	}
	return value;
}

function resolveOutDir(options: Record<string, string>, lang?: string): string | null {
	if (options.out) {
		return path.resolve(options.out);
	}
	if (options.sdk) {
		return resolveSdkOutDir(options.sdk);
	}
	if (lang) {
		return resolveLangOutDir(lang);
	}
	return null;
}

async function cleanGenerated(outDir: string): Promise<void> {
	const manifestPath = path.join(outDir, ".gen-manifest.json");
	let manifest: { files?: string[] } | null = null;
	try {
		const raw = await fs.readFile(manifestPath, "utf8");
		manifest = JSON.parse(raw);
	} catch {
		return;
	}
	const files = manifest?.files ?? [];
	await Promise.all(
		files.map(async (file) => {
			const target = path.resolve(outDir, file);
			if (!isWithinDir(outDir, target)) {
				return;
			}
			try {
				await fs.unlink(target);
			} catch {
				return;
			}
		})
	);
	await removeEmptyDirs(outDir);
}

async function removeEmptyDirs(dir: string): Promise<void> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	await Promise.all(
		entries.map(async (entry) => {
			if (!entry.isDirectory()) {
				return;
			}
			const fullPath = path.join(dir, entry.name);
			await removeEmptyDirs(fullPath);
		})
	);
	const after = await fs.readdir(dir);
	if (after.length === 0) {
		await fs.rmdir(dir);
	}
}

async function writeGeneratedFiles(outDir: string, files: { path: string; contents: string }[]) {
	for (const file of files) {
		const targetPath = path.resolve(outDir, file.path);
		if (!isWithinDir(outDir, targetPath)) {
			throw new Error(`Generated path escapes output dir: ${file.path}`);
		}
		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.writeFile(targetPath, file.contents, "utf8");
	}
}

async function writeManifest(outDir: string, files: { path: string }[]) {
	const manifest = {
		files: files.map((file) => file.path).sort((a, b) => a.localeCompare(b))
	};
	await fs.mkdir(outDir, { recursive: true });
	await fs.writeFile(
		path.join(outDir, ".gen-manifest.json"),
		JSON.stringify(manifest, null, 2) + "\n",
		"utf8"
	);
}

function printDiagnostics(diagnostics: { level: string; code: string; message: string; pointer?: string }[]) {
	for (const diag of diagnostics) {
		const pointer = diag.pointer ? ` (${diag.pointer})` : "";
		const line = `[${diag.level}] ${diag.code} ${diag.message}${pointer}`;
		if (diag.level === "error") {
			console.error(line);
		} else {
			console.warn(line);
		}
	}
}

function isWithinDir(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseCommand(raw?: string): { command: string | null; forcedLang: string | null } {
	if (!raw) {
		return { command: null, forcedLang: null };
	}
	if (raw.startsWith("gen:")) {
		return { command: "gen", forcedLang: raw.slice("gen:".length) || null };
	}
	return { command: raw, forcedLang: null };
}

function resolveLanguages(options: Record<string, string>, forcedLang: string | null): string[] {
	if (forcedLang) {
		return [forcedLang];
	}
	const langOption = options.lang;
	if (!langOption) {
		return Object.keys(availableBackends());
	}
	if (langOption === "all") {
		return Object.keys(availableBackends());
	}
	return langOption.split(",").map((item) => item.trim()).filter(Boolean);
}

function availableBackends(): Record<string, typeof backendTs> {
	return {
		ts: backendTs,
		python: backendPython,
		go: backendGo,
		csharp: backendCsharp,
		ruby: backendRuby,
		php: backendPhp,
		java: backendJava,
		cpp: backendCpp,
		rust: backendRust
	};
}

function resolveLangOutDir(lang: string): string | null {
	const mapping: Record<string, string> = {
		ts: "packages/sdk/sdk-ts/src/oapi-gen",
		typescript: "packages/sdk/sdk-ts/src/oapi-gen",
		py: "packages/sdk/sdk-py/src/gen",
		python: "packages/sdk/sdk-py/src/gen",
		go: "packages/sdk/sdk-go/src/gen",
		csharp: "packages/sdk/sdk-csharp/src/gen",
		cs: "packages/sdk/sdk-csharp/src/gen",
		php: "packages/sdk/sdk-php/src/gen",
		ruby: "packages/sdk/sdk-ruby/lib/gen",
		rb: "packages/sdk/sdk-ruby/lib/gen",
		java: "packages/sdk/sdk-java/src/gen",
		cpp: "packages/sdk/sdk-cpp/src/gen",
		"c++": "packages/sdk/sdk-cpp/src/gen",
		rust: "packages/sdk/sdk-rust/src/gen"
	};
	const outDir = mapping[lang];
	return outDir ? path.resolve(outDir) : null;
}

function resolveSdkOutDir(sdk: string): string | null {
	const mapping: Record<string, string> = {
		"sdk-ts": "packages/sdk/sdk-ts/src/oapi-gen",
		"sdk-py": "packages/sdk/sdk-py/src/gen",
		"sdk-go": "packages/sdk/sdk-go/src/gen",
		"sdk-csharp": "packages/sdk/sdk-csharp/src/gen",
		"sdk-php": "packages/sdk/sdk-php/src/gen",
		"sdk-ruby": "packages/sdk/sdk-ruby/lib/gen",
		"sdk-java": "packages/sdk/sdk-java/src/gen",
		"sdk-cpp": "packages/sdk/sdk-cpp/src/gen",
		"sdk-rust": "packages/sdk/sdk-rust/src/gen"
	};
	const outDir = mapping[sdk];
	if (outDir) {
		return path.resolve(outDir);
	}
	return path.resolve("packages", "sdk", sdk, "src", "gen");
}

function printHelp() {
	console.log(`oapi <command>

Commands:
  gen [--lang <lang|lang,lang|all>] --spec <path> [--sdk <name> | --out <dir>]
  gen:<lang> --spec <path> [--sdk <name> | --out <dir>]
  ir  --spec <path> --out <file>
`);
}
