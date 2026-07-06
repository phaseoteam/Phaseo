import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
	const options = {
		dir: ".ai-stats-devtools",
		model: "openai/gpt-5-nano",
		input: "Hi",
		maxOutputTokens: "32",
		clean: true,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--dir" && argv[i + 1]) {
			options.dir = argv[i + 1];
			i += 1;
			continue;
		}
		if (arg === "--model" && argv[i + 1]) {
			options.model = argv[i + 1];
			i += 1;
			continue;
		}
		if (arg === "--input" && argv[i + 1]) {
			options.input = argv[i + 1];
			i += 1;
			continue;
		}
		if (arg === "--max-output-tokens" && argv[i + 1]) {
			options.maxOutputTokens = argv[i + 1];
			i += 1;
			continue;
		}
		if (arg === "--no-clean") {
			options.clean = false;
		}
	}

	return options;
}

function runCommand(command, env) {
	const result = spawnSync(command, {
		shell: true,
		stdio: "inherit",
		env,
	});
	if (typeof result.status !== "number") {
		return 1;
	}
	return result.status;
}

const options = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const outputDir = path.resolve(repoRoot, options.dir);

if (!process.env.PHASEO_API_KEY) {
	console.log("PHASEO_API_KEY not set in shell; relying on per-SDK .env.local files.");
}

if (options.clean && existsSync(outputDir)) {
	rmSync(outputDir, { recursive: true, force: true });
}
mkdirSync(outputDir, { recursive: true });

const sharedEnv = {
	...process.env,
	PHASEO_DEVTOOLS: "true",
	PHASEO_DEVTOOLS_DIR: outputDir,
	PHASEO_SMOKE_MODEL: options.model,
	PHASEO_SMOKE_INPUT: options.input,
	PHASEO_SMOKE_MAX_OUTPUT_TOKENS: options.maxOutputTokens,
};

const runs = [
	{ name: "TypeScript SDK", command: "pnpm --filter @phaseo/sdk smoke:responses" },
	{ name: "Python SDK", command: "pnpm --filter @ai-stats/py-sdk smoke:responses" },
	{ name: "Go SDK", command: "pnpm --filter @ai-stats/go-sdk smoke:responses:sdk" },
	{ name: "C# SDK", command: "pnpm --filter @ai-stats/csharp-sdk smoke:responses:sdk" },
	{ name: "Java SDK", command: "pnpm --filter @ai-stats/java-sdk smoke:responses:sdk" },
	{ name: "PHP SDK", command: "pnpm --filter @ai-stats/php-sdk smoke:responses:sdk" },
	{ name: "Ruby SDK", command: "pnpm --filter @ai-stats/ruby-sdk smoke:responses:sdk" },
];

const failures = [];
console.log(`Using devtools directory: ${outputDir}`);
console.log(`Model: ${options.model}`);
console.log(`Input: ${options.input}`);
console.log(`Max output tokens: ${options.maxOutputTokens}`);

for (const run of runs) {
	console.log(`\n=== ${run.name} ===`);
	const exitCode = runCommand(run.command, sharedEnv);
	if (exitCode !== 0) {
		failures.push({ ...run, exitCode });
	}
}

const generationsPath = path.join(outputDir, "generations.jsonl");
const metadataPath = path.join(outputDir, "metadata.json");
if (!existsSync(generationsPath)) {
	console.error(`\nMissing ${generationsPath}.`);
	process.exit(1);
}
if (!existsSync(metadataPath)) {
	console.error(`\nMissing ${metadataPath}.`);
	process.exit(1);
}

if (failures.length > 0) {
	console.error("\nSome SDK smoke runs failed:");
	for (const failure of failures) {
		console.error(`- ${failure.name} (exit ${failure.exitCode})`);
	}
	process.exit(1);
}

console.log("\nAll 7 SDK smoke runs completed successfully.");
console.log(`Devtools data: ${outputDir}`);
console.log("Open viewer with:");
if (path.resolve(repoRoot, ".ai-stats-devtools") === outputDir) {
	console.log("pnpm ai-stats-devtools");
} else {
	console.log(`pnpm --filter @phaseo/devtools-viewer start -- --dir \"${outputDir}\"`);
}
