import assert from "node:assert/strict";
import test from "node:test";
import { runnerInstallInvocationFor } from "../src/integrations/installer.js";
import {
	buildRunnerInvocation,
	isRunnerName,
	normalizeRunnerName,
	renderClineModels,
	renderClineProviders,
	renderKiloConfig,
	renderMuseSettings,
	renderOmpModels,
	runnerChildInvocation,
} from "../src/integrations/runners.js";

const paths = {
	root: "C:\\Temp\\phaseo-runner",
	clineSettings: "C:\\Temp\\phaseo-runner\\cline\\settings",
	clineData: "C:\\Temp\\phaseo-runner\\cline\\data",
	kiloConfig: "C:\\Temp\\phaseo-runner\\kilo.jsonc",
	ompAgent: "C:\\Temp\\phaseo-runner\\omp\\agent",
	museConfigHome: "C:\\Temp\\phaseo-runner\\muse-config",
};

const models = [
	{ id: "openai/gpt-test", name: "GPT Test", contextWindow: 128_000, maxOutputTokens: 16_000, reasoning: true, input: ["text"] as Array<"text"> },
	{ id: "anthropic/claude-test", name: "Claude Test", contextWindow: 200_000, maxOutputTokens: 32_000, reasoning: false, input: ["text", "image"] as Array<"text" | "image"> },
];

test("runner names cover every Ori addition", () => {
	for (const name of ["cline", "kilo", "omp", "muse"]) assert.equal(isRunnerName(name), true);
	assert.equal(isRunnerName("roo"), false);
	assert.equal(normalizeRunnerName("omp"), "omp");
	assert.throws(() => normalizeRunnerName("unknown"), /Supported: cline, kilo, omp, muse/);
});

test("Cline config uses an env-backed key and exposes the model catalog", () => {
	const providers = renderClineProviders(models[0].id);
	const catalog = renderClineModels(models);
	assert.match(providers, /"lastUsedProvider": "phaseo"/);
	assert.match(providers, /"apiKeyEnv": "PHASEO_CLINE_API_KEY"/);
	assert.match(providers, /api\.phaseo\.app\/v1/);
	assert.match(catalog, /anthropic\/claude-test/);
	assert.doesNotMatch(`${providers}${catalog}`, /phaseo_v1_sk_/);
});

test("Kilo config uses a trusted env reference and provider/model namespacing", () => {
	const config = JSON.parse(renderKiloConfig(models[0].id, models));
	assert.equal(config.model, "phaseo/openai/gpt-test");
	assert.equal(config.provider.phaseo.options.apiKey, "{env:PHASEO_KILO_API_KEY}");
	assert.equal(config.provider.phaseo.options.baseURL, "https://api.phaseo.app/v1");
	assert.equal(config.provider.phaseo.models["openai/gpt-test"].provider.npm, "@ai-sdk/openai-compatible");
	assert.doesNotMatch(renderKiloConfig(models[0].id, models), /phaseo_v1_sk_/);
});

test("selected models outside the catalog remain launchable", () => {
	const config = JSON.parse(renderKiloConfig("provider/custom-model", models));
	assert.equal(config.model, "phaseo/provider/custom-model");
	assert.equal(config.provider.phaseo.models["provider/custom-model"].id, "provider/custom-model");
});

test("oh-my-pi config registers every model against the Phaseo gateway", () => {
	const config = renderOmpModels(models[0].id, models);
	assert.match(config, /providers:/);
	assert.match(config, /phaseo:/);
	assert.match(config, /api: openai-completions/);
	assert.match(config, /apiKey: PHASEO_OMP_API_KEY/);
	assert.match(config, /anthropic\/claude-test/);
	assert.doesNotMatch(config, /phaseo_v1_sk_/);
});

test("Muse config seeds an isolated provider and model catalog", () => {
	const config = JSON.parse(renderMuseSettings(models[0].id, models));
	assert.equal(config.provider, "meta");
	assert.equal(config.endpoint_transport.base_url, "https://api.phaseo.app/v1");
	assert.equal(config.endpoint_transport.auth, "bearer");
	assert.equal(config.model_catalog[0].model_id, models[0].id);
	assert.equal(config.model_catalog[0].provider_id, "meta");
	assert.equal(config.model_catalog[0].profile_id, "tbh");
	assert.equal(config.model_catalog[1].model_id, models[1].id);
	assert.doesNotMatch(renderMuseSettings(models[0].id, models), /phaseo_v1_sk_/);
});

test("runner invocations never put the gateway credential in argv", () => {
	for (const runner of ["cline", "kilo", "omp", "muse"] as const) {
		const invocation = buildRunnerInvocation(runner, models[0].id, ["--plan", "Review the diff"], paths, { PATH: "C:\\Tools", SECRET: "do-not-forward" });
		assert.deepEqual(invocation.args.slice(-2), ["--plan", "Review the diff"]);
		assert.equal(invocation.args.some((value) => value.includes("do-not-forward")), false);
		assert.equal(invocation.env.SECRET, "do-not-forward");
	}
});

test("Windows runner wrappers reject cmd.exe interpolation and use argument-safe launchers", () => {
	const invocation = buildRunnerInvocation("cline", models[0].id, ["--system", "Review & test", "--tui"], paths, {});
	assert.throws(
		() => runnerChildInvocation({ ...invocation, command: "C:\\Program Files\\cline.cmd" }, "win32", "cmd.exe"),
		/unsupported/,
	);

	const powershell = runnerChildInvocation({ ...invocation, command: "C:\\Tools\\cline.ps1" }, "win32", "cmd.exe");
	assert.deepEqual(powershell.args.slice(0, 4), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]);
});

test("runner installers map to the documented package or installer", () => {
	assert.deepEqual(runnerInstallInvocationFor("cline", "npm"), {
		command: "npm",
		args: ["install", "-g", "cline"],
	});
	assert.deepEqual(runnerInstallInvocationFor("kilo", "pnpm"), {
		command: "pnpm",
		args: ["add", "-g", "@kilocode/cli"],
	});
	assert.deepEqual(runnerInstallInvocationFor("omp", "bun"), {
		command: "bun",
		args: ["install", "-g", "@oh-my-pi/pi-coding-agent"],
	});
	assert.match(runnerInstallInvocationFor("muse", "npm").args[1], /dev\.meta\.ai\/install\.sh/);
});
