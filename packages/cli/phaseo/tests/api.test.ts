import test from "node:test";
import assert from "node:assert/strict";
import {
	authorizeUrl,
	DEFAULT_API_URL,
	DEFAULT_LOGIN_SCOPES,
	normalizeApiRoot,
	oauthUrl,
	parseScopeArgument,
	exchangeAuthorizationCode,
	revokeRefreshToken,
	v1Url,
} from "../src/api.ts";
import {
	buildLogsListPath,
	buildModelsListPath,
	callbackListenHost,
	helpKeyForCommand,
	parseArgs,
	renderVersionText,
	inspectCallbackRequest,
	nextLoginMenuIndex,
	prefersDeviceCodeByEnvironment,
	renderLoginBanner,
	renderLoginMenu,
	renderHelp,
	renderOneTimeClientSecret,
	windowsBrowserOpenArgs,
	validateLoopbackRedirectUri,
} from "../src/index.ts";
import {
	compareVersions,
	detectPackageManager,
	installCommandFor,
	updateCommandFor,
} from "../src/release.ts";
import { sanitizeTerminalText } from "../src/output.ts";

test("normalizes API roots for oauth and v1 endpoints", () => {
	assert.equal(DEFAULT_API_URL, "https://api.phaseo.app");
	assert.equal(normalizeApiRoot("https://api.example.com/v1/"), "https://api.example.com");
	assert.equal(normalizeApiRoot("http://127.0.0.1:8788/v1"), "http://127.0.0.1:8788");
	assert.equal(normalizeApiRoot("http://[::1]:8788/v1"), "http://[::1]:8788");
	assert.throws(() => normalizeApiRoot("http://api.example.com"), /must use HTTPS/);
	assert.throws(() => normalizeApiRoot("file:///tmp/phaseo"), /must use HTTPS/);
	assert.equal(oauthUrl("https://api.example.com", "/token"), "https://api.example.com/oauth/token");
	assert.equal(v1Url("https://api.example.com", "/me"), "https://api.example.com/v1/me");
});

