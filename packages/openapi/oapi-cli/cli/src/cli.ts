#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
import { loadOpenApi, buildIR, stringifyIR } from "@ai-stats/oapi-core";
import { backendTs } from "@ai-stats/oapi-backend-ts";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
	printHelp();
	process.exit(0);
}

if (command === "gen") {
	await runGen(args.slice(1));
} else if (command === "ir") {
	await runIr(args.slice(1));
} else {
	console.error(`Unknown command "${command}".`);
	printHelp();
	process.exit(1);
}

async function runGen(argv: string[]): Promise<void> {
	const options = parseArgs(argv);
	const specPath = requireOption(options, "spec");
	const lang = requireOption(options, "lang");
	const outDir = resolveOutDir(options);

	if (!outDir) {
		console.error("Missing --out or --sdk.");
		process.exit(1);
	}

	const backend = resolveBackend(lang);
	const doc = await loadOpenApi(specPath);
	const { ir, diagnostics } = buildIR(doc, {});
	printDiagnostics(diagnostics);
	if (diagnostics.some((diag) => diag.level === "error")) {
		process.exit(1);
	}

	await cleanGenerated(outDir);

	const files = await backend.generate(ir, { outDir });
	await writeGeneratedFiles(outDir, files);
	await writeManifest(outDir, files);
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

function resolveOutDir(options: Record<string, string>): string | null {
	if (options.out) {
		return path.resolve(options.out);
	}
	if (options.sdk) {
		return path.resolve("packages", options.sdk, "src", "gen");
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
		files: files.map((file) => file.path).sort((a, b) => a.localeCompare(b)),
		generatedAt: new Date().toISOString()
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

function printHelp() {
	console.log(`oapi <command>

Commands:
  gen --spec <path> --lang <lang> [--sdk <name> | --out <dir>]
  ir  --spec <path> --out <file>
`);
}
