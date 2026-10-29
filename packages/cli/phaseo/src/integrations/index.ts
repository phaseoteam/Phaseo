import { homedir } from "node:os";
import { codexAdapter } from "./adapters/codex.js";
import { claudeCodeAdapter } from "./adapters/claude-code.js";
import { deepSeekHarnessAdapter } from "./adapters/deepseek-harness.js";
import { openCodeAdapter } from "./adapters/opencode.js";
import { guidedAdapters } from "./adapters/guided.js";
import { piAdapter } from "./adapters/pi.js";
import { primeAgentAdapter } from "./adapters/prime-agent.js";
import { openClawAdapter } from "./adapters/openclaw.js";
import { hermesAdapter } from "./adapters/hermes.js";
import { zedAdapter } from "./adapters/zed.js";
import { aiderAdapter } from "./adapters/aider.js";
import { continueAdapter } from "./adapters/continue.js";
import { applyChanges, renderPlan } from "./files.js";
import { getIntegrationGatewayCredential, getLegacyIntegrationGatewayCredential, hasIntegrationGatewayCredential, revokeIntegrationGatewayCredential } from "./credential.js";
import { fetchIntegrationModels, supportsModelCatalog } from "./catalog.js";
import { confirmHarnessInstall, harnessInstallPlan, installHarness, isPrimaryHarness, renderInstallInvocation } from "./installer.js";
import { createSpinner, terminalUi } from "../output.js";
import type { IntegrationAdapter, IntegrationId, IntegrationOptions } from "./types.js";

const adapters: IntegrationAdapter[] = [codexAdapter, claudeCodeAdapter, openCodeAdapter, deepSeekHarnessAdapter, piAdapter, primeAgentAdapter, openClawAdapter, hermesAdapter, aiderAdapter, continueAdapter, zedAdapter, ...guidedAdapters];

function adapterFor(value: string | undefined): IntegrationAdapter {
	const aliases: Record<string, IntegrationId> = {
		claude: "claude-code",
		deepseek: "deepseek-harness",
		prime: "prime-agent",
		dsh: "deepseek-harness",
	};
	const normalized = value ? aliases[value] ?? value : value;
	const adapter = adapters.find((entry) => entry.id === normalized);
	if (!adapter) throw new Error(`Unknown integration: ${value || "(missing)"}. Supported: ${adapters.map((entry) => entry.id).join(", ")}`);
	return adapter;
}

export function isPrimarySetupName(value: string): boolean {
	try {
		return isPrimaryHarness(adapterFor(value).id);
	} catch {
		return false;
	}
}

export function isIntegrationSetupName(value: string): boolean {
	try {
		adapterFor(value);
		return true;
	} catch {
		return false;
	}
}

function isTrue(value: string | boolean | undefined): boolean {
	return value === true || value === "true" || value === "1";
}

function stringFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
	const value = flags[key];
	return typeof value === "string" ? value : undefined;
}

function printSetupInstructions(adapter: IntegrationAdapter, options: { homeDir: string; model?: string }): void {
	const instructions = adapter.setupInstructions?.(options);
	if (!instructions) return;
	process.stdout.write("Finish setup:\n");
	for (const [index, instruction] of instructions.entries()) {
		process.stdout.write(`  ${index + 1}. ${instruction}\n`);
	}
	if (!adapter.setupIsAutomatic) process.stdout.write(`  ${instructions.length + 1}. Copy the dedicated key with: phaseo integrations credential ${adapter.id}\n`);
	if (adapter.guideUrl) process.stdout.write(`Guide: ${adapter.guideUrl}\n`);
}

function printRemoveInstructions(adapter: IntegrationAdapter, options: { homeDir: string; model?: string }): void {
	const instructions = adapter.removeInstructions?.(options);
	if (!instructions) return;
	process.stdout.write("Finish cleanup:\n");
	for (const [index, instruction] of instructions.entries()) process.stdout.write(`  ${index + 1}. ${instruction}\n`);
}

