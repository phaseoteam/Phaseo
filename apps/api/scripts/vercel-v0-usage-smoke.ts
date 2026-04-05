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

function parseBillingBalance(payload: JsonRecord | null): number | null {
	const data = payload?.data;
	if (!data || typeof data !== "object") return null;
	const balance = (data as JsonRecord).balance;
	if (!balance || typeof balance !== "object") return null;
	const remaining = (balance as JsonRecord).remaining;
	return typeof remaining === "number" ? remaining : null;
}

async function getBilling(baseUrl: string, apiKey: string): Promise<{ status: number; balanceRemaining: number | null }> {
	const res = await fetch(`${baseUrl}/v1/user/billing`, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	const text = await res.text();
	const json = parseJson(text);
	return {
		status: res.status,
		balanceRemaining: parseBillingBalance(json),
	};
}

async function runSyncChat(baseUrl: string, apiKey: string, modelId: string | null) {
	const body: JsonRecord = {
		message: "Reply with exactly hi",
		modelConfiguration: {
			responseMode: "sync",
			...(modelId ? { modelId } : {}),
		},
	};
	const createRes = await fetch(`${baseUrl}/v1/chats`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const createText = await createRes.text();
	const createJson = parseJson(createText);

	console.log("\n[platform chat create sync]");
	console.log(`status: ${createRes.status}`);
	console.log(`usage on create payload: ${summarizeUsage(createJson?.usage)}`);

	const chatId = typeof createJson?.id === "string" ? createJson.id : null;
	const messages = Array.isArray(createJson?.messages) ? (createJson.messages as JsonRecord[]) : [];
	const assistantMessage = messages.find((m) => m.role === "assistant");
	const assistantMessageId = typeof assistantMessage?.id === "string" ? assistantMessage.id : null;

	if (!chatId) {
		console.log(`create body (first 600 chars): ${createText.slice(0, 600)}`);
		return;
	}

	const chatRes = await fetch(`${baseUrl}/v1/chats/${chatId}`, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	const chatText = await chatRes.text();
	const chatJson = parseJson(chatText);
	console.log(`chat.get status: ${chatRes.status}`);
	console.log(`usage on chat.get payload: ${summarizeUsage(chatJson?.usage)}`);

	if (assistantMessageId) {
		const msgRes = await fetch(`${baseUrl}/v1/chats/${chatId}/messages/${assistantMessageId}`, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		const msgText = await msgRes.text();
		const msgJson = parseJson(msgText);
		console.log(`message.get status: ${msgRes.status}`);
		console.log(`usage on message.get payload: ${summarizeUsage(msgJson?.usage)}`);
		if (!msgJson) {
			console.log(`message.get body (first 600 chars): ${msgText.slice(0, 600)}`);
		}
	}

	const assistantContent =
		typeof assistantMessage?.content === "string"
			? assistantMessage.content
			: typeof createJson?.text === "string"
				? createJson.text
				: "";
	console.log(`assistant text: ${assistantContent.slice(0, 120)}`);
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
		console.error("Missing API key. Set VERCEL_API_KEY (or AI_GATEWAY_API_KEY/GATEWAY_API_KEY).");
		process.exitCode = 1;
		return;
	}

	const baseUrl = trimQuotes(process.env.V0_BASE_URL) || "https://api.v0.dev";
	const modelId = trimQuotes(process.env.V0_MODEL_ID) || "";

	console.log("[vercel-v0-usage-smoke]");
	console.log(`baseUrl: ${baseUrl}`);
	console.log(`modelId: ${modelId || "(default)"}`);

	const before = await getBilling(baseUrl, apiKey);
	console.log(`billing before: status=${before.status}, remaining=${before.balanceRemaining ?? "n/a"}`);

	await runSyncChat(baseUrl, apiKey, modelId || null);

	const after = await getBilling(baseUrl, apiKey);
	console.log(`billing after: status=${after.status}, remaining=${after.balanceRemaining ?? "n/a"}`);

	if (before.balanceRemaining !== null && after.balanceRemaining !== null) {
		const delta = before.balanceRemaining - after.balanceRemaining;
		console.log(`billing remaining delta: ${delta.toFixed(8)}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
