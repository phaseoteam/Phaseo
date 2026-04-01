#!/usr/bin/env tsx

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

type TestStatus = "passed" | "failed";

interface TestResult {
	name: string;
	status: TestStatus;
	message: string;
}

interface OAuthTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
	scope?: string;
}

interface RunnerConfig {
	apiBaseUrl: string;
	authStartUrl: string;
	exchangeUrl: string;
	tokenUrl?: string;
	clientId?: string;
	clientSecret?: string;
	redirectUri: string;
	scope: string;
	testModel: string;
	testPrompt: string;
	timeoutMs: number;
	headless: boolean;
}

type CallbackOutcome =
	| { ok: true; code: string; state: string }
	| { ok: false; error: string; errorDescription?: string; state?: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function loadEnvFile(filePath: string): void {
	if (!existsSync(filePath)) return;
	const content = readFileSync(filePath, "utf8");
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex <= 0) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		if (!key || process.env[key]) continue;
		const rawValue = trimmed.slice(eqIndex + 1);
		process.env[key] = stripQuotes(rawValue);
	}
}

function truthy(value: string | undefined): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.floor(parsed);
}

function normalizeSupabaseBase(url: string): string {
	const trimmed = url.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/auth/v1")) {
		return trimmed.slice(0, -"/auth/v1".length);
	}
	return trimmed;
}

function base64Url(input: Buffer): string {
	return input
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function sha256Base64Url(input: string): string {
	return base64Url(createHash("sha256").update(input).digest());
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function postJson(
	url: string,
	body: unknown,
	headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(headers ?? {}),
		},
		body: JSON.stringify(body),
	});
	const text = await response.text();
	return { ok: response.ok, status: response.status, data: safeJsonParse(text) };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
		const decoded = Buffer.from(padded, "base64").toString("utf8");
		const parsed = JSON.parse(decoded);
		if (!parsed || typeof parsed !== "object") return null;
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}

function buildConfig(): RunnerConfig {
	const apiBaseUrl = process.env.API_BASE_URL?.trim() || "";
	const redirectUri =
		process.env.OAUTH_REDIRECT_URI?.trim() || "http://127.0.0.1:8788/callback";
	const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
	const clientId = process.env.OAUTH_CLIENT_ID?.trim() || "";
	const clientSecret = process.env.OAUTH_CLIENT_SECRET?.trim() || "";

	if (!apiBaseUrl) {
		throw new Error("Missing required env var: API_BASE_URL");
	}

	const normalizedApiBase = apiBaseUrl.replace(/\/+$/, "");
	const authStartUrl =
		process.env.OAUTH_AUTH_START_URL?.trim() || `${normalizedApiBase}/auth`;
	const exchangeUrl =
		process.env.OAUTH_EXCHANGE_URL?.trim() || `${normalizedApiBase}/auth/exchange`;
	const tokenUrlOverride = process.env.OAUTH_TOKEN_URL?.trim() || "";
	const tokenUrl =
		tokenUrlOverride ||
		(supabaseUrl
			? `${normalizeSupabaseBase(supabaseUrl)}/auth/v1/oauth/token`
			: undefined);

	return {
		apiBaseUrl: normalizedApiBase,
		authStartUrl,
		exchangeUrl,
		tokenUrl,
		clientId: clientId || undefined,
		clientSecret: clientSecret || undefined,
		redirectUri,
		scope: process.env.OAUTH_SCOPE?.trim() || "openid email profile gateway:access",
		testModel: process.env.OAUTH_TEST_MODEL?.trim() || "openai/gpt-5.4-nano",
		testPrompt: process.env.OAUTH_TEST_PROMPT?.trim() || "hi",
		timeoutMs: parsePositiveInt(process.env.OAUTH_FLOW_TIMEOUT_MS, 10 * 60 * 1000),
		headless: truthy(process.env.OAUTH_HEADLESS),
	};
}

function summarizeResult(results: TestResult[]): string {
	const passed = results.filter((r) => r.status === "passed").length;
	const failed = results.length - passed;
	return `${passed} passed / ${failed} failed`;
}

function nowIso(): string {
	return new Date().toISOString();
}

function safeConfigForReport(config: RunnerConfig): Record<string, unknown> {
	return {
		api_base_url: config.apiBaseUrl,
		auth_start_url: config.authStartUrl,
		exchange_url: config.exchangeUrl,
		token_url: config.tokenUrl ?? null,
		redirect_uri: config.redirectUri,
		client_id: config.clientId ?? null,
		client_secret_configured: Boolean(config.clientSecret),
		scope: config.scope,
		test_model: config.testModel,
		test_prompt: config.testPrompt,
		timeout_ms: config.timeoutMs,
		headless: config.headless,
	};
}

