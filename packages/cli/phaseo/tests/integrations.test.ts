import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { parse as parseJsonc } from "jsonc-parser";
import { codexAdapter, renderCodexProfile } from "../src/integrations/adapters/codex.js";
import { claudeCodeAdapter, renderClaudeSettings } from "../src/integrations/adapters/claude-code.js";
import { deepSeekHarnessAdapter, renderDeepSeekHarnessCredential, renderDeepSeekHarnessPatch } from "../src/integrations/adapters/deepseek-harness.js";
import { openCodeAdapter, renderOpenCodeAuth, renderOpenCodeConfig } from "../src/integrations/adapters/opencode.js";
import { piAdapter, renderPiExtension } from "../src/integrations/adapters/pi.js";
import { primeAgentAdapter, renderPrimeAgentModels } from "../src/integrations/adapters/prime-agent.js";
import { openClawModels, renderOpenClawProvider } from "../src/integrations/adapters/openclaw.js";
import { aiderAdapter } from "../src/integrations/adapters/aider.js";
import { continueAdapter } from "../src/integrations/adapters/continue.js";
import { zedAdapter } from "../src/integrations/adapters/zed.js";
import { applyChanges } from "../src/integrations/files.js";
import { isIntegrationSetupName, isPrimarySetupName, runIntegrationCommand } from "../src/integrations/index.js";
import { INTEGRATION_KEY_LIFETIME_MS, INTEGRATION_KEY_MONTHLY_LIMIT_USD, getIntegrationGatewayCredential, getLegacyIntegrationGatewayCredential, hasIntegrationGatewayCredential, integrationCredentialsForNewLogin, revokeIntegrationGatewayCredential } from "../src/integrations/credential.js";
import { HERMES_BLOCK_END, HERMES_BLOCK_START, HermesEnvQuotingError, assertHermesEnvEditable, firstUnsupportedHermesEnvLine, hermesEnvDefinesOpenAIKey, hermesEnvPath, removeHermesKey, renderHermesEnv, renderHermesEnvWithoutKey, resolveHermesHome, writeHermesKey } from "../src/integrations/adapters/hermes.js";
import { readSession, writeSession } from "../src/session.js";
import { fetchIntegrationModels, toIntegrationModel } from "../src/integrations/catalog.js";
import { acceptsInstallConfirmation, confirmHarnessInstall, findPackageManagerExecutable, installInvocationFor, packageManagerCandidates, packageManagerChildEnv, packageManagerChildInvocation, renderInstallInvocation } from "../src/integrations/installer.js";
import { updateChildInvocation } from "../src/index.js";

test("Codex profile uses the Responses API without embedding a credential", () => {
	const profile = renderCodexProfile("anthropic/claude-sonnet-4.6");
	assert.match(profile, /wire_api = "responses"/);
	assert.match(profile, /\[model_providers\.phaseo\.auth\]/);
	assert.match(profile, /command = "phaseo"/);
	assert.match(profile, /model = "anthropic\/claude-sonnet-4.6"/);
	assert.doesNotMatch(profile, /phaseo_v1_sk_/);
	assert.doesNotMatch(profile, /env_key/);
});

