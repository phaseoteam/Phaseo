import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as stringifyYaml } from "yaml";
import { fetchCompatibleModels } from "./catalog.js";
import { getIntegrationGatewayCredential } from "./credential.js";
import { confirmHarnessInstall, installHarness, renderInstallInvocation, runnerInstallPlan } from "./installer.js";
import type { IntegrationModel } from "./types.js";

export type RunnerId = "cline" | "kilo" | "omp" | "muse";

const BASE_URL = "https://api.phaseo.app/v1";
const DEFAULT_MODEL = "openai/gpt-5.6-terra";
const CREDENTIAL_IDS: Record<RunnerId, string> = {
	cline: "cline-cli",
	kilo: "kilo-cli",
	omp: "oh-my-pi",
	muse: "muse-code",
};

const COMMANDS: Record<RunnerId, string[]> = {
	cline: ["cline", "cline.exe", "cline.cmd", "cline.ps1"],
	kilo: ["kilo", "kilo.exe", "kilo.cmd", "kilo.ps1"],
	omp: ["omp", "omp.exe", "omp.cmd", "omp.ps1"],
	muse: ["muse", "muse.exe", "muse.cmd", "muse.ps1"],
};

export type RunnerPaths = {
	root: string;
	clineSettings: string;
	clineData: string;
	kiloConfig: string;
	ompAgent: string;
	museConfigHome: string;
};

export type RunnerInvocation = {
	command: string;
	args: string[];
	env: NodeJS.ProcessEnv;
};

function runnerId(value: string | undefined): RunnerId | null {
	if (value === "cline" || value === "kilo" || value === "omp" || value === "muse") return value;
	return null;
}

export function isRunnerName(value: string | undefined): value is RunnerId {
	return runnerId(value) !== null;
}

export function normalizeRunnerName(value: string | undefined): RunnerId {
	const normalized = runnerId(value);
	if (!normalized) throw new Error(`Unknown Phaseo runner: ${value || "(missing)"}. Supported: cline, kilo, omp, muse`);
	return normalized;
}

function modelEntry(model: string, models: IntegrationModel[]): IntegrationModel[] {
	if (models.some((entry) => entry.id === model)) return models;
	return [{ id: model, name: model }, ...models];
}

export function renderClineProviders(model: string): string {
	return `${JSON.stringify({
		version: 1,
		lastUsedProvider: "phaseo",
		providers: {
			phaseo: {
				settings: {
					provider: "phaseo",
					model,
					baseUrl: BASE_URL,
					apiKeyEnv: "PHASEO_CLINE_API_KEY",
					protocol: "openai-chat",
					client: "openai-compatible",
				},
				updatedAt: new Date(0).toISOString(),
				tokenSource: "env",
			},
		},
	}, null, 2)}\n`;
}

export function renderClineModels(models: IntegrationModel[]): string {
	return `${JSON.stringify({
		phaseo: {
			models: models.map(({ id, name, contextWindow, maxOutputTokens, reasoning, input }) => ({
				id,
				name,
				contextWindow,
				maxTokens: maxOutputTokens,
				reasoning,
				input,
			})),
		},
	}, null, 2)}\n`;
}

export function renderKiloConfig(model: string, models: IntegrationModel[]): string {
	const entries = modelEntry(model, models);
	return `${JSON.stringify({
		$schema: "https://app.kilo.ai/config.json",
		model: `phaseo/${model}`,
		provider: {
			phaseo: {
				options: {
					apiKey: "{env:PHASEO_KILO_API_KEY}",
					baseURL: BASE_URL,
				},
				models: Object.fromEntries(entries.map((entry) => [entry.id, {
					id: entry.id,
					name: entry.name,
					tool_call: true,
					reasoning: entry.reasoning,
					limit: {
						context: entry.contextWindow,
						output: entry.maxOutputTokens,
					},
					provider: { npm: "@ai-sdk/openai-compatible" },
				}])),
			},
		},
	}, null, 2)}\n`;
}

export function renderOmpModels(model: string, models: IntegrationModel[]): string {
	const entries = modelEntry(model, models);
	return stringifyYaml({
		providers: {
			phaseo: {
				baseUrl: BASE_URL,
				api: "openai-completions",
				apiKey: "PHASEO_OMP_API_KEY",
				authHeader: true,
				models: entries.map((entry) => ({
					id: entry.id,
					name: entry.name,
					contextWindow: entry.contextWindow,
					maxTokens: entry.maxOutputTokens,
				})),
			},
		},
	});
}

