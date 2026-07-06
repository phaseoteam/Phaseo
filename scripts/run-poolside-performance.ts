import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AIStats from "../packages/sdk/sdk-ts/dist/index.js";

type CliOptions = {
	models: string[];
	count: number;
	baseUrl?: string;
	apiKey?: string;
	maxOutputTokens: number;
	delayMs: number;
};

type LoadedEnv = Record<string, string>;

const DEFAULT_MODELS = ["poolside/laguna-xs.2:free", "poolside/laguna-m.1:free"];
const DEFAULT_BASE_URL = "https://api.phaseo.app/v1";
const DEFAULT_COUNT = 5;
const DEFAULT_MAX_OUTPUT_TOKENS = 160;
const DEFAULT_DELAY_MS = 750;

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const fileEnv = loadEnvFile(resolve(process.cwd(), "apps/web/.env.local"));
	const apiKey =
		options.apiKey ??
		process.env.PHASEO_PERFORMANCE_TEST_KEY ??
		process.env.PHASEO_API_KEY ??
		fileEnv.PHASEO_API_KEY ??
		fileEnv.PHASEO_PERFORMANCE_TEST_KEY;

	if (!apiKey) {
		throw new Error(
			"Missing API key. Pass --api-key or set PHASEO_API_KEY / PHASEO_PERFORMANCE_TEST_KEY.",
		);
	}

	const baseUrl = normalizeBaseUrl(
		options.baseUrl ??
			process.env.PHASEO_GATEWAY_URL ??
			process.env.NEXT_PUBLIC_API_URL ??
			fileEnv.PHASEO_BASE_URL ??
			fileEnv.PHASEO_GATEWAY_URL ??
			fileEnv.NEXT_PUBLIC_API_URL ??
			DEFAULT_BASE_URL,
	);

	const client = new AIStats({
		apiKey,
		baseUrl,
	});

	console.log(
		[
			"Running Poolside performance smoke",
			`Base URL: ${baseUrl}`,
			`Models: ${options.models.join(", ")}`,
			`Requests: ${options.count}`,
			`Max output tokens: ${options.maxOutputTokens}`,
			`Delay between requests: ${options.delayMs}ms`,
			"",
		].join("\n"),
	);

	const health = await client.getHealth();
	console.log(`Gateway health: ${health.status} (${health.timestamp})`);
	console.log("");

	const results: Array<{
		index: number;
		model: string;
		requestId: string | null;
		provider: string | null;
		latencyMs: number;
		inputTokens: number | null;
		outputTokens: number | null;
		totalTokens: number | null;
		textPreview: string;
	}> = [];

	for (let index = 0; index < options.count; index++) {
		const model = options.models[index % options.models.length]!;
		const startedAt = Date.now();
		const response = (await client.chat.completions.create({
			model,
			messages: [
				{
					role: "user",
					content: buildPrompt(index + 1, model),
				},
			],
			max_tokens: options.maxOutputTokens,
			temperature: 0.2,
		})) as any;
		const latencyMs = Date.now() - startedAt;
		const text = extractOutputText(response);
		const usage = response?.usage ?? null;

		const result = {
			index: index + 1,
			model,
			requestId:
				response?.request_id ??
				response?.id ??
				response?._request_id ??
				null,
			provider: response?.provider ?? null,
			latencyMs,
			inputTokens: numberOrNull(
				usage?.input_tokens ?? usage?.prompt_tokens,
			),
			outputTokens: numberOrNull(
				usage?.output_tokens ?? usage?.completion_tokens,
			),
			totalTokens: numberOrNull(usage?.total_tokens),
			textPreview: text.slice(0, 120).replace(/\s+/g, " ").trim(),
		};

		results.push(result);
		console.log(
			[
				`[${result.index}/${options.count}] ${result.model}`,
				`  request_id: ${result.requestId ?? "-"}`,
				`  provider: ${result.provider ?? "-"}`,
				`  latency_ms: ${result.latencyMs}`,
				`  usage: in=${formatMetric(result.inputTokens)} out=${formatMetric(result.outputTokens)} total=${formatMetric(result.totalTokens)}`,
				`  preview: ${result.textPreview || "(no text output)"}`,
			].join("\n"),
		);

		if (index < options.count - 1 && options.delayMs > 0) {
			await sleep(options.delayMs);
		}
	}

	const successful = results.length;
	const averageLatencyMs = Math.round(
		results.reduce((sum, result) => sum + result.latencyMs, 0) / successful,
	);
	const totalInputTokens = results.reduce(
		(sum, result) => sum + (result.inputTokens ?? 0),
		0,
	);
	const totalOutputTokens = results.reduce(
		(sum, result) => sum + (result.outputTokens ?? 0),
		0,
	);
	const totalTokens = results.reduce(
		(sum, result) => sum + (result.totalTokens ?? 0),
		0,
	);

	console.log("");
	console.log("Summary");
	console.log(`  successful_requests: ${successful}`);
	console.log(`  average_latency_ms: ${averageLatencyMs}`);
	console.log(`  total_input_tokens: ${totalInputTokens}`);
	console.log(`  total_output_tokens: ${totalOutputTokens}`);
	console.log(`  total_tokens: ${totalTokens}`);
	console.log("");
	console.log("Telemetry note: the model page may take a short moment to refresh after the requests complete.");
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		models: [...DEFAULT_MODELS],
		count: DEFAULT_COUNT,
		maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
		delayMs: DEFAULT_DELAY_MS,
	};

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--models") {
			options.models = (argv[++index] ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean);
			continue;
		}
		if (arg === "--count") {
			options.count = Number(argv[++index] ?? DEFAULT_COUNT) || DEFAULT_COUNT;
			continue;
		}
		if (arg === "--base-url") {
			options.baseUrl = argv[++index];
			continue;
		}
		if (arg === "--api-key") {
			options.apiKey = argv[++index];
			continue;
		}
		if (arg === "--max-output-tokens") {
			options.maxOutputTokens =
				Number(argv[++index] ?? DEFAULT_MAX_OUTPUT_TOKENS) ||
				DEFAULT_MAX_OUTPUT_TOKENS;
			continue;
		}
		if (arg === "--delay-ms") {
			options.delayMs =
				Number(argv[++index] ?? DEFAULT_DELAY_MS) || DEFAULT_DELAY_MS;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printUsageAndExit();
		}
	}

	if (!options.models.length) {
		options.models = [...DEFAULT_MODELS];
	}

	return options;
}