test("Pi extension registers Phaseo with a command-backed credential", async () => {
	const extension = renderPiExtension("anthropic/claude-sonnet-4.6", [
		{ id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", contextWindow: 200_000, maxOutputTokens: 64_000, reasoning: true, input: ["text", "image"] },
		{ id: "openai/gpt-test", name: "GPT Test", reasoning: false, input: ["text"] },
	]);
	assert.match(extension, /pi\.registerProvider\("phaseo"/);
	assert.match(extension, /!phaseo integrations credential pi/);
	assert.match(extension, /"openai\/gpt-test"/);
	assert.doesNotMatch(extension, /phaseo_v1_sk_/);

	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-pi-integration-"));
	try {
		await applyChanges(await piAdapter.planSetup({ homeDir, model: "openai/gpt-5.6-terra" }));
		assert.equal((await piAdapter.inspect({ homeDir })).status, "configured");
		await assert.doesNotReject(piAdapter.planSetup({ homeDir, model: "openai/gpt-5.6-terra", models: [
			{ id: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra" },
			{ id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
		] }));
		await applyChanges(await piAdapter.planRemove({ homeDir }));
		assert.notEqual((await piAdapter.inspect({ homeDir })).status, "configured");
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("Prime Agent configuration preserves other providers and exposes every model", async () => {
	const path = "/tmp/models.json";
	const before = '{"providers":{"local":{"baseUrl":"http://localhost:11434/v1"}},"keep":true}\n';
	const rendered = renderPrimeAgentModels(path, before, "openai/gpt-test", [
		{ id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", reasoning: true, input: ["text", "image"] },
		{ id: "openai/gpt-test", name: "GPT Test", contextWindow: 128_000, maxOutputTokens: 32_000 },
	]);
	const config = JSON.parse(rendered);
	assert.equal(config.keep, true);
	assert.equal(config.providers.local.baseUrl, "http://localhost:11434/v1");
	assert.equal(config.providers.phaseo.apiKey, "!phaseo integrations credential prime-agent");
	assert.deepEqual(config.providers.phaseo.models.map((model: { id: string }) => model.id), ["openai/gpt-test", "anthropic/claude-sonnet-4.6"]);
	assert.throws(() => renderPrimeAgentModels(path, '{"providers":{"phaseo":{"baseUrl":"https://other.example"}}}\n'), /not managed by Phaseo CLI/);

	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-prime-agent-integration-"));
	try {
		const options = { homeDir, model: "openai/gpt-test" };
		await applyChanges(await primeAgentAdapter.planSetup(options));
		assert.equal((await primeAgentAdapter.inspect(options)).status, "configured");
		await applyChanges(await primeAgentAdapter.planRemove(options));
		assert.deepEqual(JSON.parse(await readFile(join(homeDir, ".prime", "agent", "models.json"), "utf8")), {});
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("OpenClaw provider exposes every catalog model", () => {
	const provider = renderOpenClawProvider([
		{ id: "model/a", name: "Model A", contextWindow: 128000, reasoning: true, input: ["text", "image"] },
		{ id: "model/b", name: "Model B" },
	]);
	assert.deepEqual(provider.models.map((model) => model.id), ["model/a", "model/b"]);
	assert.equal(provider.models[0]?.contextWindow, 128000);
	assert.deepEqual(provider.models[0]?.input, ["text", "image"]);
});

test("OpenClaw preserves an explicitly requested model outside the catalog", () => {
	const models = openClawModels("preview/custom", [{ id: "model/a", name: "Model A" }]);
	assert.deepEqual(models.map((model) => model.id), ["preview/custom", "model/a"]);
});

test("OpenClaw prioritizes an explicitly requested model already in the catalog", () => {
	const models = openClawModels("model/b", [{ id: "model/a" }, { id: "model/b" }]);
	assert.deepEqual(models.map((model) => model.id), ["model/b", "model/a"]);
});

test("Aider and Continue refuse to overwrite existing user configuration", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-safe-config-integration-"));
	try {
		await applyChanges([
			{ path: join(homeDir, ".aider.conf.yml"), before: null, after: "model: existing\n", description: "fixture" },
			{ path: join(homeDir, ".continue", "config.yaml"), before: null, after: "name: Existing\n", description: "fixture" },
		]);
		await assert.rejects(aiderAdapter.planSetup({ homeDir }), /already has/);
		await assert.rejects(continueAdapter.planSetup({ homeDir }), /already has/);
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("Zed setup preserves unrelated JSONC settings", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-zed-integration-"));
	const previousAppData = process.env.APPDATA;
	const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
	process.env.APPDATA = homeDir;
	process.env.XDG_CONFIG_HOME = homeDir;
	try {
		const path = process.platform === "win32"
			? join(homeDir, "Zed", "settings.json")
			: process.platform === "darwin"
				? join(homeDir, "Library", "Application Support", "Zed", "settings.json")
				: join(homeDir, "zed", "settings.json");
		await applyChanges([{ path, before: null, after: '{\n  // Keep me\n  "theme": "One Dark"\n}\n', description: "fixture" }]);
		await applyChanges(await zedAdapter.planSetup({ homeDir, model: "anthropic/claude-sonnet-4.6" }));
		const configured = await readFile(path, "utf8");
		assert.match(configured, /Keep me/);
		assert.match(configured, /"phaseo"/);
		await applyChanges(await zedAdapter.planRemove({ homeDir }));
		assert.doesNotMatch(await readFile(path, "utf8"), /"phaseo"/);
	} finally {
		if (previousAppData === undefined) delete process.env.APPDATA;
		else process.env.APPDATA = previousAppData;
		if (previousXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("Claude Code settings preserve unrelated values", () => {
	const rendered = renderClaudeSettings("/tmp/settings.json", JSON.stringify({
		permissions: { allow: ["Read"] },
		env: { KEEP_ME: "yes" },
	}));
	const settings = JSON.parse(rendered);
	assert.deepEqual(settings.permissions, { allow: ["Read"] });
	assert.equal(settings.env.KEEP_ME, "yes");
	assert.equal(settings.env.ANTHROPIC_BASE_URL, "https://api.phaseo.app");
	assert.equal(settings.env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS, "300000");
	assert.equal(settings.env.ANTHROPIC_API_KEY, "");
	assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, "");
	assert.equal(settings.apiKeyHelper, "phaseo integrations credential claude-code");
});

test("Claude Code rejects malformed configuration", () => {
	assert.throws(() => renderClaudeSettings("/tmp/settings.json", "{broken"), /Cannot update malformed/);
});

test("Claude Code refuses to replace another gateway or credential helper", () => {
	assert.throws(
		() => renderClaudeSettings("/tmp/settings.json", JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://other.example" } })),
		/different ANTHROPIC_BASE_URL/,
	);
	assert.throws(
		() => renderClaudeSettings("/tmp/settings.json", JSON.stringify({ apiKeyHelper: "other-helper" })),
		/different apiKeyHelper/,
	);
	assert.throws(
		() => renderClaudeSettings("/tmp/settings.json", JSON.stringify({ env: { ANTHROPIC_API_KEY: "existing" } })),
		/already define ANTHROPIC_API_KEY/,
	);
});

test("OpenCode configuration preserves comments and unrelated providers", () => {
	const before = `{
	// Keep this user setting.
	"theme": "system",
	"provider": {
		"local": {
			"npm": "@ai-sdk/openai-compatible",
			"options": { "baseURL": "http://127.0.0.1:1234/v1" },
		},
	},
}
`;
	const rendered = renderOpenCodeConfig("/tmp/opencode.jsonc", before, "openai/gpt-5.6-terra");
	const config = parseJsonc(rendered) as {
		theme: string;
		provider: Record<string, {
			npm: string;
			options: Record<string, string>;
			models: Record<string, unknown>;
		}>;
	};
	assert.match(rendered, /Keep this user setting/);
	assert.equal(config.theme, "system");
	assert.equal(config.provider.local.options.baseURL, "http://127.0.0.1:1234/v1");
	assert.equal(config.provider.phaseo.npm, "@ai-sdk/openai-compatible");
	assert.equal(config.provider.phaseo.options.baseURL, "https://api.phaseo.app/v1");
	assert.equal(config.provider.phaseo.options.apiKey, undefined);
	assert.deepEqual(config.provider.phaseo.models["openai/gpt-5.6-terra"], { name: "openai/gpt-5.6-terra" });
	assert.doesNotMatch(rendered, /phaseo_v1_sk_/);
});

test("OpenCode receives every catalog model with token limits", () => {
	const rendered = renderOpenCodeConfig("/tmp/opencode.json", null, "openai/gpt-5.6-terra", [
		{ id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", contextWindow: 200_000, maxOutputTokens: 64_000 },
		{ id: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra", contextWindow: 400_000 },
	]);
	const config = JSON.parse(rendered);
	assert.deepEqual(Object.keys(config.provider.phaseo.models), ["openai/gpt-5.6-terra", "anthropic/claude-sonnet-4.6"]);
	assert.deepEqual(config.provider.phaseo.models["anthropic/claude-sonnet-4.6"].limit, { context: 200_000, output: 64_000 });
});

test("OpenCode credential setup preserves other providers and marks Phaseo ownership", () => {
	const rendered = renderOpenCodeAuth("/tmp/auth.json", '{"other":{"type":"api","key":"keep"}}\n', "phaseo-secret");
	const auth = JSON.parse(rendered);
	assert.deepEqual(auth.other, { type: "api", key: "keep" });
	assert.deepEqual(auth.phaseo, { type: "api", key: "phaseo-secret", metadata: { managedBy: "phaseo-cli" } });
	assert.throws(() => renderOpenCodeAuth("/tmp/auth.json", '{"phaseo":{"type":"api","key":"user"}}\n', "phaseo-secret"), /unmanaged phaseo credential/);
});

test("OpenCode rejects conflicting providers and provider allowlists", () => {
	assert.throws(
		() => renderOpenCodeConfig("/tmp/opencode.json", JSON.stringify({ provider: { phaseo: { npm: "other" } } })),
		/not managed by Phaseo CLI/,
	);
	assert.throws(
		() => renderOpenCodeConfig("/tmp/opencode.json", JSON.stringify({ disabled_providers: ["phaseo"] })),
		/remove it from disabled_providers/,
	);
	assert.throws(
		() => renderOpenCodeConfig("/tmp/opencode.json", JSON.stringify({ enabled_providers: ["openai"] })),
		/add phaseo to that list/,
	);
});

test("OpenCode requires credential-store ownership before updating an existing provider", () => {
	const existing = renderOpenCodeConfig("/tmp/opencode.json", null);
	assert.throws(() => renderOpenCodeConfig("/tmp/opencode.json", existing), /not managed by Phaseo CLI/);
	assert.doesNotThrow(() => renderOpenCodeConfig("/tmp/opencode.json", existing, undefined, undefined, true));
});

test("OpenCode migrates its legacy environment-backed provider", () => {
	const legacy = JSON.stringify({ provider: { phaseo: {
		npm: "@ai-sdk/openai-compatible", name: "Phaseo",
		options: { baseURL: "https://api.phaseo.app/v1", apiKey: "{env:PHASEO_API_KEY}" },
		models: { "model/a": { name: "Model A" } },
	} } });
	assert.doesNotThrow(() => renderOpenCodeConfig("/tmp/opencode.json", legacy));
});

test("DeepSeek Harness configuration preserves unrelated patches", () => {
	const before = `- id: unrelated\n  config:\n    enabled: true\n`;
	const rendered = renderDeepSeekHarnessPatch("/tmp/cordis.patch.yml", before, "anthropic/claude-sonnet-4.6");
	assert.match(rendered, /id: unrelated/);
	assert.match(rendered, /baseURL: https:\/\/api\.phaseo\.app\/v1/);
	assert.match(rendered, /api: openai-completions/);
	assert.match(rendered, /apiKeyEnv: PHASEO_API_KEY/);
	assert.match(rendered, /model: "anthropic\/claude-sonnet-4\.6"/);
	assert.doesNotMatch(rendered, /phaseo_v1_sk_/);
});

test("DeepSeek Harness receives every catalog model", () => {
	const rendered = renderDeepSeekHarnessPatch("/tmp/cordis.patch.yml", null, "openai/gpt-5.6-terra", [
		{ id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
		{ id: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra" },
	]);
	assert.match(rendered, /- id: "anthropic\/claude-sonnet-4\.6"/);
	assert.match(rendered, /- id: "openai\/gpt-5\.6-terra"/);
	assert.match(rendered, /model: "openai\/gpt-5\.6-terra"/);
});

test("DeepSeek Harness credential setup preserves YAML and refuses unmanaged keys", () => {
	const rendered = renderDeepSeekHarnessCredential("/tmp/.credentials.yaml", "OTHER_KEY: keep\n", "phaseo-secret");
	assert.match(rendered, /OTHER_KEY: keep/);
	assert.match(rendered, /# Managed by Phaseo CLI\nPHASEO_API_KEY: phaseo-secret/);
	assert.throws(
		() => renderDeepSeekHarnessCredential("/tmp/.credentials.yaml", "PHASEO_API_KEY: user-secret\n", "phaseo-secret"),
		/unmanaged PHASEO_API_KEY/,
	);
});

test("catalog filtering keeps only active text chat-completions models", () => {
	assert.deepEqual(toIntegrationModel({
		id: "openai/gpt-test",
		name: "GPT Test",
		lifecycle: { status: "active" },
		modalities: { input: ["text", "image"], output: ["text"] },
		limits: { input_tokens: 128_000, output_tokens: 16_000 },
		capabilities: { endpoints: ["chat.completions", "responses"] },
		availability: { status: "active", active_provider_count: 2 },
	}), { id: "openai/gpt-test", name: "GPT Test", contextWindow: 128_000, maxOutputTokens: 16_000, reasoning: false, input: ["text", "image"] });
	assert.equal(toIntegrationModel({
		id: "openai/inactive",
		modalities: { input: ["text"], output: ["text"] },
		capabilities: { endpoints: ["chat.completions"] },
		availability: { status: "inactive", active_provider_count: 0 },
	}), null);
});

test("catalog sync paginates through every compatible model", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-model-catalog-"));
	const previousBackend = process.env.PHASEO_SESSION_BACKEND;
	const previousConfigDir = process.env.PHASEO_CONFIG_DIR;
	const previousFetch = globalThis.fetch;
	process.env.PHASEO_SESSION_BACKEND = "file";
	process.env.PHASEO_CONFIG_DIR = homeDir;
	const model = (index: number) => ({
		id: `provider/model-${String(index).padStart(3, "0")}`,
		name: `Model ${index}`,
		lifecycle: { status: "active" },
		modalities: { input: ["text"], output: ["text"] },
		limits: { input_tokens: 128_000, output_tokens: 16_000 },
		capabilities: { endpoints: ["chat.completions"] },
		availability: { status: "active", active_provider_count: 1 },
	});
	const requests: string[] = [];
	globalThis.fetch = async (input) => {
		const url = new URL(String(input));
		requests.push(url.toString());
		assert.equal(url.searchParams.get("availability"), "active");
		assert.equal(url.searchParams.get("endpoints"), "chat.completions");
		assert.equal(url.searchParams.get("input_types"), "text");
		assert.equal(url.searchParams.get("output_types"), "text");
		const offset = Number(url.searchParams.get("offset"));
		const page = offset === 0 ? Array.from({ length: 250 }, (_, index) => model(index)) : [model(250)];
		return new Response(JSON.stringify({ ok: true, total: 251, models: page }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	};
	try {
		await writeSession({
			accessToken: "oauth-session-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 60 * 60 * 1000,
			apiUrl: "https://api.phaseo.app",
		});
		const models = await fetchIntegrationModels("opencode");
		assert.equal(models.length, 251);
		assert.equal(requests.length, 2);
		assert.match(requests[1] ?? "", /offset=250/);

		globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, total: 5000, models: [] }), {
			status: 200, headers: { "content-type": "application/json" },
		});
		assert.deepEqual(await fetchIntegrationModels("opencode"), []);
		globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, total: 5001, models: [] }), {
			status: 200, headers: { "content-type": "application/json" },
		});
		await assert.rejects(fetchIntegrationModels("opencode"), /catalog is too large/);
	} finally {
		globalThis.fetch = previousFetch;
		if (previousBackend === undefined) delete process.env.PHASEO_SESSION_BACKEND;
		else process.env.PHASEO_SESSION_BACKEND = previousBackend;
		if (previousConfigDir === undefined) delete process.env.PHASEO_CONFIG_DIR;
		else process.env.PHASEO_CONFIG_DIR = previousConfigDir;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("primary harness installers use supported package commands and verified installer URLs", () => {
	assert.deepEqual(installInvocationFor("codex", "pnpm"), { command: "pnpm", args: ["add", "-g", "@openai/codex"] });
	assert.deepEqual(installInvocationFor("claude-code", "npm"), { command: "npm", args: ["install", "-g", "@anthropic-ai/claude-code"] });
	assert.deepEqual(installInvocationFor("opencode", "bun"), { command: "bun", args: ["install", "-g", "opencode-ai"] });
	assert.deepEqual(installInvocationFor("deepseek-harness", "yarn"), { command: "yarn", args: ["global", "add", "@deepseek-ai/dsh"] });
	assert.deepEqual(installInvocationFor("pi", "npm"), { command: "npm", args: ["install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent"] });
	assert.deepEqual(installInvocationFor("openclaw", "npm"), { command: "npm", args: ["install", "-g", "openclaw@latest"] });
	assert.deepEqual(installInvocationFor("openclaw", "npm", { allowPackageScripts: true }), {
		command: "npm",
		args: ["install", "-g", "openclaw@latest", "--allow-scripts=openclaw"],
	});
	assert.deepEqual(installInvocationFor("openclaw", "pnpm"), {
		command: "pnpm",
		args: ["add", "-g", "--allow-build=openclaw", "openclaw@latest"],
	});
	assert.match(installInvocationFor("prime-agent", "npm").args.join(" "), /app\.primeintellect\.ai\/prime-agent\/install\.sh/);
	const hermes = installInvocationFor("hermes", "npm");
	assert.match(hermes.args.join(" "), /hermes-agent\.nousresearch\.com\/install\.(?:ps1|sh)/);
	if (process.platform === "win32") assert.match(renderInstallInvocation(hermes), /-Command "& \(\[scriptblock\]::Create/);

	assert.deepEqual(
		packageManagerChildInvocation({ command: "bun", executable: "bun.exe", args: ["install", "-g", "opencode-ai"] }, "win32"),
		{ command: "bun.exe", args: ["install", "-g", "opencode-ai"] },
	);
	assert.deepEqual(packageManagerCandidates("bun", "win32"), ["bun.cmd", "bun.exe", "bun"]);
	assert.deepEqual(
		packageManagerChildInvocation({ command: "npm", executable: "C:\\Program Files\\nodejs\\npm.cmd", args: ["--version"] }, "win32", "cmd.exe"),
		{ command: "cmd.exe", args: ["/d", "/s", "/c", "\"\"C:\\Program Files\\nodejs\\npm.cmd\" --version\""], windowsVerbatimArguments: true },
	);
	assert.throws(
		() => packageManagerChildInvocation({ command: "npm", executable: "C:\\a%PATH%\\npm.cmd", args: ["--version"] }, "win32"),
		/unsupported Windows command token/,
	);
});

test("package managers resolve to absolute paths and never from the current directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "phaseo-pm-"));
	const binDir = join(root, "node bin");
	const cwdDir = join(root, "project");
	await mkdir(binDir, { recursive: true });
	await mkdir(cwdDir, { recursive: true });
	const previousCwd = process.cwd();
	try {
		await writeFile(join(binDir, "npm.cmd"), "@echo trusted %*\r\n");
		await writeFile(join(cwdDir, "npm.cmd"), "@echo planted %*\r\n");
		process.chdir(cwdDir);
		// Relative PATH entries (".", "") resolve against the current directory, so they are skipped.
		const env = { PATH: [".", "", binDir].join(delimiter) };
		const resolved = await findPackageManagerExecutable("npm", env, "win32");
		assert.equal(resolved, join(binDir, "npm.cmd"));
		assert.equal(await findPackageManagerExecutable("npm", { PATH: "." }, "win32"), null);
		assert.equal(packageManagerChildEnv(env, "win32").NoDefaultCurrentDirectoryInExePath, "1");
		assert.equal(packageManagerChildEnv(env, "linux").NoDefaultCurrentDirectoryInExePath, undefined);

		const update = await updateChildInvocation("npm", env, "win32", "cmd.exe");
		assert.equal(update.command, "cmd.exe");
		assert.equal(update.windowsVerbatimArguments, true);
		assert.match(update.args[3] ?? "", /^""[^"]+node bin[\\/]npm\.cmd" install -g @phaseo\/cli@latest"$/);
		await assert.rejects(updateChildInvocation("npm", { PATH: "." }, "win32"), /Could not find npm on PATH/);

		if (process.platform === "win32") {
			// Runs the stub shims only: the trusted one in a directory with a space, never the planted one in cwd.
			const child = packageManagerChildInvocation({ command: "npm", executable: resolved!, args: ["--version"] }, "win32");
			const result = spawnSync(child.command, child.args, {
				env: packageManagerChildEnv({ ...process.env }),
				windowsVerbatimArguments: child.windowsVerbatimArguments,
				encoding: "utf8",
			});
			assert.equal(result.stdout.trim(), "trusted --version");
		}
	} finally {
		process.chdir(previousCwd);
		await rm(root, { recursive: true, force: true });
	}
});

test("harness installation requires an explicit yes confirmation", async () => {
	assert.equal(acceptsInstallConfirmation("y"), true);
	assert.equal(acceptsInstallConfirmation(" YES "), true);
	assert.equal(acceptsInstallConfirmation(""), false);
	assert.equal(acceptsInstallConfirmation("no"), false);

	const input = new PassThrough();
	const output = new PassThrough();
	let rendered = "";
	output.setEncoding("utf8");
	output.on("data", (chunk) => { rendered += chunk; });
	const confirmation = confirmHarnessInstall("OpenCode", { command: "npm", args: ["install", "-g", "opencode-ai"] }, { input, output });
	input.end("yes\n");
	assert.equal(await confirmation, true);
	assert.match(rendered, /OpenCode is not installed/);
	assert.match(rendered, /npm install -g opencode-ai/);
	assert.match(rendered, /Install now\? \[y\/N\]/);
});

test("DeepSeek Harness setup and removal preserve unrelated patches", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-deepseek-harness-integration-"));
	const dshHome = join(homeDir, ".dsh");
	const configPath = join(dshHome, "cordis.patch.yml");
	const previousDshHome = process.env.DSH_HOME;
	delete process.env.DSH_HOME;
	try {
		await applyChanges([{ path: configPath, before: null, after: "- id: unrelated\n", description: "fixture" }]);
		const options = { homeDir, model: "anthropic/claude-sonnet-4.6" };
		await applyChanges(await deepSeekHarnessAdapter.planSetup(options));
		await applyChanges(await deepSeekHarnessAdapter.planCredential?.(options, "phaseo-secret") ?? []);
		assert.equal((await deepSeekHarnessAdapter.inspect({ homeDir })).status, "configured");
		assert.match(await readFile(join(dshHome, ".credentials.yaml"), "utf8"), /PHASEO_API_KEY: phaseo-secret/);
		await applyChanges(await deepSeekHarnessAdapter.planRemove(options));
		assert.equal(await readFile(configPath, "utf8"), "- id: unrelated\n");
		assert.doesNotMatch(await readFile(join(dshHome, ".credentials.yaml"), "utf8"), /PHASEO_API_KEY/);
	} finally {
		if (previousDshHome === undefined) delete process.env.DSH_HOME;
		else process.env.DSH_HOME = previousDshHome;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("Codex setup and removal only manage the Phaseo profile", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-codex-integration-"));
	const previousCodexHome = process.env.CODEX_HOME;
	process.env.CODEX_HOME = join(homeDir, ".codex");
	try {
		const options = { homeDir, model: "openai/gpt-5.6-terra" };
		await applyChanges(await codexAdapter.planSetup(options));
		const profile = await readFile(join(homeDir, ".codex", "phaseo.config.toml"), "utf8");
		assert.match(profile, /model = "openai\/gpt-5.6-terra"/);
		assert.equal((await codexAdapter.inspect(options)).status, "configured");
		await applyChanges(await codexAdapter.planRemove(options));
		await assert.rejects(readFile(join(homeDir, ".codex", "phaseo.config.toml"), "utf8"), { code: "ENOENT" });
	} finally {
		if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
		else process.env.CODEX_HOME = previousCodexHome;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("Claude Code setup and removal preserve unrelated settings", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-claude-integration-"));
	const settingsPath = join(homeDir, ".claude", "settings.json");
	try {
		await applyChanges([{ path: settingsPath, before: null, after: '{"permissions":{"allow":["Read"]}}\n', description: "fixture" }]);
		const options = { homeDir };
		await applyChanges(await claudeCodeAdapter.planSetup(options));
		assert.equal((await claudeCodeAdapter.inspect(options)).status, "configured");
		await applyChanges(await claudeCodeAdapter.planRemove(options));
		const settings = JSON.parse(await readFile(settingsPath, "utf8"));
		assert.deepEqual(settings, { permissions: { allow: ["Read"] } });
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("OpenCode setup and removal preserve unrelated JSONC settings", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-opencode-integration-"));
	const configPath = join(homeDir, ".config", "opencode", "opencode.jsonc");
	const original = `{
	// Keep this comment.
	"theme": "system",
}
`;
	const previousConfig = process.env.OPENCODE_CONFIG;
	const previousXdgDataHome = process.env.XDG_DATA_HOME;
	delete process.env.OPENCODE_CONFIG;
	process.env.XDG_DATA_HOME = homeDir;
	try {
		await applyChanges([{ path: configPath, before: null, after: original, description: "fixture" }]);
		const options = { homeDir, model: "openai/gpt-5.6-terra" };
		await applyChanges(await openCodeAdapter.planSetup(options));
		await applyChanges(await openCodeAdapter.planCredential?.(options, "phaseo-secret") ?? []);
		assert.equal((await openCodeAdapter.inspect(options)).status, "configured");
		assert.equal(JSON.parse(await readFile(join(homeDir, "opencode", "auth.json"), "utf8")).phaseo.key, "phaseo-secret");
		const configured = await readFile(configPath, "utf8");
		assert.match(configured, /Keep this comment/);
		await applyChanges(await openCodeAdapter.planRemove(options));
		const removed = await readFile(configPath, "utf8");
		assert.match(removed, /Keep this comment/);
		assert.equal((parseJsonc(removed) as Record<string, unknown>).theme, "system");
		assert.doesNotMatch(removed, /"phaseo"/);
		assert.equal(JSON.parse(await readFile(join(homeDir, "opencode", "auth.json"), "utf8")).phaseo, undefined);
	} finally {
		if (previousConfig === undefined) delete process.env.OPENCODE_CONFIG;
		else process.env.OPENCODE_CONFIG = previousConfig;
		if (previousXdgDataHome === undefined) delete process.env.XDG_DATA_HOME;
		else process.env.XDG_DATA_HOME = previousXdgDataHome;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("OpenCode honors an explicit OPENCODE_CONFIG path", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-opencode-custom-config-"));
	const configPath = join(homeDir, "custom.jsonc");
	const previousConfig = process.env.OPENCODE_CONFIG;
	const previousXdgDataHome = process.env.XDG_DATA_HOME;
	process.env.OPENCODE_CONFIG = configPath;
	process.env.XDG_DATA_HOME = homeDir;
	try {
		const options = { homeDir };
		await applyChanges(await openCodeAdapter.planSetup(options));
		await applyChanges(await openCodeAdapter.planCredential?.(options, "phaseo-secret") ?? []);
		assert.equal((await openCodeAdapter.inspect(options)).configPath, configPath);
		assert.equal((await openCodeAdapter.inspect(options)).status, "configured");
		await applyChanges(await openCodeAdapter.planRemove(options));
	} finally {
		if (previousConfig === undefined) delete process.env.OPENCODE_CONFIG;
		else process.env.OPENCODE_CONFIG = previousConfig;
		if (previousXdgDataHome === undefined) delete process.env.XDG_DATA_HOME;
		else process.env.XDG_DATA_HOME = previousXdgDataHome;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("OpenCode honors XDG_CONFIG_HOME and prefers JSONC", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-opencode-xdg-config-"));
	const jsonPath = join(homeDir, "opencode", "opencode.json");
	const jsoncPath = join(homeDir, "opencode", "opencode.jsonc");
	const previousConfig = process.env.OPENCODE_CONFIG;
	const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
	const previousXdgDataHome = process.env.XDG_DATA_HOME;
	delete process.env.OPENCODE_CONFIG;
	process.env.XDG_CONFIG_HOME = homeDir;
	process.env.XDG_DATA_HOME = homeDir;
	try {
		await applyChanges([
			{ path: jsonPath, before: null, after: '{}\n', description: "json fixture" },
			{ path: jsoncPath, before: null, after: '{}\n', description: "jsonc fixture" },
		]);
		await applyChanges(await openCodeAdapter.planSetup({ homeDir }));
		assert.equal((await openCodeAdapter.inspect({ homeDir })).configPath, jsoncPath);
		assert.match(await readFile(jsoncPath, "utf8"), /"phaseo"/);
		assert.doesNotMatch(await readFile(jsonPath, "utf8"), /"phaseo"/);
	} finally {
		if (previousConfig === undefined) delete process.env.OPENCODE_CONFIG;
		else process.env.OPENCODE_CONFIG = previousConfig;
		if (previousXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
		if (previousXdgDataHome === undefined) delete process.env.XDG_DATA_HOME;
		else process.env.XDG_DATA_HOME = previousXdgDataHome;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("Claude Code removal leaves an unmanaged settings file byte-for-byte unchanged", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-claude-unmanaged-"));
	const settingsPath = join(homeDir, ".claude", "settings.json");
	const original = '{"permissions":{"allow":["Read"]}}\n';
	try {
		await applyChanges([{ path: settingsPath, before: null, after: original, description: "fixture" }]);
		assert.deepEqual(await claudeCodeAdapter.planRemove({ homeDir }), []);
		assert.equal(await readFile(settingsPath, "utf8"), original);
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("Claude Code removal preserves a conflicting Phaseo gateway", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-claude-conflict-"));
	const settingsPath = join(homeDir, ".claude", "settings.json");
	const original = `${JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://api.phaseo.app" }, apiKeyHelper: "other-helper" }, null, 2)}\n`;
	try {
		await applyChanges([{ path: settingsPath, before: null, after: original, description: "fixture" }]);
		assert.deepEqual(await claudeCodeAdapter.planRemove({ homeDir }), []);
		assert.equal(await readFile(settingsPath, "utf8"), original);
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("Claude Code setup rejects model selection", async () => {
	await assert.rejects(
		runIntegrationCommand(["setup", "claude-code"], { model: "anthropic/claude-sonnet-4.6", "dry-run": true }),
		/--model is not supported for the Claude Code integration/,
	);
});

test("integration commands reject unexpected positional arguments", async () => {
	await assert.rejects(
		runIntegrationCommand(["setup", "codex", "unexpected"], { "dry-run": true }),
		/Usage: phaseo integrations/,
	);
});

test("one-command setup accepts every persistent integration and keeps runner names explicit", async () => {
	assert.equal(isPrimarySetupName("claude"), true);
	assert.equal(isPrimarySetupName("dsh"), true);
	assert.equal(isPrimarySetupName("openclaw"), true);
	assert.equal(isPrimarySetupName("aider"), false);
	assert.equal(isIntegrationSetupName("aider"), true);
	assert.equal(isIntegrationSetupName("continue"), true);
	assert.equal(isIntegrationSetupName("zed"), true);
	assert.equal(isIntegrationSetupName("not-an-integration"), false);
	await assert.rejects(
		runIntegrationCommand(["setup", "aider"], { "dry-run": true }, { primaryOnly: true }),
		/Phaseo direct setup currently supports codex, claude-code, hermes, opencode, pi, prime-agent, deepseek-harness, and openclaw/,
	);
});

test("model catalog flags are limited to catalog-backed harnesses", async () => {
	await assert.rejects(
		runIntegrationCommand(["setup", "codex"], { catalog: "all", "dry-run": true }),
		/only supported for OpenCode, DeepSeek Harness, Pi, Prime Agent, and OpenClaw/,
	);
});

test("browser login provisions and securely reuses a named, expiring, spend-limited integration key", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-integration-credential-"));
	const previousBackend = process.env.PHASEO_SESSION_BACKEND;
	const previousConfigDir = process.env.PHASEO_CONFIG_DIR;
	const previousApiKey = process.env.PHASEO_API_KEY;
	const previousFetch = globalThis.fetch;
	process.env.PHASEO_SESSION_BACKEND = "file";
	process.env.PHASEO_CONFIG_DIR = homeDir;
	delete process.env.PHASEO_API_KEY;
	const requests: Array<{ url: string; method: string; body?: string }> = [];
	globalThis.fetch = async (input, init) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		requests.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
		if (method === "POST" && url.endsWith("/v1/keys")) {
			return new Response(JSON.stringify({ data: { id: "key_agent", key: "phaseo_v1_sk_agent_secret" } }), {
				status: 201,
				headers: { "content-type": "application/json" },
			});
		}
		if (method === "DELETE" && url.endsWith("/v1/keys/key_agent")) {
			return new Response(null, { status: 204 });
		}
		throw new Error(`Unexpected request: ${method} ${url}`);
	};
	try {
		await writeSession({
			accessToken: "oauth-session-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 60 * 60 * 1000,
			apiUrl: "https://api.phaseo.app",
		});
		assert.equal(await getIntegrationGatewayCredential("codex"), "phaseo_v1_sk_agent_secret");
		assert.equal(await getIntegrationGatewayCredential("codex"), "phaseo_v1_sk_agent_secret");
		assert.equal(requests.filter((request) => request.method === "POST").length, 1);
		const created = JSON.parse(requests.find((request) => request.method === "POST")?.body ?? "{}");
		assert.equal(created.name, "Phaseo CLI: Codex API Key");
		assert.equal(created.limit, INTEGRATION_KEY_MONTHLY_LIMIT_USD);
		assert.equal(created.limit_reset, "monthly");
		const lifetime = Date.parse(created.expires_at) - Date.now();
		assert.ok(lifetime > INTEGRATION_KEY_LIFETIME_MS - 60_000 && lifetime <= INTEGRATION_KEY_LIFETIME_MS, "key expires after 90 days");
		assert.equal((await readSession())?.integrationGatewayCredentials?.codex?.keyId, "key_agent");
		assert.equal((await readSession())?.integrationGatewayCredentials?.codex?.expiresAt, Date.parse(created.expires_at));
		assert.equal(await revokeIntegrationGatewayCredential("codex"), true);
		assert.equal((await readSession())?.integrationGatewayCredentials?.codex, undefined);
		assert.equal(requests.filter((request) => request.method === "DELETE").length, 1);
	} finally {
		globalThis.fetch = previousFetch;
		if (previousBackend === undefined) delete process.env.PHASEO_SESSION_BACKEND;
		else process.env.PHASEO_SESSION_BACKEND = previousBackend;
		if (previousConfigDir === undefined) delete process.env.PHASEO_CONFIG_DIR;
		else process.env.PHASEO_CONFIG_DIR = previousConfigDir;
		if (previousApiKey === undefined) delete process.env.PHASEO_API_KEY;
		else process.env.PHASEO_API_KEY = previousApiKey;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("legacy credential helpers remain supported and bulk revocation clears every integration key", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-legacy-integration-credential-"));
	const previousBackend = process.env.PHASEO_SESSION_BACKEND;
	const previousConfigDir = process.env.PHASEO_CONFIG_DIR;
	const previousApiKey = process.env.PHASEO_API_KEY;
	const previousFetch = globalThis.fetch;
	process.env.PHASEO_SESSION_BACKEND = "file";
	process.env.PHASEO_CONFIG_DIR = homeDir;
	delete process.env.PHASEO_API_KEY;
	let keyNumber = 0;
	const deleted: string[] = [];
	globalThis.fetch = async (input, init) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		if (method === "POST" && url.endsWith("/v1/keys")) {
			keyNumber += 1;
			return new Response(JSON.stringify({ data: { id: `key_${keyNumber}`, key: `phaseo_v1_sk_${keyNumber}` } }), {
				status: 201,
				headers: { "content-type": "application/json" },
			});
		}
		if (method === "DELETE") {
			deleted.push(url);
			return new Response(null, { status: 204 });
		}
		throw new Error(`Unexpected request: ${method} ${url}`);
	};
	try {
		await writeSession({
			accessToken: "oauth-session-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 60 * 60 * 1000,
			apiUrl: "https://api.phaseo.app",
		});
		assert.equal(await getLegacyIntegrationGatewayCredential(), "phaseo_v1_sk_1");
		assert.equal(await getLegacyIntegrationGatewayCredential(), "phaseo_v1_sk_1");
		assert.equal(await getIntegrationGatewayCredential("codex"), "phaseo_v1_sk_2");
		assert.equal(await revokeIntegrationGatewayCredential(), true);
		const session = await readSession();
		assert.equal(session?.integrationGatewayKeyId, undefined);
		assert.deepEqual(session?.integrationGatewayCredentials, {});
		assert.deepEqual(deleted.map((url) => url.split("/").at(-1)).sort(), ["key_1", "key_2"]);
	} finally {
		globalThis.fetch = previousFetch;
		if (previousBackend === undefined) delete process.env.PHASEO_SESSION_BACKEND;
		else process.env.PHASEO_SESSION_BACKEND = previousBackend;
		if (previousConfigDir === undefined) delete process.env.PHASEO_CONFIG_DIR;
		else process.env.PHASEO_CONFIG_DIR = previousConfigDir;
		if (previousApiKey === undefined) delete process.env.PHASEO_API_KEY;
		else process.env.PHASEO_API_KEY = previousApiKey;
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("transaction rollback removes files created earlier in the plan", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-integration-rollback-"));
	const createdPath = join(homeDir, "created.txt");
	const blockingPath = join(homeDir, "not-a-directory");
	try {
		await writeFile(blockingPath, "block");
		await assert.rejects(applyChanges([
			{ path: createdPath, before: null, after: "created", description: "create fixture" },
			{ path: join(blockingPath, "child"), before: null, after: "fail", description: "fail fixture" },
		]));
		await assert.rejects(readFile(createdPath, "utf8"), { code: "ENOENT" });
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
});

test("stale file plans never overwrite newer content", async () => {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-integration-stale-"));
	const path = join(homeDir, "settings.json");
	try {
		await writeFile(path, "original");
		const plan = [{ path, before: "original", after: "phaseo", description: "update fixture" }];
		await writeFile(path, "newer");
		await assert.rejects(applyChanges(plan), /Refusing to apply stale file change/);
		assert.equal(await readFile(path, "utf8"), "newer");
	} finally {
		await rm(homeDir, { recursive: true, force: true });
	}
});

async function withFileSession<T>(fetchImpl: typeof fetch, run: () => Promise<T>): Promise<T> {
	const homeDir = await mkdtemp(join(tmpdir(), "phaseo-session-"));
	const previous = { backend: process.env.PHASEO_SESSION_BACKEND, configDir: process.env.PHASEO_CONFIG_DIR, apiKey: process.env.PHASEO_API_KEY, fetch: globalThis.fetch };
	process.env.PHASEO_SESSION_BACKEND = "file";
	process.env.PHASEO_CONFIG_DIR = homeDir;
	delete process.env.PHASEO_API_KEY;
	globalThis.fetch = fetchImpl;
	try {
		return await run();
	} finally {
		globalThis.fetch = previous.fetch;
		for (const [name, value] of [["PHASEO_SESSION_BACKEND", previous.backend], ["PHASEO_CONFIG_DIR", previous.configDir], ["PHASEO_API_KEY", previous.apiKey]] as const) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		await rm(homeDir, { recursive: true, force: true });
	}
}

test("expired integration keys are replaced; unexpired and pre-expiry keys are kept", async () => {
	const calls: string[] = [];
	let keyNumber = 0;
	await withFileSession(async (input, init) => {
		const method = init?.method ?? "GET";
		calls.push(`${method} ${String(input).split("/v1")[1]}`);
		if (method === "POST") {
			keyNumber += 1;
			return new Response(JSON.stringify({ data: { id: `key_new_${keyNumber}`, key: `phaseo_v1_sk_new_${keyNumber}` } }), { status: 201 });
		}
		return new Response(null, { status: 204 });
	}, async () => {
		await writeSession({
			accessToken: "t",
			refreshToken: "r",
			expiresAt: Date.now() + 3_600_000,
			apiUrl: "https://api.phaseo.app",
			integrationGatewayCredentials: {
				codex: { key: "fresh", keyId: "key_fresh", expiresAt: Date.now() + 60_000 },
				aider: { key: "legacy", keyId: "key_legacy" },
				hermes: { key: "expired", keyId: "key_expired", expiresAt: Date.now() - 1_000 },
			},
		});
		assert.equal(await getIntegrationGatewayCredential("codex"), "fresh");
		assert.equal(await getIntegrationGatewayCredential("aider"), "legacy");
		assert.deepEqual(calls, []);

		assert.equal(await hasIntegrationGatewayCredential("hermes"), false);
		assert.equal(await getIntegrationGatewayCredential("hermes"), "phaseo_v1_sk_new_1");
		// The expired key is only dropped from the session; it already stopped working.
		assert.deepEqual(calls, ["POST /keys"]);
		const stored = (await readSession())?.integrationGatewayCredentials;
		assert.equal(stored?.hermes?.keyId, "key_new_1");
		assert.ok((stored?.hermes?.expiresAt ?? 0) > Date.now() + INTEGRATION_KEY_LIFETIME_MS - 60_000);
		assert.equal(stored?.aider?.keyId, "key_legacy");
	});
});

test("re-login keeps integration keys only for the same API, account and workspace", async () => {
	const deleted: string[] = [];
	const identities: Record<string, { user: string; workspace: string }> = {
		"old-token": { user: "user_a", workspace: "ws_1" },
		"same-token": { user: "user_a", workspace: "ws_1" },
		"other-user-token": { user: "user_b", workspace: "ws_1" },
		"other-workspace-token": { user: "user_a", workspace: "ws_2" },
	};
	await withFileSession(async (input, init) => {
		const url = String(input);
		const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
		if (url.endsWith("/v1/me")) {
			const identity = identities[token];
			return identity
				? new Response(JSON.stringify({ data: { user: { id: identity.user }, current_workspace_id: identity.workspace } }), { status: 200 })
				: new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 });
		}
		if (init?.method === "DELETE") {
			const id = url.split("/").at(-1)!;
			deleted.push(`${token} ${id}`);
			return id === "key_stuck" ? new Response(JSON.stringify({ message: "nope" }), { status: 500 }) : new Response(null, { status: 204 });
		}
		throw new Error(`Unexpected request ${url}`);
	}, async () => {
		const previous = {
			accessToken: "old-token",
			refreshToken: "old-refresh",
			expiresAt: Date.now() + 3_600_000,
			apiUrl: "https://api.phaseo.app",
			integrationGatewayCredentials: { codex: { key: "k1", keyId: "key_codex", expiresAt: Date.now() + 1_000_000 }, aider: { key: "k2", keyId: "key_stuck" } },
			integrationGatewayKey: "legacy",
			integrationGatewayKeyId: "key_legacy",
			integrationGatewayKeyExpiresAt: Date.now() + 1_000,
		};
		const same = await integrationCredentialsForNewLogin(previous, { apiUrl: "https://api.phaseo.app", accessToken: "same-token" });
		assert.deepEqual(same.carried.integrationGatewayCredentials, previous.integrationGatewayCredentials);
		assert.equal(same.carried.integrationGatewayKeyId, "key_legacy");
		assert.deepEqual(deleted, []);

		for (const accessToken of ["other-user-token", "other-workspace-token", "unknown-token"]) {
			deleted.length = 0;
			const result = await integrationCredentialsForNewLogin(previous, { apiUrl: "https://api.phaseo.app", accessToken });
			assert.deepEqual(result.carried, {}, accessToken);
			// Revoked with the OLD session's token.
			assert.deepEqual(deleted.sort(), ["old-token key_codex", "old-token key_legacy", "old-token key_stuck"], accessToken);
			assert.deepEqual(result.revokeFailures, ["key_stuck"]);
		}

		deleted.length = 0;
		const otherApi = await integrationCredentialsForNewLogin(previous, { apiUrl: "http://127.0.0.1:8788", accessToken: "same-token" });
		assert.deepEqual(otherApi.carried, {});
		assert.equal(deleted.length, 3);

		assert.deepEqual(await integrationCredentialsForNewLogin(null, { apiUrl: "https://api.phaseo.app", accessToken: "x" }), { carried: {}, revokeFailures: [] });
	});
});

const block = (key: string) => `${HERMES_BLOCK_START}\nOPENAI_API_KEY=${key}\n${HERMES_BLOCK_END}\n`;

test("Hermes key is written to its env file as a delimited Phaseo block", () => {
	assert.equal(renderHermesEnv(null, "phaseo_v1_sk_x"), block("phaseo_v1_sk_x"));
	assert.equal(renderHermesEnv("A=1", "phaseo_v1_sk_x"), `A=1\n${block("phaseo_v1_sk_x")}`);
	// Re-setup replaces only the block; CRLF lines elsewhere stay byte-for-byte.
	const withBlock = `A=1\r\n${block("phaseo_v1_sk_old")}B=2\r\n`;
	assert.equal(renderHermesEnv(withBlock, "phaseo_v1_sk_new"), `A=1\r\nB=2\r\n${block("phaseo_v1_sk_new")}`);
	assert.equal(renderHermesEnvWithoutKey(withBlock), "A=1\r\nB=2\r\n");
	assert.throws(() => renderHermesEnv(`${HERMES_BLOCK_START}\nOPENAI_API_KEY=x\n`, "phaseo_v1_sk_x"), /unterminated Phaseo-managed block/);
	assert.throws(() => renderHermesEnv(null, "bad\nINJECTED=1"), /invalid gateway credential/);
	assert.throws(() => renderHermesEnv(null, "bad key"), /invalid gateway credential/);
});

test("Hermes .env edits never touch user lines and refuse user-defined OPENAI_API_KEY", () => {
	// Supported files: user lines stay byte-for-byte.
	const plain = "KEEP=1\n# a comment\nQUOTED=\"two words\"\nSINGLE='x y'\n";
	const written = renderHermesEnv(plain, "phaseo_v1_sk_x");
	assert.equal(written, `${plain}${block("phaseo_v1_sk_x")}`);
	assert.equal(firstUnsupportedHermesEnvLine(written), null, "the managed block itself is supported");
	assert.equal(renderHermesEnvWithoutKey(written), plain);

	for (const definition of [
		"OPENAI_API_KEY=secret",
		"  export OPENAI_API_KEY = secret",
		"\texport\tOPENAI_API_KEY\t=\t\"secret value\" # note",
		"OPENAI_API_KEY='secret'",
		"OPENAI_API_KEY=",
	]) {
		assert.equal(hermesEnvDefinesOpenAIKey(`A=1\n${definition}\n`), true, definition);
		assert.throws(() => renderHermesEnv(`A=1\n${definition}\n`, "phaseo_v1_sk_x"), /outside the Phaseo-managed block/, definition);
	}
	// Quoted names and other syntaxes are outside the allowlist, so the file is refused instead.
	for (const unsupported of ["'OPENAI_API_KEY'=secret", '"OPENAI_API_KEY"="secret"', "OPENAI_API_KEY: secret"]) {
		assert.throws(() => renderHermesEnv(`A=1\n${unsupported}\n`, "phaseo_v1_sk_x"), HermesEnvQuotingError, unsupported);
	}
	assert.equal(hermesEnvDefinesOpenAIKey("# OPENAI_API_KEY=commented\nOPENAI_API_KEY_OLD=1\n"), false);

	// The bare line an earlier Phaseo version wrote is migrated only when it matches the stored key exactly.
	assert.equal(renderHermesEnv("A=1\nOPENAI_API_KEY=phaseo_v1_sk_old\n", "phaseo_v1_sk_new", "phaseo_v1_sk_old"), `A=1\n${block("phaseo_v1_sk_new")}`);
	assert.throws(() => renderHermesEnv("OPENAI_API_KEY=phaseo_v1_sk_other\n", "phaseo_v1_sk_new", "phaseo_v1_sk_old"), /outside the Phaseo-managed block/);
	assert.equal(renderHermesEnvWithoutKey("A=1\nOPENAI_API_KEY=phaseo_v1_sk_old\n", "phaseo_v1_sk_old"), "A=1\n");
});

test("typical Hermes .env files are supported, including CRLF", () => {
	const typical = [
		"# Hermes Agent provider keys",
		"",
		"ANTHROPIC_API_KEY=sk-ant-example_123",
		"export OPENROUTER_API_KEY=sk-or-v1-abc",
		"  NOUS_API_KEY = nous-key   # trailing comment",
		"HERMES_DISPLAY_NAME=\"My Hermes agent\"",
		"TERMINAL_ENV='docker run'",
		"EMPTY=",
		"\t",
	].join("\n");
	for (const text of [`${typical}\n`, `${typical.replaceAll("\n", "\r\n")}\r\n`, typical]) {
		assert.equal(firstUnsupportedHermesEnvLine(text), null);
		const written = renderHermesEnv(text, "phaseo_v1_sk_x");
		assert.ok(written.startsWith(text), "user lines unchanged");
		assert.equal(renderHermesEnvWithoutKey(written), text.endsWith("\n") ? text : `${text}\n`);
	}
});

test("Hermes .env files outside the allowlist are refused and left unchanged", async () => {
	for (const unsupported of [
		'A="open', "A='it\\'s'", "A=`cmd`", "# don't", 'A="x\\"y"', "A='x\\y'", "WIN=C:\\dir", "A=two words",
		"A=1 # it's", "1BAD=x", "A.B=x", "A=1\rB=2","\ufeffA=1", "A=caf\u00e9", "A=\u000bB", "export=1 x",
	]) {
		assert.notEqual(firstUnsupportedHermesEnvLine(`${unsupported}\n`), null, JSON.stringify(unsupported));
	}
	// A trailing CR without LF is a lone CR too.
	assert.equal(firstUnsupportedHermesEnvLine("A=1\r"), 1);
	assert.equal(firstUnsupportedHermesEnvLine("A=1\r\nB=2\r\n"), null);

	const root = await mkdtemp(join(tmpdir(), "phaseo-hermes-quoting-"));
	try {
		const cases = {
			// python-dotenv reads `\'` as an escaped quote, so OPENAI_API_KEY below is a real definition.
			escapedSingleQuote: "OTHER='don\\'t'\nOPENAI_API_KEY=user-secret\n",
			// Literal block markers inside a user's multiline value.
			markersInMultiline: `NOTE="before\n${HERMES_BLOCK_START}\nOPENAI_API_KEY=user-data\n${HERMES_BLOCK_END}\nafter"\n`,
			// An exact legacy line inside a user's multiline value.
			legacyLineInMultiline: "NOTE=\"before\nOPENAI_API_KEY=phaseo_v1_sk_old\nafter\"\n",
			// Escaped quotes keep the quote count even while the value still spans lines.
			escapedDoubleQuotes: 'NOTE="before\\"\nOPENAI_API_KEY=phaseo_v1_sk_old\nafter\\""\n',
			// python-dotenv treats a lone CR as a newline, hiding a user key from a LF-only scan.
			crOnlyNewlines: "KEEP=1\rOPENAI_API_KEY=user-secret\r",
			// S10: quotes inside a variable name start a multiline value.
			quotesInName: "'NOTE\"'=\"before\nOPENAI_API_KEY=phaseo_v1_sk_old\nafter\" # \"\n",
			// S11: Unicode whitespace Python accepts but JavaScript's \s does not.
			nelBeforeName: "KEEP=1\n\u0085OPENAI_API_KEY=user-secret\n",
			nelBeforeEquals: "KEEP=1\nOPENAI_API_KEY\u0085=user-secret\n",
			nelAfterExport: "KEEP=1\nexport\u0085OPENAI_API_KEY=user-secret\n",
		};
		for (const [name, contents] of Object.entries(cases)) {
			const envPath = join(root, name, ".env");
			await mkdir(join(root, name));
			await writeFile(envPath, contents);
			await assert.rejects(writeHermesKey(envPath, "phaseo_v1_sk_new", "phaseo_v1_sk_old"), (error: Error) => {
				assert.ok(error instanceof HermesEnvQuotingError, name);
				assert.match(error.message, /will not edit .*line \d+ is not a blank line, a comment or a single-line NAME=VALUE assignment.*OPENAI_API_KEY=<key>.*phaseo integrations credential hermes/);
				assert.doesNotMatch(error.message, /phaseo_v1_sk_new|user-secret/, "no key in the error");
				return true;
			});
			await assert.rejects(removeHermesKey(envPath, { key: "phaseo_v1_sk_old" }), /Remove the OPENAI_API_KEY line Phaseo added .* by hand/);
			await assert.rejects(assertHermesEnvEditable(envPath, "setup"), HermesEnvQuotingError);
			await assert.rejects(assertHermesEnvEditable(envPath, "remove"), HermesEnvQuotingError);
			assert.throws(() => renderHermesEnvWithoutKey(contents, "phaseo_v1_sk_old"), HermesEnvQuotingError);
			assert.equal(await readFile(envPath, "utf8"), contents, `${name} unchanged`);
			assert.deepEqual(await readdir(join(root, name)), [".env"]);
		}

		const simple = join(root, "simple.env");
		await writeFile(simple, "A=1\n");
		await assertHermesEnvEditable(simple, "setup");
		await assertHermesEnvEditable(join(root, "missing.env"), "remove");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Hermes home is resolved like Hermes does, expanding ~ and environment variables", () => {
	const homeDir = resolve("home-user");
	const options = { homeDir } as Parameters<typeof hermesEnvPath>[0];
	assert.equal(hermesEnvPath(options, {}), join(homeDir, ".hermes", ".env"));
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "  " }), join(homeDir, ".hermes", ".env"));
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "~/agents/hermes" }), join(homeDir, "agents", "hermes", ".env"));
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "~" }), join(homeDir, ".env"));
	const base = resolve("data-root");
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "$DATA/hermes", DATA: base }, "linux"), join(base, "hermes", ".env"));
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "${DATA}/hermes", DATA: base }, "linux"), join(base, "hermes", ".env"));
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "%DATA%/hermes", DATA: base }, "win32"), join(base, "hermes", ".env"));
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "%DATA%/hermes", DATA: base }, "linux"), join(resolve("%DATA%/hermes"), ".env"));
	assert.equal(resolveHermesHome(options, { HERMES_HOME: "relative-hermes" }), resolve("relative-hermes"));
	// On other platforms, as in Python's expanduser, "~\\" is not a home prefix.
	assert.equal(resolveHermesHome(options, { HERMES_HOME: "~\\agents" }, "linux"), resolve("~\\agents"));
});

test("Hermes home accepts ~\\ on Windows", { skip: process.platform !== "win32" }, () => {
	const homeDir = resolve("home-user");
	const options = { homeDir } as Parameters<typeof hermesEnvPath>[0];
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "~\\agents\\hermes" }, "win32"), join(homeDir, "agents", "hermes", ".env"));
	assert.equal(hermesEnvPath(options, { HERMES_HOME: "~/agents/hermes" }, "win32"), join(homeDir, "agents", "hermes", ".env"));
});

test("Hermes .env writes are atomic, private, keep other lines and refuse symlinks", async () => {
	const root = await mkdtemp(join(tmpdir(), "phaseo-hermes-env-"));
	try {
		const home = join(root, "hermes");
		const envPath = join(home, ".env");
		await writeHermesKey(envPath, "phaseo_v1_sk_first");
		assert.equal(await readFile(envPath, "utf8"), block("phaseo_v1_sk_first"));
		await writeFile(envPath, `ANTHROPIC_API_KEY=a\n${block("phaseo_v1_sk_first")}`, { mode: 0o644 });
		await writeHermesKey(envPath, "phaseo_v1_sk_second");
		assert.equal(await readFile(envPath, "utf8"), `ANTHROPIC_API_KEY=a\n${block("phaseo_v1_sk_second")}`);
		if (process.platform !== "win32") {
			assert.equal((await stat(envPath)).mode & 0o777, 0o600);
			assert.equal((await stat(home)).mode & 0o777, 0o700);
		}
		assert.deepEqual((await readdir(home)).sort(), [".env"], "no temporary files left behind");
		assert.equal(await removeHermesKey(envPath), true);
		assert.equal(await readFile(envPath, "utf8"), "ANTHROPIC_API_KEY=a\n");
		// A legacy line that cannot be matched to the stored key is left in place and reported.
		await writeFile(envPath, "ANTHROPIC_API_KEY=a\nOPENAI_API_KEY=phaseo_v1_sk_unknown\n");
		assert.equal(await removeHermesKey(envPath, { key: "phaseo_v1_sk_other" }), false);
		assert.equal(await readFile(envPath, "utf8"), "ANTHROPIC_API_KEY=a\nOPENAI_API_KEY=phaseo_v1_sk_unknown\n");
		assert.equal(await removeHermesKey(envPath, { key: "phaseo_v1_sk_unknown" }), true);
		assert.equal(await readFile(envPath, "utf8"), "ANTHROPIC_API_KEY=a\n");

		const target = join(root, "elsewhere.env");
		await writeFile(target, "SECRET=keep\n");
		const linkedHome = join(root, "linked-file");
		await mkdir(linkedHome);
		const linkedDir = join(root, "linked-dir");
		try {
			await symlink(target, join(linkedHome, ".env"), "file");
			await symlink(home, linkedDir, "junction");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EPERM") return; // Windows without symlink rights.
			throw error;
		}
		await assert.rejects(writeHermesKey(join(linkedHome, ".env"), "phaseo_v1_sk_x"), /symbolic link/);
		await assert.rejects(writeHermesKey(join(linkedDir, ".env"), "phaseo_v1_sk_x"), /symbolic link/);
		await assert.rejects(removeHermesKey(join(linkedHome, ".env")), /symbolic link/);
		assert.equal(await readFile(target, "utf8"), "SECRET=keep\n");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