test("builds browser authorize URLs for PKCE login", () => {
	const url = new URL(authorizeUrl("https://api.example.com", {
		clientId: "phaseo_cli",
		redirectUri: "http://127.0.0.1:8976/callback",
		scope: DEFAULT_LOGIN_SCOPES.join(" "),
		state: "state-123",
		codeChallenge: "challenge-abc",
	}));

	assert.equal(url.origin + url.pathname, "https://api.example.com/oauth/authorize");
	assert.equal(url.searchParams.get("client_id"), "phaseo_cli");
	assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:8976/callback");
	assert.equal(url.searchParams.get("scope"), DEFAULT_LOGIN_SCOPES.join(" "));
	assert.equal(url.searchParams.get("state"), "state-123");
	assert.equal(url.searchParams.get("code_challenge"), "challenge-abc");
	assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("parses explicit login scopes and removes duplicates", () => {
	assert.equal(
		parseScopeArgument("openid, keys:write  keys:write,activity:read"),
		"openid keys:write activity:read",
	);
	assert.equal(parseScopeArgument(undefined), DEFAULT_LOGIN_SCOPES.join(" "));
});

test("posts refresh-token revocation to the OAuth endpoint", async () => {
	const originalFetch = globalThis.fetch;
	let requestUrl = "";
	let requestBody = "";
	globalThis.fetch = (async (input, init) => {
		requestUrl = String(input);
		requestBody = String(init?.body ?? "");
		return new Response(null, { status: 200 });
	}) as typeof fetch;
	try {
		await revokeRefreshToken("https://api.example.com", "refresh-token-123");
	} finally {
		globalThis.fetch = originalFetch;
	}
	assert.equal(requestUrl, "https://api.example.com/oauth/revoke");
	assert.equal(requestBody, JSON.stringify({ token: "refresh-token-123" }));
});

test("surfaces refresh-token revocation failures", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ error_description: "token already revoked" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
	try {
		await assert.rejects(
			() => revokeRefreshToken("https://api.example.com", "refresh-token-123"),
			/token already revoked/,
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("rejects an authorization exchange that is not a refreshable CLI session", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({
			access_token: "phaseo_v1_sk_test",
			refresh_token: "refresh-token",
			expires_in: "900",
			token_type: "Bearer",
		}), {
			status: 200,
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
	try {
		await assert.rejects(
			() => exchangeAuthorizationCode("https://api.example.com", {
				code: "code",
				redirectUri: "http://127.0.0.1:8976/callback",
				codeVerifier: "verifier",
			}),
			/not return a refreshable CLI session/,
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("passes Windows browser-launch URLs without a command interpreter", () => {
	const fullUrl = "http://127.0.0.1:8788/oauth/authorize?response_type=code&client_id=phaseo_cli&redirect_uri=http%3A%2F%2F127.0.0.1%3A8976%2Fcallback";
	assert.deepEqual(windowsBrowserOpenArgs(fullUrl), [
		"url.dll,FileProtocolHandler",
		fullUrl,
	]);
});

test("prefers device code in SSH and CI environments", () => {
	assert.equal(prefersDeviceCodeByEnvironment({ SSH_CONNECTION: "1" } as NodeJS.ProcessEnv), true);
	assert.equal(prefersDeviceCodeByEnvironment({ CI: "true" } as NodeJS.ProcessEnv), true);
	assert.equal(prefersDeviceCodeByEnvironment({} as NodeJS.ProcessEnv), false);
});

test("renders a branded login banner", () => {
	const banner = renderLoginBanner();
	assert.match(banner, /_____  _/);
	assert.match(banner, /Phaseo CLI/);
	assert.match(banner, /Workspace control, keys, and routing tools/);
});

test("renders login menu with the selected default option", () => {
	const menu = renderLoginMenu(0, "browser");
	assert.match(menu, /> Sign in with Phaseo \[default\]/);
	assert.match(menu, /Sign in with Device Code/);
});

test("moves the login menu selection with arrow-key input", () => {
	assert.equal(nextLoginMenuIndex(0, "\u001b[B", 2), 1);
	assert.equal(nextLoginMenuIndex(1, "\u001b[A", 2), 0);
	assert.equal(nextLoginMenuIndex(0, "\u001b[A", 2), 0);
	assert.equal(nextLoginMenuIndex(1, "\u001b[B", 2), 1);
});

test("ignores callback hits until an authorization code is present", () => {
	const pendingUrl = new URL("http://127.0.0.1:8976/callback");
	assert.deepEqual(inspectCallbackRequest(pendingUrl, "state-123"), {
		ok: false,
		pending: true,
	});

	const successUrl = new URL("http://127.0.0.1:8976/callback?code=abc123&state=state-123");
	assert.deepEqual(inspectCallbackRequest(successUrl, "state-123"), {
		ok: true,
		code: "abc123",
		state: "state-123",
	});

	const unrelatedError = new URL("http://127.0.0.1:8976/callback?error=access_denied&state=wrong");
	assert.deepEqual(inspectCallbackRequest(unrelatedError, "state-123"), {
		ok: false,
		pending: true,
	});
	const unrelatedCode = new URL("http://127.0.0.1:8976/callback?code=forged&state=wrong");
	assert.deepEqual(inspectCallbackRequest(unrelatedCode, "state-123"), {
		ok: false,
		pending: true,
	});
});

test("removes terminal control characters from human-readable errors", () => {
	assert.equal(sanitizeTerminalText("bad\u001b[31mname\u0007"), "bad [31mname ");
	assert.equal(sanitizeTerminalText("first\n\tsecond\r\nthird"), "first\n\tsecond\r\nthird");
});

test("only accepts loopback browser callback URLs", () => {
	assert.equal(
		validateLoopbackRedirectUri("http://127.0.0.1:8976/callback"),
		"http://127.0.0.1:8976/callback",
	);
	assert.equal(
		validateLoopbackRedirectUri("http://[::1]:8976/callback"),
		"http://[::1]:8976/callback",
	);
	assert.throws(() => validateLoopbackRedirectUri("https://example.com/callback"), /HTTP loopback/);
	assert.throws(() => validateLoopbackRedirectUri("http://0.0.0.0:8976/callback"), /HTTP loopback/);
	assert.throws(() => validateLoopbackRedirectUri("http://127.0.0.1:8976/callback?next=evil"), /HTTP loopback/);
});

test("normalizes a bracketed IPv6 loopback callback host for Node", () => {
	assert.equal(callbackListenHost("http://[::1]:8976/callback"), "::1");
	assert.equal(callbackListenHost("http://127.0.0.1:8976/callback"), "127.0.0.1");
});

test("resolves help text for command groups and leaf commands", () => {
	assert.equal(helpKeyForCommand(["keys"]), "keys");
	assert.equal(helpKeyForCommand(["keys", "create"]), "keys create");
	assert.match(renderHelp(["keys", "create"]), /phaseo keys create --name <name>/);
	assert.match(renderHelp(["pricing"]), /phaseo pricing calculate --provider <provider>/);
	assert.match(renderHelp(["login"]), /--scopes <csv>/);
	assert.equal(helpKeyForCommand(["logs", "list"]), "logs list");
	assert.match(renderHelp(["logs", "list"]), /--status <success\|error\|2xx\|4xx\|5xx\|code>/);
	assert.match(renderHelp(["oauth-clients", "create"]), /--show-secret/);
	assert.match(renderHelp(["oauth-clients", "regenerate-secret"]), /--show-secret/);
});

test("builds logs list filters for the API", () => {
	assert.equal(
		buildLogsListPath({
			since: "2h",
			status: "5xx",
			provider: "openai",
			model: "gpt-5-mini",
			endpoint: "/responses",
			"request-id": "req_1",
			"key-id": "key_1",
			"session-id": "session_1",
			"error-code": "upstream_error",
			limit: "25",
			offset: "5",
		}),
		"/logs?since=2h&status=5xx&provider=openai&model=gpt-5-mini&endpoint=%2Fresponses&request_id=req_1&key_id=key_1&session_id=session_1&error_code=upstream_error&limit=25&offset=5",
	);
});

test("hides one-time OAuth client secrets unless explicitly requested", () => {
	const secret = "oauth-secret-value";
	const hidden = renderOneTimeClientSecret(secret, false);
	assert.doesNotMatch(hidden, new RegExp(secret));
	assert.match(hidden, /Client secret hidden/);
	assert.equal(renderOneTimeClientSecret(secret, true), `Client secret: ${secret}\n`);
});

test("builds model catalogue paths for the public v1 routes", () => {
	assert.equal(buildModelsListPath({ limit: "3", offset: "1" }), "/models?limit=3&offset=1");
	assert.equal(buildModelsListPath({ mine: true, all: true }), "/models/me?availability=all");
});

test("treats short and long root flags as flags instead of commands", () => {
	assert.deepEqual(parseArgs(["--version"]), {
		command: [],
		flags: { version: true },
	});
	assert.deepEqual(parseArgs(["-v"]), {
		command: [],
		flags: { version: true },
	});
	assert.deepEqual(parseArgs(["-h"]), {
		command: [],
		flags: { help: true },
	});
});

test("detects preferred package managers and emits install/update commands", () => {
	assert.equal(detectPackageManager({ npm_config_user_agent: "pnpm/10.33.0 node/v24" } as NodeJS.ProcessEnv), "pnpm");
	assert.equal(detectPackageManager({ npm_config_user_agent: "yarn/1.22.22 npm/? node/v24" } as NodeJS.ProcessEnv), "yarn");
	assert.equal(detectPackageManager({ npm_config_user_agent: "bun/1.2.0 npm/? node/v24" } as NodeJS.ProcessEnv), "bun");
	assert.equal(detectPackageManager({} as NodeJS.ProcessEnv), "npm");
	assert.equal(installCommandFor("pnpm"), "pnpm add -g @phaseo/cli");
	assert.equal(updateCommandFor("npm"), "npm install -g @phaseo/cli@latest");
});

test("compares semantic versions and renders version details", () => {
	assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
	assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
	assert.equal(compareVersions("0.1.0", "0.2.0"), -1);
	const text = renderVersionText({
		version: "0.1.0",
		packageManager: "pnpm",
		installCommand: "pnpm add -g @phaseo/cli",
		updateCommand: "pnpm add -g @phaseo/cli@latest",
		latestVersion: "0.2.0",
		updateAvailable: true,
	});
	assert.match(text, /Phaseo CLI 0.1.0/);
	assert.match(text, /pnpm add -g @phaseo\/cli@latest/);
	assert.match(text, /update available/);
});
