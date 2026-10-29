import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { UsageWindow } from "../shared/types";
import { askClaudeCode } from "./claude";
import { agentEnvironment, onClaudePlan } from "./connections";

/**
 * Asks Claude Code and Codex which models they offer, through their SDKs: the Agent SDK's
 * `supportedModels`, which also says how Claude is signed in, and Codex's `model/list` on
 * its app-server. Both describe each model and the reasoning levels it takes, so Factory offers what
 * the tools on this computer actually have instead of a fixed list.
 */

export interface CatalogModel {
	/** What the tool takes as --model: Claude Code's alias ("opus"), or Codex's model id. */
	id: string;
	/** The name people know, for example "Opus 5.5" or "GPT-6.1-Sol". */
	label: string;
	/** The model an alias runs, for example "claude-opus-5-5", so a hub can be checked for it. */
	resolved?: string;
	description?: string;
	/** Reasoning effort levels, lowest first. */
	efforts: string[];
	defaultEffort?: string;
	/** The model the tool uses when none is named. */
	isDefault?: boolean;
}

export interface ModelCatalog {
	claude?: CatalogModel[];
	/** The sign-in Claude Code would use: a plan, or an API key and where it comes from. */
	claudeAccount?: { email?: string; subscriptionType?: string; apiKeySource?: string; tokenSource?: string; apiProvider?: string };
	codex?: CatalogModel[];
	/** Codex's usage windows for the signed-in plan. */
	codexLimits?: UsageWindow[];
}

/** Each tool gets this long to answer before Factory falls back to its own short list. */
const TIMEOUT = 20_000;
/** Models change with the tool's version; usage changes as you work, so the answer is kept this long. */
const KEEP_FOR = 10 * 60_000;

function jsonLines(child: ChildProcessWithoutNullStreams, onMessage: (message: Record<string, unknown>) => void) {
	let buffered = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		buffered += chunk;
		const lines = buffered.split("\n");
		buffered = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				onMessage(JSON.parse(line) as Record<string, unknown>);
			} catch {
				// Not every line a tool prints is JSON.
			}
		}
	});
}

/** Spawns a tool with fixed arguments and resolves with whatever `talk` settles on, or null if it takes too long. */
function ask<T>(command: string, args: string[], talk: (child: ChildProcessWithoutNullStreams, done: (value: T) => void) => void): Promise<T | null> {
	return new Promise((resolve) => {
		// Fixed arguments only, through the shell so npm's .cmd shims resolve on Windows.
		const child = spawn(command, args, { shell: true, windowsHide: true, env: agentEnvironment() });
		let settled = false;
		const finish = (value: T | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.kill();
			resolve(value);
		};
		const timer = setTimeout(() => finish(null), TIMEOUT);
		child.on("error", () => finish(null));
		child.on("close", () => finish(null));
		child.stdin.on("error", () => undefined);
		talk(child, finish);
	});
}

interface ClaudeModelInfo {
	value: string;
	resolvedModel?: string;
	displayName?: string;
	description?: string;
	supportedEffortLevels?: string[];
}

/** "Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok" → the name, then the rest. */
export function claudeModels(models: ClaudeModelInfo[]): CatalogModel[] {
	const fallback = models.find((model) => model.value === "default")?.resolvedModel;
	return models.filter((model) => model.value !== "default" && /^[\w.-]+$/.test(model.value)).map((model) => {
		// Older versions of Claude Code put the name first ("Opus 5.5 · Best for…"); newer ones give it as displayName.
		const [first, ...rest] = (model.description ?? "").split(" · ");
		const named = Boolean(first && /\d/.test(first));
		return {
			id: model.value,
			label: named ? first! : model.displayName ?? model.value,
			// "claude-opus-5-5[1m]" is the same model with a longer context.
			resolved: model.resolvedModel?.replace(/\[.*\]$/, ""),
			description: (named ? rest.join(" · ") : model.description) || undefined,
			efforts: model.supportedEffortLevels ?? [],
			isDefault: Boolean(fallback && model.resolvedModel === fallback) || undefined,
		};
	}).filter((model, index, all) => !model.isDefault || all.findIndex((other) => other.isDefault) === index);
}

async function askClaude(): Promise<Pick<ModelCatalog, "claude" | "claudeAccount"> | null> {
	// Asked the way subscription runs start, so the sign-in it reports is the one they use.
	const answer = await askClaudeCode(onClaudePlan(agentEnvironment()), TIMEOUT);
	if (!answer) return null;
	const { email, subscriptionType, apiKeySource, tokenSource, apiProvider } = answer.account;
	return { claude: answer.models.length ? claudeModels(answer.models) : undefined, claudeAccount: { email, subscriptionType, apiKeySource, tokenSource, apiProvider } };
}