function buildAuthorizeUrl(config: RunnerConfig, state: string, codeChallenge: string): string {
	const url = new URL(config.authStartUrl);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("callback_url", config.redirectUri);
	url.searchParams.set("scope", config.scope);
	url.searchParams.set("state", state);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	if (config.clientId) {
		url.searchParams.set("client_id", config.clientId);
	}
	return url.toString();
}

function createCallbackServer(args: {
	redirectUri: string;
	expectedState: string;
}): {
	start: () => Promise<void>;
	waitForCallback: Promise<CallbackOutcome>;
	close: () => Promise<void>;
	startUrl: string;
} {
	const redirect = new URL(args.redirectUri);
	const host = redirect.hostname;
	const port = redirect.port ? Number(redirect.port) : 80;
	const callbackPath = redirect.pathname || "/";
	const startOrigin = `${redirect.protocol}//${redirect.host}`;
	const startUrl = `${startOrigin}/start`;

	let settled = false;
	let resolveCallback: (value: CallbackOutcome) => void = () => {};
	const waitForCallback = new Promise<CallbackOutcome>((resolve) => {
		resolveCallback = resolve;
	});

	function finish(value: CallbackOutcome): void {
		if (settled) return;
		settled = true;
		resolveCallback(value);
	}

	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		const requestUrl = new URL(req.url || "/", args.redirectUri);
		if (requestUrl.pathname === "/") {
			res.statusCode = 200;
			res.setHeader("content-type", "text/html; charset=utf-8");
			res.end(
				`<!doctype html><html><body style="font-family:sans-serif;padding:24px"><h1>OAuth Playwright E2E</h1><p>Open <a href="/start">/start</a> to begin.</p></body></html>`,
			);
			return;
		}
		if (requestUrl.pathname === "/start") {
			res.statusCode = 200;
			res.setHeader("content-type", "text/plain; charset=utf-8");
			res.end("Start endpoint is handled by Playwright navigation.");
			return;
		}
		if (requestUrl.pathname !== callbackPath) {
			res.statusCode = 404;
			res.end("Not found");
			return;
		}

		const error = requestUrl.searchParams.get("error") || undefined;
		const errorDescription =
			requestUrl.searchParams.get("error_description") || undefined;
		const state = requestUrl.searchParams.get("state") || undefined;
		const code = requestUrl.searchParams.get("code") || undefined;

		if (error) {
			finish({ ok: false, error, errorDescription, state });
		} else if (!code) {
			finish({
				ok: false,
				error: "missing_authorization_code",
				errorDescription: "Missing code query param in callback",
				state,
			});
		} else if (state !== args.expectedState) {
			finish({
				ok: false,
				error: "state_mismatch",
				errorDescription: `Expected ${args.expectedState}, got ${state ?? "<none>"}`,
				state,
			});
		} else {
			finish({ ok: true, code, state });
		}

		res.statusCode = 200;
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end(
			`<!doctype html><html><body style="font-family:sans-serif;padding:24px"><h1>Callback captured</h1><p>You can return to terminal now.</p></body></html>`,
		);
	});

	return {
		startUrl,
		start: async () =>
			new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.listen(port, host, () => {
					server.off("error", reject);
					resolve();
				});
			}),
		waitForCallback,
		close: async () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
			}),
	};
}