export function renderMuseSettings(model: string, models: IntegrationModel[]): string {
	const entries = modelEntry(model, models);
	return `${JSON.stringify({
		schema_version: 1,
		provider: "meta",
		model,
		endpoint_transport: {
			base_url: BASE_URL,
			auth: "bearer",
		},
		model_catalog: entries.map((entry, index) => {
			const contextLimit = entry.contextWindow ?? 32_768;
			return {
				model_id: entry.id,
				provider_id: "meta",
				profile_id: "tbh",
				display_label: entry.name,
				visibility: "visible",
				display_order: index,
				is_default: index === 0,
				context_limit: contextLimit,
				output_limit: Math.min(entry.maxOutputTokens ?? 32_768, contextLimit),
				description: "Served by Phaseo",
			};
		}),
	}, null, 2)}\n`;
}

function paths(root: string): RunnerPaths {
	return {
		root,
		clineSettings: join(root, "cline", "settings"),
		clineData: join(root, "cline", "data"),
		kiloConfig: join(root, "kilo.jsonc"),
		ompAgent: join(root, "omp", "agent"),
		museConfigHome: join(root, "muse-config"),
	};
}

export function buildRunnerInvocation(
	runner: RunnerId,
	model: string,
	passthrough: string[],
	configPaths: RunnerPaths,
	env: NodeJS.ProcessEnv = process.env,
): RunnerInvocation {
	const childEnv: NodeJS.ProcessEnv = { ...env };
	if (runner === "cline") {
		return {
			command: COMMANDS[runner][0],
			args: ["--config", configPaths.clineSettings, "--data-dir", configPaths.clineData, "--provider", "phaseo", "--model", model, ...passthrough],
			env: { ...childEnv, PHASEO_CLINE_API_KEY: "<credential>" },
		};
	}
	if (runner === "kilo") {
		return {
			command: COMMANDS[runner][0],
			args: ["--model", `phaseo/${model}`, ...passthrough],
			env: { ...childEnv, KILO_CONFIG: configPaths.kiloConfig, PHASEO_KILO_API_KEY: "<credential>" },
		};
	}
	if (runner === "omp") {
		return {
			command: COMMANDS[runner][0],
			args: ["--model", `phaseo/${model}`, ...passthrough],
			env: { ...childEnv, PI_CODING_AGENT_DIR: configPaths.ompAgent, PHASEO_OMP_API_KEY: "<credential>" },
		};
	}
	return {
		command: COMMANDS[runner][0],
		args: passthrough,
		env: {
			...childEnv,
			MODEL_API_KEY: "<credential>",
			XDG_CONFIG_HOME: configPaths.museConfigHome,
		},
	};
}

async function resolveCommand(candidates: string[]): Promise<string> {
	for (const directory of (process.env.PATH || "").split(delimiter)) {
		if (!directory) continue;
		for (const candidate of candidates) {
			try {
				await access(join(directory, candidate), constants.F_OK);
				return join(directory, candidate);
			} catch {}
		}
	}
	throw new Error(`${candidates[0]} is not installed or is not available on PATH`);
}

async function prepareRunnerFiles(runner: RunnerId, pathsToUse: RunnerPaths, model: string, models: IntegrationModel[]): Promise<void> {
	if (runner === "cline") {
		await mkdir(pathsToUse.clineSettings, { recursive: true });
		await mkdir(pathsToUse.clineData, { recursive: true });
		await writeFile(join(pathsToUse.clineSettings, "providers.json"), renderClineProviders(model), { mode: 0o600 });
		await writeFile(join(pathsToUse.clineSettings, "models.json"), renderClineModels(modelEntry(model, models)), { mode: 0o600 });
		return;
	}
	if (runner === "kilo") {
		await writeFile(pathsToUse.kiloConfig, renderKiloConfig(model, models), { mode: 0o600 });
		return;
	}
	if (runner === "omp") {
		await mkdir(pathsToUse.ompAgent, { recursive: true });
		await writeFile(join(pathsToUse.ompAgent, "models.yml"), renderOmpModels(model, models), { mode: 0o600 });
		return;
	}
	if (runner === "muse") {
		await mkdir(join(pathsToUse.museConfigHome, "muse"), { recursive: true });
		await writeFile(join(pathsToUse.museConfigHome, "muse", "settings.json"), renderMuseSettings(model, models), { mode: 0o600 });
	}
}

function invocationForRuntime(invocation: RunnerInvocation, credential: string): RunnerInvocation {
	const env = { ...invocation.env };
	for (const name of ["PHASEO_CLINE_API_KEY", "PHASEO_KILO_API_KEY", "PHASEO_OMP_API_KEY"]) {
		if (env[name] === "<credential>") env[name] = credential;
	}
	if (env.MODEL_API_KEY === "<credential>") env.MODEL_API_KEY = credential;
	if (env.META_API_KEY !== undefined) env.META_API_KEY = credential;
	if (env.META_MODEL_API_KEY !== undefined) env.META_MODEL_API_KEY = credential;
	return { ...invocation, env };
}