export async function runIntegrationCommand(
	args: string[],
	flags: Record<string, string | boolean>,
	commandOptions: {
		installMissing?: boolean;
		primaryOnly?: boolean;
		confirmInstall?: typeof confirmHarnessInstall;
		interactive?: boolean;
	} = {},
): Promise<void> {
	const ui = terminalUi();
	const [command, integration, ...extra] = args;
	const invalidArgumentCount =
		(command === "credential" && args.length !== 1 && args.length !== 2) ||
		((command === "list" || command === "status") && args.length > 2) ||
		((command === "setup" || command === "remove") && args.length !== 2) ||
		extra.length > 0;
	if (invalidArgumentCount) {
		throw new Error("Usage: phaseo integrations list|status|setup|remove");
	}

	if (command === "credential") {
		if (!integration) {
			process.stdout.write(await getLegacyIntegrationGatewayCredential());
			return;
		}
		const adapter = adapterFor(integration);
		const credential = await getIntegrationGatewayCredential(adapter.id);
		process.stdout.write(credential);
		return;
	}

	if (command === "list" || command === "status") {
		const selected = integration ? [adapterFor(integration)] : adapters;
		const inspections = await Promise.all(selected.map((adapter) => adapter.inspect({ homeDir: homedir() })));
		if (isTrue(flags.json)) {
			process.stdout.write(`${JSON.stringify(inspections, null, 2)}\n`);
			return;
		}
		for (const item of inspections) {
			process.stdout.write(`${item.id.padEnd(14)} ${item.status.padEnd(13)} ${item.configPath}\n`);
			for (const detail of item.details) process.stdout.write(`  ${detail}\n`);
		}
		return;
	}

	if (command !== "setup" && command !== "remove") {
		throw new Error("Usage: phaseo integrations list|status|setup|remove");
	}

	const adapter = adapterFor(integration);
	if (commandOptions.primaryOnly && !isPrimaryHarness(adapter.id)) {
		throw new Error("Phaseo direct setup currently supports codex, claude-code, hermes, opencode, pi, prime-agent, deepseek-harness, and openclaw");
	}
	if (adapter.id === "claude-code" && stringFlag(flags, "model")) {
		throw new Error("--model is not supported for the Claude Code integration");
	}
	const catalog = stringFlag(flags, "catalog");
	if (catalog !== undefined && catalog !== "all" && catalog !== "default") {
		throw new Error("--catalog must be all or default");
	}
	if (catalog !== undefined && !supportsModelCatalog(adapter.id)) {
		throw new Error("--catalog is only supported for OpenCode, DeepSeek Harness, Pi, Prime Agent, and OpenClaw");
	}
	const json = isTrue(flags.json);
	const dryRun = isTrue(flags["dry-run"]);
	const interactive = commandOptions.interactive ?? (!json && !dryRun && Boolean(process.stdin.isTTY && process.stderr.isTTY));

	let catalogWarning: string | undefined;
	let models: IntegrationOptions["models"];
	if (command === "setup" && supportsModelCatalog(adapter.id) && catalog !== "default") {
		const spinner = createSpinner("Syncing compatible models", { enabled: interactive });
		try {
			models = await fetchIntegrationModels(adapter.id);
			if (models.length === 0) {
				spinner.stop();
				catalogWarning = "No compatible active models were returned; configured the default model only.";
			} else spinner.succeed(`Synced ${models.length} compatible models`);
		} catch (error) {
			spinner.stop();
			catalogWarning = `Could not sync the model catalog; configured the default model only. ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	const options: IntegrationOptions = { homeDir: homedir(), model: stringFlag(flags, "model"), models };
	let changes = command === "setup" ? await adapter.planSetup(options) : await adapter.planRemove(options);
	const installPlan = command === "setup" && commandOptions.installMissing && !isTrue(flags["skip-install"])
		? await harnessInstallPlan(adapter.id)
		: null;

	if (dryRun) {
		if (json) {
			process.stdout.write(`${JSON.stringify({
				integration: adapter.id as IntegrationId,
				action: command,
				dryRun: true,
				install: installPlan ? renderInstallInvocation(installPlan) : null,
				modelCount: models?.length ? models.length : 1,
				warning: catalogWarning,
				changes: changes.map(({ path, description, before, after }) => ({
					path,
					description,
					operation: after === null ? "delete" : before === null ? "create" : "update",
				})),
				credentials: command === "setup" && adapter.planCredential ? "stored automatically during setup" : undefined,
				instructions: command === "setup" ? adapter.setupInstructions?.(options) ?? [] : [],
				cleanupInstructions: command === "remove" ? adapter.removeInstructions?.(options) ?? [] : [],
			}, null, 2)}\n`);
			return;
		}
		process.stdout.write(`${ui.info(`Preview · ${adapter.name}`)}\n`);
		if (installPlan) process.stdout.write(`${ui.heading("Install")}\n  ${renderInstallInvocation(installPlan)}\n`);
		process.stdout.write(renderPlan(changes));
		if (catalogWarning) process.stdout.write(`${ui.warning(catalogWarning)}\n`);
		if (command === "setup") printSetupInstructions(adapter, options);
		else printRemoveInstructions(adapter, options);
		return;
	}

	if (installPlan) {
		if (!interactive) {
			throw new Error(
				`${adapter.name} is not installed. Run this command in an interactive terminal to approve installation, install it manually with ${renderInstallInvocation(installPlan)}, or rerun with --skip-install after managing it separately.`,
			);
		}
		const approved = await (commandOptions.confirmInstall ?? confirmHarnessInstall)(adapter.name, installPlan);
		if (!approved) throw new Error(`${adapter.name} installation cancelled`);
		const spinner = createSpinner(`Installing ${adapter.name}`, { enabled: interactive });
		if (!json && !spinner.active) process.stdout.write(`${ui.progress(`Installing ${adapter.name}`)}\n  ${ui.dim(renderInstallInvocation(installPlan))}\n`);
		try {
			await installHarness(installPlan, { quiet: json, capture: spinner.active });
			spinner.succeed(`${adapter.name} installed`);
		} catch (error) {
			spinner.fail(`Could not install ${adapter.name}`);
			throw error;
		}
		const inspection = await adapter.inspect(options);
		if (inspection.status === "not-installed") {
			throw new Error(`${adapter.name} was installed but is not available in this terminal yet. Open a new terminal and rerun the Phaseo setup command.`);
		}
	}

	let provisionedCredential = false;
	if (command === "setup") {
		const spinner = createSpinner("Preparing a dedicated credential", { enabled: interactive });
		try {
			const credentialExisted = await hasIntegrationGatewayCredential(adapter.id);
			const credential = await getIntegrationGatewayCredential(adapter.id);
			provisionedCredential = !credentialExisted;
			if (adapter.planCredential) changes = [...changes, ...await adapter.planCredential(options, credential)];
			spinner.succeed(credentialExisted ? "Reused the existing credential" : "Created a dedicated credential");
		} catch (error) {
			spinner.fail("Could not prepare the credential");
			if (provisionedCredential) await revokeIntegrationGatewayCredential(adapter.id).catch(() => undefined);
			throw error;
		}
	}

	if (json) {
		process.stdout.write(`${JSON.stringify({
			integration: adapter.id as IntegrationId,
			action: command,
			dryRun: false,
			install: installPlan ? renderInstallInvocation(installPlan) : null,
			modelCount: models?.length ? models.length : 1,
			warning: catalogWarning,
			changes: changes.map(({ path, description, before, after }) => ({
				path,
				description,
				operation: after === null ? "delete" : before === null ? "create" : "update",
			})),
			instructions: command === "setup" ? adapter.setupInstructions?.(options) ?? [] : [],
			cleanupInstructions: command === "remove" ? adapter.removeInstructions?.(options) ?? [] : [],
		}, null, 2)}\n`);
	} else {
		process.stdout.write(renderPlan(changes));
		if (catalogWarning) process.stdout.write(`${ui.warning(catalogWarning)}\n`);
	}

	const configurationSpinner = createSpinner(command === "setup" ? `Configuring ${adapter.name}` : `Removing ${adapter.name} configuration`, { enabled: interactive });
	try {
		await applyChanges(changes);
		if (command === "setup") await adapter.applySetup?.(options);
		else await adapter.applyRemove?.(options);
		configurationSpinner.succeed(command === "setup" ? `${adapter.name} configured` : `${adapter.name} configuration removed`);
	} catch (error) {
		configurationSpinner.fail(command === "setup" ? `Could not configure ${adapter.name}` : `Could not remove ${adapter.name}`);
		if (provisionedCredential) await revokeIntegrationGatewayCredential(adapter.id).catch(() => undefined);
		throw error;
	}
	if (command === "remove") await revokeIntegrationGatewayCredential(adapter.id);
	if (!json) {
		const outcome = command === "remove"
			? "disconnected"
			: adapter.setupInstructions && !adapter.setupIsAutomatic
				? "ready to finish in the application"
				: "configured";
		process.stdout.write(`${ui.success(`${adapter.name} is now ${outcome}.`)}\n`);
	}
	if (command === "setup" && !json && adapter.setupInstructions) {
		printSetupInstructions(adapter, options);
	}
	if (command === "remove" && !json) printRemoveInstructions(adapter, options);
}