function writeReport(payload: unknown): string {
	const reportDir = resolve(__dirname, "../../../internal/oauth-e2e-mini/reports");
	mkdirSync(reportDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const reportPath = resolve(reportDir, `oauth-e2e-playwright-${stamp}.json`);
	writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8");
	return reportPath;
}

function usage(): void {
	console.log("Usage:");
	console.log("  pnpm --filter @ai-stats/web tsx scripts/oauth-e2e-playwright.ts");
	console.log("");
	console.log("Required:");
	console.log("  API_BASE_URL");
	console.log("");
	console.log("Recommended:");
	console.log("  OAUTH_CLIENT_ID");
	console.log("  OAUTH_CLIENT_SECRET (if your app requires confidential exchange)");
	console.log("  OAUTH_REDIRECT_URI (default http://127.0.0.1:8788/callback)");
	console.log("");
	console.log("Optional:");
	console.log("  OAUTH_SCOPE (default openid email profile gateway:access)");
	console.log("  OAUTH_AUTH_START_URL (default <API_BASE_URL>/auth)");
	console.log("  OAUTH_EXCHANGE_URL (default <API_BASE_URL>/auth/exchange)");
	console.log("  OAUTH_TEST_MODEL / OAUTH_TEST_PROMPT");
	console.log("  OAUTH_FLOW_TIMEOUT_MS (default 600000)");
	console.log("  OAUTH_HEADLESS=1");
	console.log("  SUPABASE_URL and/or OAUTH_TOKEN_URL for refresh probe");
}

function isHelpRequest(argv: string[]): boolean {
	return argv.includes("--help") || argv.includes("-h");
}

async function main(): Promise<void> {
	loadEnvFile(resolve(__dirname, "../../../internal/oauth-e2e-mini/.env.local"));
	loadEnvFile(resolve(__dirname, "../.env.local"));

	if (isHelpRequest(process.argv.slice(2))) {
		usage();
		return;
	}

	let config: RunnerConfig;
	try {
		config = buildConfig();
	} catch (error) {
		console.error(String(error));
		usage();
		process.exitCode = 1;
		return;
	}

	const redirect = new URL(config.redirectUri);
	if (redirect.protocol !== "http:") {
		console.error("OAUTH_REDIRECT_URI must be http:// for local callback capture.");
		process.exitCode = 1;
		return;
	}

	const state = randomBytes(16).toString("hex");
	const codeVerifier = base64Url(randomBytes(32));
	const codeChallenge = sha256Base64Url(codeVerifier);
	const authorizeUrl = buildAuthorizeUrl(config, state, codeChallenge);
	const callbackServer = createCallbackServer({
		redirectUri: config.redirectUri,
		expectedState: state,
	});

	const results: TestResult[] = [];
	const startedAt = nowIso();
	let browserClosed = false;

	console.log("");
	console.log("OAuth Playwright E2E");
	console.log("--------------------");
	console.log(`Started:      ${startedAt}`);
	console.log(`Auth Start:   ${config.authStartUrl}`);
	console.log(`Exchange URL: ${config.exchangeUrl}`);
	console.log(`Token URL:    ${config.tokenUrl || "(not configured)"}`);
	console.log(`Redirect URI: ${config.redirectUri}`);
	console.log(`Model:        ${config.testModel}`);
	console.log("");

	await callbackServer.start();
	console.log(`Callback server listening on ${config.redirectUri}`);
	console.log(`Start URL: ${callbackServer.startUrl}`);

	const browser = await chromium.launch({ headless: config.headless });
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		await page.goto(authorizeUrl, { waitUntil: "domcontentloaded" });
		results.push({
			name: "Open authorize URL",
			status: "passed",
			message: "Browser opened OAuth authorize page",
		});
	} catch (error: unknown) {
		results.push({
			name: "Open authorize URL",
			status: "failed",
			message: `Failed to open authorize URL: ${String(error)}`,
		});
		const reportPath = writeReport({
			started_at: startedAt,
			finished_at: nowIso(),
			config: safeConfigForReport(config),
			results,
			summary: summarizeResult(results),
		});
		console.log(`Report: ${reportPath}`);
		await browser.close();
		await callbackServer.close();
		process.exitCode = 1;
		return;
	}

	const callbackResult = await Promise.race<CallbackOutcome>([
		callbackServer.waitForCallback,
		new Promise<CallbackOutcome>((resolve) => {
			setTimeout(
				() =>
					resolve({
						ok: false,
						error: "timeout_waiting_for_callback",
						errorDescription: `No callback captured within ${config.timeoutMs}ms`,
					}),
				config.timeoutMs,
			);
		}),
	]);

	if (!callbackResult.ok) {
		results.push({
			name: "Authorization callback",
			status: "failed",
			message: `${callbackResult.error}${callbackResult.errorDescription ? `: ${callbackResult.errorDescription}` : ""}`,
		});
		const reportPath = writeReport({
			started_at: startedAt,
			finished_at: nowIso(),
			config: safeConfigForReport(config),
			results,
			summary: summarizeResult(results),
		});
		console.log("");
		console.log("Run complete:", summarizeResult(results));
		console.log(`Report: ${reportPath}`);
		console.log("");
		await browser.close();
		await callbackServer.close();
		process.exitCode = 1;
		return;
	}

	results.push({
		name: "Authorization callback",
		status: "passed",
		message: "Received authorization code and state matched",
	});

	const exchangePayload: Record<string, unknown> = {
		code: callbackResult.code,
		redirect_uri: config.redirectUri,
		code_verifier: codeVerifier,
		include_tokens: true,
	};
	if (config.clientId) exchangePayload.client_id = config.clientId;
	if (config.clientSecret) exchangePayload.client_secret = config.clientSecret;

	const codeExchange = await postJson(config.exchangeUrl, exchangePayload);
	if (!codeExchange.ok) {
		results.push({
			name: "Code exchange",
			status: "failed",
			message: `HTTP ${codeExchange.status}: ${JSON.stringify(codeExchange.data)}`,
		});
	} else {
		results.push({
			name: "Code exchange",
			status: "passed",
			message: "Code exchanged via /auth/exchange",
		});
	}

	const exchangeData = codeExchange.data as Record<string, unknown>;
	const keyObj =
		exchangeData && typeof exchangeData === "object" && typeof exchangeData.key === "object"
			? (exchangeData.key as Record<string, unknown>)
			: null;
	const mintedKey =
		keyObj && typeof keyObj.plaintext === "string" ? keyObj.plaintext : null;
	const mintedKeyPrefix =
		keyObj && typeof keyObj.prefix === "string" ? keyObj.prefix : null;

	if (!mintedKey) {
		results.push({
			name: "Minted key validation",
			status: "failed",
			message: "Exchange response missing key.plaintext",
		});
	} else {
		results.push({
			name: "Minted key validation",
			status: "passed",
			message: `Minted key received (${mintedKeyPrefix ?? "no-prefix"})`,
		});
	}

	let gatewayResponse: unknown = null;
	if (mintedKey) {
		const gatewayRequest = await postJson(
			`${config.apiBaseUrl}/v1/chat/completions`,
			{
				model: config.testModel,
				messages: [{ role: "user", content: config.testPrompt }],
				max_tokens: 16,
			},
			{
				authorization: `Bearer ${mintedKey}`,
			},
		);
		gatewayResponse = gatewayRequest.data;
		results.push({
			name: "Gateway request (minted key)",
			status: gatewayRequest.ok ? "passed" : "failed",
			message: gatewayRequest.ok
				? "Chat completion succeeded with minted key"
				: `HTTP ${gatewayRequest.status}: ${JSON.stringify(gatewayRequest.data)}`,
		});
	}

	const tokenBundle =
		exchangeData &&
		typeof exchangeData === "object" &&
		exchangeData.tokens &&
		typeof exchangeData.tokens === "object"
			? (exchangeData.tokens as OAuthTokenResponse)
			: undefined;

	const claims =
		tokenBundle?.access_token ? decodeJwtPayload(tokenBundle.access_token) : null;
	if (claims) {
		results.push({
			name: "JWT claims",
			status: "passed",
			message: "Claims present on returned OAuth access token",
		});
	} else {
		results.push({
			name: "JWT claims",
			status: "passed",
			message: "No OAuth token bundle returned; claim check skipped",
		});
	}

	if (tokenBundle?.access_token) {
		const oauthGateway = await postJson(
			`${config.apiBaseUrl}/v1/chat/completions`,
			{
				model: config.testModel,
				messages: [{ role: "user", content: config.testPrompt }],
				max_tokens: 16,
			},
			{
				authorization: `Bearer ${tokenBundle.access_token}`,
			},
		);
		results.push({
			name: "Gateway request (oauth token)",
			status: oauthGateway.ok ? "passed" : "failed",
			message: oauthGateway.ok
				? "Chat completion succeeded with OAuth access token"
				: `HTTP ${oauthGateway.status}: ${JSON.stringify(oauthGateway.data)}`,
		});
	}

	if (config.tokenUrl && tokenBundle?.refresh_token) {
		const refreshPayload: Record<string, unknown> = {
			grant_type: "refresh_token",
			refresh_token: tokenBundle.refresh_token,
		};
		if (config.clientId) refreshPayload.client_id = config.clientId;
		if (config.clientSecret) refreshPayload.client_secret = config.clientSecret;
		const refresh = await postJson(config.tokenUrl, refreshPayload);
		results.push({
			name: "Token refresh",
			status: refresh.ok ? "passed" : "failed",
			message: refresh.ok
				? "Refresh token exchange succeeded"
				: `HTTP ${refresh.status}: ${JSON.stringify(refresh.data)}`,
		});
	} else {
		results.push({
			name: "Token refresh",
			status: "passed",
			message: "Skipped refresh test (token endpoint or refresh token unavailable)",
		});
	}

	const reportPath = writeReport({
		started_at: startedAt,
		finished_at: nowIso(),
		config: safeConfigForReport(config),
		results,
		summary: summarizeResult(results),
		token_claims: claims,
		minted_key_prefix: mintedKeyPrefix,
		last_request: gatewayResponse,
	});

	console.log("");
	console.log("Run complete:", summarizeResult(results));
	for (const result of results) {
		console.log(`- [${result.status.toUpperCase()}] ${result.name}: ${result.message}`);
	}
	console.log(`Report: ${reportPath}`);
	console.log("");

	await context.close();
	await browser.close();
	browserClosed = true;
	await callbackServer.close();

	if (results.some((r) => r.status === "failed")) {
		process.exitCode = 1;
	}

	if (!config.headless) {
		console.log("Tip: set OAUTH_HEADLESS=1 for CI/non-interactive runs.");
	}

	if (!browserClosed) {
		await browser.close();
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exitCode = 1;
});