function runChild(invocation: RunnerInvocation): Promise<void> {
	return new Promise((resolve, reject) => {
		const childInvocation = runnerChildInvocation(invocation);
		const child = spawn(childInvocation.command, childInvocation.args, {
			env: invocation.env,
			stdio: "inherit",
			shell: false,
			windowsHide: false,
		});
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code === 0) resolve();
			else reject(new Error(`${invocation.command} exited with ${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}`));
		});
	});
}

function quoteCmdToken(value: string): string {
	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
	return `"${value.replace(/["^]/g, (character) => `^${character}`)}"`;
}

export function runnerChildInvocation(
	invocation: RunnerInvocation,
	platform: NodeJS.Platform = process.platform,
	commandShell = process.env.ComSpec || "cmd.exe",
): { command: string; args: string[] } {
	if (platform !== "win32") return { command: invocation.command, args: invocation.args };
	const command = invocation.command.toLowerCase();
	if (command.endsWith(".ps1")) {
		return {
			command: "powershell.exe",
			args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", invocation.command, ...invocation.args],
		};
	}
	if (command.endsWith(".cmd") || command.endsWith(".bat")) {
		return {
			command: commandShell,
			args: ["/d", "/s", "/c", [invocation.command, ...invocation.args].map(quoteCmdToken).join(" ")],
		};
	}
	return { command: invocation.command, args: invocation.args };
}

function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
	const value = flags[key];
	return typeof value === "string" ? value : undefined;
}

function flagTrue(flags: Record<string, string | boolean>, key: string): boolean {
	return flags[key] === true || flags[key] === "true" || flags[key] === "1";
}

export async function runRunnerCommand(
	value: string,
	flags: Record<string, string | boolean>,
	passthrough: string[] = [],
): Promise<void> {
	const runner = normalizeRunnerName(value);
	const model = flagString(flags, "model") ?? DEFAULT_MODEL;
	const catalog = flagString(flags, "catalog") ?? "default";
	if (catalog !== "default" && catalog !== "all") throw new Error("--catalog must be all or default");
	const dryRun = flagTrue(flags, "dry-run");
	const json = flagTrue(flags, "json");
	const installPlan = !flagTrue(flags, "skip-install") ? await runnerInstallPlan(runner) : null;
	let models: IntegrationModel[] = [];
	if (catalog === "all") models = await fetchCompatibleModels();
	const previewRoot = join(tmpdir(), `phaseo-${runner}-<temporary>`);
	const previewPaths = paths(previewRoot);
	const preview = buildRunnerInvocation(runner, model, passthrough, previewPaths);

	if (dryRun) {
		const output = {
			runner,
			action: "run",
			dryRun: true,
			model,
			modelCount: modelEntry(model, models).length,
			install: installPlan ? renderInstallInvocation(installPlan) : null,
			command: preview.command,
			args: preview.args,
			credential: "inherited by the child process only",
			config: runner === "cline" ? "temporary Cline settings directory" : runner === "kilo" ? "temporary KILO_CONFIG file" : runner === "omp" ? "temporary PI_CODING_AGENT_DIR/models.yml" : "temporary XDG_CONFIG_HOME/muse/settings.json",
		};
		if (json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
		else {
			process.stdout.write(`Preview · ${runner}\n`);
			if (installPlan) process.stdout.write(`Install\n  ${renderInstallInvocation(installPlan)}\n`);
			process.stdout.write(`Launch\n  ${preview.command} ${preview.args.join(" ")}\n`);
			process.stdout.write(`Models\n  ${modelEntry(model, models).length} compatible model${modelEntry(model, models).length === 1 ? "" : "s"}\n`);
		}
		return;
	}

	if (installPlan) {
		const interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY);
		if (!interactive) throw new Error(`${runner} is not installed. Run this command in an interactive terminal to approve installation, install it manually with ${renderInstallInvocation(installPlan)}, or rerun with --skip-install after managing it separately.`);
		if (!await confirmHarnessInstall(runner, installPlan)) throw new Error(`${runner} installation cancelled`);
		await installHarness(installPlan);
	}

	const credential = await getIntegrationGatewayCredential(CREDENTIAL_IDS[runner]);
	const root = await mkdtemp(join(tmpdir(), `phaseo-${runner}-`));
	const configPaths = paths(root);
	try {
		await prepareRunnerFiles(runner, configPaths, model, modelEntry(model, models));
		const invocation = buildRunnerInvocation(runner, model, passthrough, configPaths);
		invocation.command = await resolveCommand(COMMANDS[runner]);
		await runChild(invocationForRuntime(invocation, credential));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