/** How Claude is signed in, in a few words: a plan, or wherever its key comes from. */
export function claudeSignIn(account: ModelCatalog["claudeAccount"]): string | undefined {
	if (!account) return undefined;
	if (account.apiProvider && account.apiProvider !== "firstParty") return `Runs on ${account.apiProvider}, not a Claude plan`;
	if (account.apiKeySource && account.apiKeySource !== "none") return `Uses an API key from ${account.apiKeySource}, not a Claude plan`;
	// A token set in the environment (a proxy, say) wins over the plan Claude Code is signed in with.
	if (account.tokenSource && account.tokenSource !== "claude.ai" && !account.subscriptionType) return `Uses ${account.tokenSource} from the environment, not your Claude plan`;
	// "max" or "Claude Team": either way, "your Claude Max plan".
	const plan = account.subscriptionType?.replace(/^claude\s+/i, "");
	if (plan) return `Uses your Claude ${plan[0]!.toUpperCase()}${plan.slice(1)} plan${account.email ? `, signed in as ${account.email}` : ""}`;
	return account.email ? `Signed in as ${account.email}` : undefined;
}

interface CodexModelInfo {
	id: string;
	model?: string;
	displayName?: string;
	description?: string;
	hidden?: boolean;
	isDefault?: boolean;
	supportedReasoningEfforts?: { reasoningEffort: string }[];
	defaultReasoningEffort?: string;
}

interface CodexWindow {
	usedPercent?: number;
	windowDurationMins?: number;
	resetsAt?: number;
}

export function codexModels(models: CodexModelInfo[]): CatalogModel[] {
	return models.filter((model) => !model.hidden && /^[\w.:/-]+$/.test(model.model ?? model.id)).map((model) => ({
		id: model.model ?? model.id,
		label: model.displayName ?? model.id,
		description: model.description,
		efforts: (model.supportedReasoningEfforts ?? []).map((effort) => effort.reasoningEffort),
		defaultEffort: model.defaultReasoningEffort,
		isDefault: model.isDefault || undefined,
	}));
}

/** "5-hour window", "Weekly": Codex gives each window's length in minutes. */
export function codexWindows(limits: { primary?: CodexWindow | null; secondary?: CodexWindow | null } | undefined): UsageWindow[] {
	const label = (minutes = 0) => (minutes >= 10_000 ? "Weekly" : minutes >= 1_440 ? `${Math.round(minutes / 1_440)}-day window` : `${Math.round(minutes / 60)}-hour window`);
	return [limits?.primary, limits?.secondary]
		.filter((window): window is CodexWindow => Boolean(window && window.usedPercent !== undefined))
		.map((window) => ({ label: label(window.windowDurationMins), used: Math.min(1, (window.usedPercent ?? 0) / 100), resetsAt: window.resetsAt ? window.resetsAt * 1000 : undefined }));
}

async function askCodex(): Promise<Pick<ModelCatalog, "codex" | "codexLimits"> | null> {
	return ask("codex", ["app-server"], (child, done: (value: Pick<ModelCatalog, "codex" | "codexLimits"> | null) => void) => {
		const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
		const models: CodexModelInfo[] = [];
		let id = 1;
		const list = (cursor?: string) => send({ id: ++id, method: "model/list", params: { limit: 100, ...(cursor ? { cursor } : {}) } });
		let limitsId = 0;
		jsonLines(child, (message) => {
			if (message.id === 1) {
				send({ method: "initialized" });
				list();
			} else if (message.id === limitsId) {
				const result = message.result as { rateLimits?: { primary?: CodexWindow; secondary?: CodexWindow } } | undefined;
				done({ codex: codexModels(models), codexLimits: codexWindows(result?.rateLimits) });
			} else if (typeof message.id === "number") {
				const result = message.result as { data?: CodexModelInfo[]; nextCursor?: string | null } | undefined;
				if (!result) return done(models.length ? { codex: codexModels(models) } : null);
				models.push(...(result.data ?? []));
				if (result.nextCursor) return list(result.nextCursor);
				limitsId = ++id;
				send({ id: limitsId, method: "account/rateLimits/read" });
			}
		});
		send({ id: 1, method: "initialize", params: { clientInfo: { name: "phaseo-factory", title: "Phaseo Factory", version: "0.1.0" } } });
	});
}

let cached: { key: string; at: number; catalog: ModelCatalog } | null = null;
let pending: Promise<ModelCatalog> | null = null;

/** What each installed tool offers. Asked again when a version changes, or after a while for fresh usage. */
export async function modelCatalog(versions: { claude?: string; codex?: string }): Promise<ModelCatalog> {
	const key = `${versions.claude ?? "-"}|${versions.codex ?? "-"}`;
	if (cached?.key === key && Date.now() - cached.at < KEEP_FOR) return cached.catalog;
	pending ??= (async () => {
		const [claude, codex] = await Promise.all([versions.claude ? askClaude() : null, versions.codex ? askCodex() : null]);
		// A tool that didn't answer this time keeps what it said last time.
		const catalog: ModelCatalog = { claude: claude?.claude ?? cached?.catalog.claude, claudeAccount: claude?.claudeAccount ?? cached?.catalog.claudeAccount, codex: codex?.codex ?? cached?.catalog.codex, codexLimits: codex?.codexLimits ?? cached?.catalog.codexLimits };
		cached = { key, at: Date.now(), catalog };
		return catalog;
	})().finally(() => {
		pending = null;
	});
	return pending;
}
