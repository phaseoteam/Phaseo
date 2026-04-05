import { config as dotenvConfig } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;

function loadLocalEnv(apiRoot: string) {
	const envPaths = [
		path.join(apiRoot, ".dev.vars"),
		path.join(apiRoot, ".env.local"),
		path.join(apiRoot, ".env"),
	];
	for (const envPath of envPaths) {
		if (!fs.existsSync(envPath)) continue;
		dotenvConfig({ path: envPath, override: false });
	}
}

function trimQuotes(value: string | undefined): string {
	if (!value) return "";
	return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseJson(text: string): JsonRecord | null {
	try {
		return JSON.parse(text) as JsonRecord;
	} catch {
		return null;
	}
}

function summarizeUsage(usage: unknown): string {
	if (!usage || typeof usage !== "object") return "none";
	const u = usage as JsonRecord;
	const prompt = u.prompt_tokens ?? u.input_tokens ?? u.input_text_tokens ?? "?";
	const completion = u.completion_tokens ?? u.output_tokens ?? u.output_text_tokens ?? "?";
	const total = u.total_tokens ?? "?";
	return `present (prompt/input=${String(prompt)}, completion/output=${String(completion)}, total=${String(total)})`;
}

async function runNonStream(baseUrl: string, apiKey: string, model: string) {
	const body = {
		model,
		messages: [{ role: "user", content: "Reply with exactly: hi" }],
		stream: false,
	};

	const res = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	const text = await res.text();
	const json = parseJson(text);
	const usage = json?.usage;

	console.log("\n[non-stream]");
	console.log(`status: ${res.status}`);
	console.log(`usage: ${summarizeUsage(usage)}`);
	if (!json) {
		console.log(`body (first 500 chars): ${text.slice(0, 500)}`);
	}
}

async function runStream(baseUrl: string, apiKey: string, model: string) {
	const body = {
		model,
		messages: [{ role: "user", content: "Reply with exactly: hi" }],
		stream: true,
		stream_options: { include_usage: true },
	};

	const res = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	console.log("\n[stream]");
	console.log(`status: ${res.status}`);

	if (!res.body) {
		console.log("stream body missing");
		return;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let usage: unknown;

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const frames = buffer.split("\n\n");
		buffer = frames.pop() ?? "";

		for (const frame of frames) {
			const lines = frame.split("\n");
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith("data:")) continue;
				const data = trimmed.slice(5).trim();
				if (!data || data === "[DONE]") continue;
				const payload = parseJson(data);
				if (payload?.usage) {
					usage = payload.usage;
				}
			}
		}
	}

	console.log(`usage: ${summarizeUsage(usage)}`);
}

async function main() {
	const thisFile = fileURLToPath(import.meta.url);
	const apiRoot = path.resolve(path.dirname(thisFile), "..");
	loadLocalEnv(apiRoot);

	const apiKey =
		trimQuotes(process.env.VERCEL_API_KEY) ||
		trimQuotes(process.env.AI_GATEWAY_API_KEY) ||
		trimQuotes(process.env.GATEWAY_API_KEY);
	if (!apiKey) {
		console.error("Missing API key. Set VERCEL_API_KEY (or AI_GATEWAY_API_KEY/GATEWAY_API_KEY for gateway testing).");
		process.exitCode = 1;
		return;
	}

	const baseUrl = trimQuotes(process.env.V0_BASE_URL) || "https://api.v0.dev/v1";
	const model = trimQuotes(process.env.V0_MODEL) || "v0-1.5-md";

	console.log("[vercel-v0-usage-smoke]");
	console.log(`baseUrl: ${baseUrl}`);
	console.log(`model: ${model}`);

	await runNonStream(baseUrl, apiKey, model);
	await runStream(baseUrl, apiKey, model);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});

