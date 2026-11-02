import type { Account, Harness, ModelOption, ModelOptionValues } from "../../shared/workspace";
import type { AgentProfile } from "../../shared/factory/types";

/**
 * Factory's agents are the desktop's own: every model on every usable account of every harness that can run a stage,
 * found through the same model discovery as the composer. Nothing here signs in or spawns anything itself.
 */

/** Harnesses a stage can run on: the ones agents can delegate to by name. */
export const factoryHarnesses = ["claude", "codex", "phaseo", "opencode", "pi", "cursor", "grok"] as const satisfies readonly Harness[];
/** Phaseo and Cursor run only on a connected account; the rest also run on the harness's own sign-in. */
const accountRequired = (harness: Harness) => harness === "phaseo" || harness === "cursor";
/** A catalog can list hundreds of models; the picker offers this many per account, current ones first. */
const MODELS_PER_ACCOUNT = 30;
/** The per-model settings that are a reasoning level, by the id each harness gives them. */
const EFFORT_SETTINGS = ["effort", "reasoningEffort", "reasoning", "thinking"];

export interface AgentDiscoveryHost {
	accounts(): Account[];
	discoverModels?: (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
	discoverInstallations?: () => Promise<{ harness: Harness; installed: boolean }[]>;
}

/** `<harness>:<account id or "default">:<model>`. Model ids may contain colons; harness and account ids don't. */
export function agentId(harness: Harness, accountId: string | undefined, model: string): string {
	return `${harness}:${accountId ?? "default"}:${model}`;
}

export function parseAgentId(id: string): { harness: Harness; accountId?: string; model: string } | null {
	const match = /^([a-z]+):([^:]+):(.+)$/.exec(id);
	if (!match || !(factoryHarnesses as readonly string[]).includes(match[1]!)) return null;
	return { harness: match[1] as Harness, ...(match[2] !== "default" ? { accountId: match[2] } : {}), model: match[3]! };
}

const usable = (account: Account, harness: Harness) => account.harness === harness && account.configured && !account.archived && !(account.oauthExpiresAt && Date.parse(account.oauthExpiresAt) <= Date.now());

/** The reasoning levels a model takes, and which setting carries the chosen one, the way the composer reads them. */
export function effortsOf(harness: Harness, model: ModelOption): Pick<AgentProfile, "efforts" | "defaultEffort" | "effortSetting"> {
	if (harness === "codex" || harness === "grok") {
		const efforts = model.reasoningEfforts?.map((effort) => effort.id) ?? [];
		return efforts.length ? { efforts, defaultEffort: model.defaultReasoningEffort, effortSetting: "reasoningEffort" } : {};
	}
	const option = model.options?.find((candidate) => candidate.type === "select" && EFFORT_SETTINGS.includes(candidate.id));
	if (!option || option.type !== "select" || !option.options.length) return {};
	return { efforts: option.options.map((choice) => choice.id), defaultEffort: option.options.find((choice) => choice.isDefault)?.id, effortSetting: option.id };
}

/** An agent for one model on one account (or the harness's own sign-in). */
export function agentFor(harness: Harness, account: Account | undefined, model: ModelOption): AgentProfile {
	return {
		id: agentId(harness, account?.id, model.id),
		harness,
		...(account ? { accountId: account.id, accountName: account.name } : {}),
		label: model.name || model.id,
		model: model.id,
		billing: harness === "phaseo" || account?.kind === "api" ? "api" : "subscription",
		connectionId: `${harness}:${account?.id ?? "default"}`,
		...(model.description ? { description: model.description } : {}),
		...effortsOf(harness, model),
		...(model.default ? { isDefault: true } : {}),
	};
}

/**
 * The thread settings that carry an agent's effort: Codex and Grok take `reasoningEffort`; the others a model option, as
 * the composer stores them. An effort the model doesn't offer is left out, so the harness uses its own.
 */
export function effortSettings(agent: Pick<AgentProfile, "effort" | "efforts" | "effortSetting">): { reasoningEffort?: string; modelOptions?: ModelOptionValues } {
	if (!agent.effort || !agent.effortSetting || (agent.efforts && !agent.efforts.includes(agent.effort))) return {};
	return agent.effortSetting === "reasoningEffort" ? { reasoningEffort: agent.effort } : { modelOptions: { [agent.effortSetting]: agent.effort } };
}

/** Every agent the desktop can run a stage on now. A harness that isn't installed, or whose discovery fails, is left out. */
export async function discoverAgents(host: AgentDiscoveryHost): Promise<AgentProfile[]> {
	const discover = host.discoverModels;
	if (!discover) return [];
	const installations = await host.discoverInstallations?.().catch(() => []) ?? [];
	const accounts = host.accounts();
	const targets: { harness: Harness; account?: Account }[] = [];
	for (const harness of factoryHarnesses) {
		if (installations.find((value) => value.harness === harness)?.installed === false) continue;
		const usableAccounts = accounts.filter((account) => usable(account, harness));
		if (accountRequired(harness) || usableAccounts.length) for (const account of usableAccounts) targets.push({ harness, account });
		else targets.push({ harness });
	}
	const agents: AgentProfile[] = [];
	// Native discovery starts processes: two at a time.
	for (let index = 0; index < targets.length; index += 2) {
		const found = await Promise.all(targets.slice(index, index + 2).map(async ({ harness, account }) => {
			const models = await discover(harness, account?.id).catch(() => [] as ModelOption[]);
			// "default" follows whatever the harness is set to; a stage names its model.
			const current = models.filter((model) => !model.legacy && model.id && model.id !== "default").slice(0, MODELS_PER_ACCOUNT);
			return current.map((model) => agentFor(harness, account, model));
		}));
		agents.push(...found.flat());
	}
	return agents;
}

/**
 * An agent from Factory's own app, by its old id, as one of these: Claude Code ids were `claude-<model>` (`claude-opus`),
 * Codex's `codex-<model>` or `codex-default`, the hub's `hub-<claude model>` and `hub-codex-<model>`. The best match is
 * the same harness's model of that name, or one whose id contains it (`opus` → `claude-opus-5-5`), on its own sign-in
 * first. Nothing matching leaves it unassigned.
 */
export function legacyAgent(oldId: string, agents: AgentProfile[]): string | undefined {
	if (agents.some((agent) => agent.id === oldId)) return oldId;
	const hint = /^hub-codex-(.+)$/.exec(oldId) ? { harness: "codex", model: oldId.slice("hub-codex-".length) }
		: /^hub-(.+)$/.exec(oldId) ? { harness: "claude", model: oldId.slice("hub-".length) }
			: oldId === "codex-default" ? { harness: "codex", model: "" }
				: /^codex-(.+)$/.exec(oldId) ? { harness: "codex", model: oldId.slice("codex-".length) }
					: /^claude-(.+)$/.exec(oldId) ? { harness: "claude", model: oldId.slice("claude-".length) }
						: null;
	if (!hint) return undefined;
	// The harness's own sign-in first, then accounts in the order Settings lists them.
	const candidates = agents.filter((agent) => agent.harness === hint.harness).sort((a, b) => Number(Boolean(a.accountId)) - Number(Boolean(b.accountId)));
	if (!hint.model) return (candidates.find((agent) => agent.isDefault) ?? candidates[0])?.id;
	const model = hint.model.toLowerCase();
	const exact = candidates.find((agent) => [model, `claude-${model}`].includes(agent.model.toLowerCase()));
	return (exact ?? candidates.find((agent) => agent.model.toLowerCase().includes(model)))?.id;
}
