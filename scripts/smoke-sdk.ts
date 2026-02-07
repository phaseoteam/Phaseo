import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

type Entry = {
	label: string;
	cwd: string;
	steps: Step[];
	env?: Record<string, string>;
};

type Step = {
	command: string;
	args: string[];
};

const repoRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);
let tsxPath = "";
try {
	tsxPath = require.resolve("tsx/dist/cli.js");
} catch {
	tsxPath = "";
}
const javaGenDir = resolve(repoRoot, "packages", "sdk", "sdk-java", "src", "gen");
const javaSources = existsSync(javaGenDir)
	? readdirSync(javaGenDir)
			.filter((file) => file.endsWith(".java"))
			.map((file) => join(javaGenDir, file))
	: [];

const entries: Entry[] = [
	{
		label: "ts",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-ts"),
		steps: [
			{
				command: process.execPath,
				args: [tsxPath, "tests/smoke.ts"]
			}
		]
	},
	{
		label: "py",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-py"),
		steps: [
			{
				command: resolveExecutable("PYTHON_EXE", "python"),
				args: ["tests/smoke_chat.py"]
			}
		]
	},
	{
		label: "go",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-go"),
		env: {
			GOCACHE: resolve(repoRoot, ".cache", "go-build")
		},
		steps: [
			{
				command: resolveExecutable("GO_EXE", "go"),
				args: ["test", "./tests", "-run", "TestSmokeChat", "-v"]
			}
		]
	},
	{
		label: "ruby",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-ruby"),
		steps: [
			{
				command: resolveExecutable("RUBY_EXE", "ruby"),
				args: ["tests/smoke_chat.rb"]
			}
		]
	},
	{
		label: "php",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-php"),
		steps: [
			{
				command: resolveExecutable("PHP_EXE", "php"),
				args: ["tests/smoke_chat.php"]
			}
		]
	},
	{
		label: "csharp",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-csharp"),
		steps: [
			{
				command: resolveExecutable("DOTNET_EXE", "dotnet"),
				args: ["run", "--project", "tests/SmokeChat/SmokeChat.csproj"]
			}
		]
	},
	{
		label: "java",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-java"),
		steps: [
			{
				command: resolveExecutable("JAVAC_EXE", "javac"),
				args: ["-d", "tests/out", ...javaSources, "tests/SmokeChat.java"]
			},
			{
				command: resolveExecutable("JAVA_EXE", "java"),
				args: ["-cp", "tests/out", "SmokeChat"]
			}
		]
	},
	{
		label: "rust",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-rust"),
		steps: [
			{
				command: resolveExecutable("CARGO_EXE", "cargo"),
				args: ["test", "--test", "smoke_chat", "--", "--nocapture"]
			}
		]
	},
	{
		label: "cpp",
		cwd: resolve(repoRoot, "packages", "sdk", "sdk-cpp"),
		steps: [
			{
				command: resolveExecutable("GPP_EXE", "g++"),
				args: ["-std=c++17", "-I", "src/gen", "-o", "tests/smoke_chat.exe", "tests/smoke_chat.cpp"]
			},
			{
				command: resolve(repoRoot, "packages", "sdk", "sdk-cpp", "tests", "smoke_chat.exe"),
				args: []
			}
		]
	}
];

type Result = {
	label: string;
	status: "pass" | "fail";
	code: number | null;
	output: string;
};

const results: Result[] = [];

for (const entry of entries) {
	let combinedOutput = "";
	let exitCode = 0;
	const preflight = preflightFailure(entry.label);
	if (preflight) {
		results.push({
			label: entry.label,
			status: "fail",
			code: 1,
			output: preflight
		});
		continue;
	}
	const env = { ...process.env, ...loadEnv(entry.cwd), ...entry.env };
	ensureCacheDirs(env);
	for (const step of entry.steps) {
		const result = spawnSync(step.command, step.args, {
			stdio: "pipe",
			encoding: "utf8",
			cwd: entry.cwd,
			env,
			shell: false
		});
		const errorMessage = result.error ? result.error.message : "";
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
		const stepOutput = [output, errorMessage].filter(Boolean).join("\n").trim();
		if (stepOutput) {
			combinedOutput = combinedOutput ? `${combinedOutput}\n${stepOutput}` : stepOutput;
		}
		if (result.status !== 0) {
			exitCode = result.status ?? 1;
			break;
		}
	}
	results.push({
		label: entry.label,
		status: exitCode === 0 ? "pass" : "fail",
		code: exitCode,
		output: combinedOutput
	});
}

const longestLabel = Math.max(...results.map((result) => result.label.length), 4);
const header = `| ${pad("sdk", longestLabel)} | status | code |`;
const divider = `|-${"-".repeat(longestLabel)}-|--------|------|`;
console.log(header);
console.log(divider);
for (const result of results) {
	console.log(
		`| ${pad(result.label, longestLabel)} | ${pad(result.status, 6)} | ${pad(
			result.code === null ? "?" : String(result.code),
			4
		)} |`
	);
}

for (const result of results) {
	if (result.status === "fail") {
		console.log(`\n[${result.label}] output:\n${result.output || "(no output)"}`);
	}
}

if (results.some((result) => result.status !== "pass")) {
	process.exit(1);
}

function pad(value: string, length: number): string {
	if (value.length >= length) return value;
	return value + " ".repeat(length - value.length);
}

function resolveExecutable(envKey: string, fallback: string): string {
	const explicit = process.env[envKey];
	if (explicit && explicit.trim().length > 0) {
		return explicit;
	}
	return fallback;
}

function loadEnv(cwd: string): Record<string, string> {
	const envPath = join(cwd, ".env.local");
	if (!existsSync(envPath)) {
		return {};
	}
	const content = readFileSync(envPath, "utf8");
	const lines = content.split(/\r?\n/);
	const result: Record<string, string> = {};
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const index = trimmed.indexOf("=");
		if (index === -1) continue;
		const key = trimmed.slice(0, index).trim();
		const value = trimmed.slice(index + 1).trim();
		result[key] = value;
	}
	return result;
}

function ensureCacheDirs(env: Record<string, string | undefined>): void {
	const cache = env.GOCACHE;
	if (cache && !existsSync(cache)) {
		mkdirSync(cache, { recursive: true });
	}
}

function preflightFailure(label: string): string | null {
	if (label === "ts" && !tsxPath) {
		return "tsx is not available. Run pnpm install.";
	}
	if (label === "java" && javaSources.length === 0) {
		return `No Java sources found under ${javaGenDir}.`;
	}
	return null;
}
