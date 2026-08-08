import { homedir } from "node:os";
import { codexAdapter } from "./adapters/codex.js";
import { claudeCodeAdapter } from "./adapters/claude-code.js";
import { applyChanges, renderPlan } from "./files.js";
import type { IntegrationAdapter, IntegrationId } from "./types.js";

const adapters: IntegrationAdapter[] = [codexAdapter, claudeCodeAdapter];

function adapterFor(value: string | undefined): IntegrationAdapter {
	const adapter = adapters.find((entry) => entry.id === value);
	if (!adapter) throw new Error(`Unknown integration: ${value || "(missing)"}. Supported: ${adapters.map((entry) => entry.id).join(", ")}`);
	return adapter;
}

function isTrue(value: string | boolean | undefined): boolean {
	return value === true || value === "true" || value === "1";
}

function stringFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
	const value = flags[key];
	return typeof value === "string" ? value : undefined;
}

export async function runIntegrationCommand(
	command: string | undefined,
	integration: string | undefined,
	flags: Record<string, string | boolean>,
): Promise<void> {
	if (command === "credential") {
		const credential = process.env.PHASEO_API_KEY;
		if (!credential) throw new Error("PHASEO_API_KEY is not set");
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
		throw new Error("Usage: phaseo integrations list|status|setup|remove|credential");
	}

	const adapter = adapterFor(integration);
	const options = { homeDir: homedir(), model: stringFlag(flags, "model") };
	const changes = command === "setup" ? await adapter.planSetup(options) : await adapter.planRemove(options);

	if (isTrue(flags.json)) {
		process.stdout.write(`${JSON.stringify({
			integration: adapter.id as IntegrationId,
			action: command,
			dryRun: isTrue(flags["dry-run"]),
			changes: changes.map(({ path, description, before, after }) => ({
				path,
				description,
				operation: after === null ? "delete" : before === null ? "create" : "update",
			})),
		}, null, 2)}\n`);
		if (isTrue(flags["dry-run"])) return;
	} else {
		process.stdout.write(renderPlan(changes));
		if (isTrue(flags["dry-run"])) return;
	}

	await applyChanges(changes);
	if (!isTrue(flags.json)) process.stdout.write(`${adapter.name} is now ${command === "setup" ? "configured" : "disconnected"}.\n`);
}