function printUsageAndExit(): never {
	console.log(
		[
			"Usage:",
			"  pnpm tsx scripts/run-poolside-performance.ts [options]",
			"",
			"Options:",
			"  --models <csv>              Comma-separated model ids",
			"  --count <n>                 Number of requests to run",
			"  --base-url <url>            Gateway base URL",
			"  --api-key <key>             Gateway API key",
			"  --max-output-tokens <n>     Max output tokens per request",
			"  --delay-ms <n>              Delay between sequential requests",
		].join("\n"),
	);
	process.exit(0);
}

function buildPrompt(index: number, model: string): string {
	return [
		`Request ${index} for ${model}.`,
		"Write a compact but complete answer with three numbered bullets.",
		"Explain one thing each about latency, throughput, and uptime in an AI gateway.",
		"Finish with a single sentence practical takeaway.",
	].join(" ");
}

function extractOutputText(response: any): string {
	if (typeof response?.output_text === "string" && response.output_text.trim()) {
		return response.output_text;
	}

	const output = Array.isArray(response?.output) ? response.output : [];
	const textParts: string[] = [];
	for (const item of output) {
		const content = Array.isArray(item?.content) ? item.content : [];
		for (const chunk of content) {
			if (chunk?.type === "output_text" && typeof chunk?.text === "string") {
				textParts.push(chunk.text);
			}
		}
	}
	if (textParts.length) {
		return textParts.join("\n").trim();
	}

	const choices = Array.isArray(response?.choices) ? response.choices : [];
	const firstChoice = choices[0];
	const messageContent = firstChoice?.message?.content;
	if (typeof messageContent === "string") {
		return messageContent.trim();
	}
	if (Array.isArray(messageContent)) {
		const textParts = messageContent
			.map((part) =>
				typeof part?.text === "string"
					? part.text
					: typeof part === "string"
						? part
						: "",
			)
			.filter(Boolean);
		if (textParts.length) {
			return textParts.join("\n").trim();
		}
	}
	return "";
}

function loadEnvFile(path: string): LoadedEnv {
	if (!existsSync(path)) return {};
	const content = readFileSync(path, "utf8");
	const lines = content.split(/\r?\n/);
	const env: LoadedEnv = {};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separatorIndex = trimmed.indexOf("=");
		if (separatorIndex === -1) continue;
		const key = trimmed.slice(0, separatorIndex).trim();
		const rawValue = trimmed.slice(separatorIndex + 1).trim();
		env[key] = stripWrappingQuotes(rawValue);
	}

	return env;
}

function stripWrappingQuotes(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function normalizeBaseUrl(value: string): string {
	const trimmed = value.trim().replace(/\/+$/, "");
	if (!trimmed) return DEFAULT_BASE_URL;
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function sleep(ms: number) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMetric(value: number | null): string {
	return value == null ? "-" : String(value);
}

main().catch((error) => {
	console.error(
		error instanceof Error ? error.message : "Unknown error running Poolside performance smoke.",
	);
	process.exit(1);
});
