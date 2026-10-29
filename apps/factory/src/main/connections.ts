import { spawn } from "node:child_process";
import type { AgentProfile, Connection, FactorySettings } from "../shared/types";
import { claudeSignIn, modelCatalog, type CatalogModel, type ModelCatalog } from "./models";

/** Finds the agent tools on this machine: subscription CLIs on PATH, a local hub, and the Phaseo API. */

/** Runs a fixed command (no user input) through the shell, so npm `.cmd` shims resolve on Windows. */
function version(command: string): Promise<string | null> {
	return new Promise((resolve) => {
		const child = spawn(command, ["--version"], { shell: true, windowsHide: true, env: agentEnvironment() });
		let out = "";
		const timer = setTimeout(() => {
			child.kill();
			resolve(null);
		}, 8_000);
		child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
		child.on("error", () => resolve(null));
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve(code === 0 ? (out.match(/\d+\.\d+\.\d+[\w.-]*/)?.[0] ?? out.trim()) : null);
		});
	});
}

/**
 * Variables that send Claude Code to an API key or another server instead of the plan it's signed in
 * with. A subscription run leaves them out, so it's always billed to, and limited by, the person's own plan.
 */
export const API_AUTH = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"] as const;

export function onClaudePlan(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const next = { ...env };
	for (const name of API_AUTH) delete next[name];
	return next;
}

/** The environment agents run with: the user's, minus Electron's own switches. */
export function agentEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const env = { ...process.env, ...extra };
	delete env.ELECTRON_RUN_AS_NODE;
	delete env.ELECTRON_NO_ATTACH_CONSOLE;
	return env;
}

/** Asks the hub which models it serves, with its key, the way agents' runs will reach it. */
export async function probeHub(baseUrl: string, key: string): Promise<Pick<Connection, "status" | "detail" | "models">> {
	try {
		const response = await fetch(new URL("/v1/models", baseUrl), { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(2_000) });
		if (response.status === 401 || response.status === 403) return { status: "error", detail: key ? "Turned down this key" : "Asks for a key. Add the hub's key below." };
		if (!response.ok) return { status: "error", detail: `Answered ${response.status}` };
		const body = (await response.json()) as { data?: { id?: unknown }[] };
		const models = (body.data ?? []).map((model) => model.id).filter((id): id is string => typeof id === "string");
		return { status: "ready", detail: `${models.length} models available`, models };
	} catch {
		return { status: "missing", detail: "Not reachable" };
	}
}

/** The tools on this computer, and the models each one offers. */
export async function detectConnections(settings: FactorySettings): Promise<{ connections: Connection[]; catalog: ModelCatalog }> {
	const [claude, codex, hub] = await Promise.all([version("claude"), version("codex"), probeHub(settings.hubUrl, settings.hubKey)]);
	const catalog = await modelCatalog({ claude: claude ?? undefined, codex: codex ?? undefined });
	const connections: Connection[] = [
		{ id: "claude-cli", kind: "claude-cli", label: "Claude Code", status: claude ? "ready" : "missing", detail: claude ? claudeSignIn(catalog.claudeAccount) ?? "Uses the subscription Claude Code is signed in with" : "Install Claude Code and sign in", version: claude ?? undefined, slots: 3 },
		{ id: "codex-cli", kind: "codex-cli", label: "Codex", status: codex ? "ready" : "missing", detail: codex ? "Uses the ChatGPT plan Codex is signed in with" : "Install Codex and sign in", version: codex ?? undefined, slots: 3, windows: catalog.codexLimits?.length ? catalog.codexLimits : undefined },
		{ id: "hub", kind: "hub", label: "CLI proxy hub", baseUrl: settings.hubUrl, slots: 6, ...hub },
		{ id: "phaseo", kind: "phaseo", label: "Phaseo API", status: "off", detail: "Add a key to run on pay-as-you-go credits", slots: 16 },
	];
	return { connections, catalog };
}

/** Used when a tool doesn't say which models it has: the ones every recent version takes. */
const CLAUDE_FALLBACK: CatalogModel[] = [
	{ id: "opus", label: "Opus", efforts: [], isDefault: true },
	{ id: "sonnet", label: "Sonnet", efforts: [] },
];

/**
 * The agents people can assign: one per model each ready tool offers, named and described the way the
 * tool describes them. Ids stay stable (claude-opus, codex-default), so assignments survive new models.
 */
export function agentsFor(connections: Connection[], catalog: ModelCatalog = {}, settings?: Pick<FactorySettings, "agentEfforts">): AgentProfile[] {
	const ready = new Set(connections.filter((connection) => connection.status === "ready").map((connection) => connection.id));
	const agents: AgentProfile[] = [];
	const add = (agent: AgentProfile) => {
		const effort = settings?.agentEfforts?.[agent.id];
		agents.push({ ...agent, effort: effort && agent.efforts?.includes(effort) ? effort : undefined });
	};
	if (ready.has("claude-cli")) {
		for (const model of catalog.claude ?? CLAUDE_FALLBACK) add({ id: `claude-${model.id.replace(/^claude-/, "")}`, harness: "claude", label: model.label, model: model.id, billing: "subscription", connectionId: "claude-cli", description: model.description, efforts: model.efforts, defaultEffort: model.defaultEffort, isDefault: model.isDefault });
	}
	if (ready.has("codex-cli")) {
		const models = catalog.codex ?? [];
		const fallback = models.find((model) => model.isDefault);
		// Codex's default model runs without --model, so it follows whatever Codex is set to use.
		add({ id: "codex-default", harness: "codex", label: fallback?.label ?? "Codex", model: "", billing: "subscription", connectionId: "codex-cli", description: fallback ? `Codex's default. ${fallback.description ?? ""}`.trim() : "Whatever model Codex is set to use", efforts: fallback?.efforts, defaultEffort: fallback?.defaultEffort, isDefault: true });
		for (const model of models.filter((entry) => !entry.isDefault)) add({ id: `codex-${model.id}`, harness: "codex", label: model.label, model: model.id, billing: "subscription", connectionId: "codex-cli", description: model.description, efforts: model.efforts, defaultEffort: model.defaultEffort });
	}
	// A hub runs the same tools pointed at it, so it offers each of their models that it serves.
	const hub = connections.find((connection) => connection.id === "hub" && connection.status === "ready");
	if (hub) {
		const serves = new Set(hub.models ?? []);
		if (ready.has("claude-cli")) {
			for (const model of catalog.claude ?? CLAUDE_FALLBACK) {
				if (model.resolved && !serves.has(model.resolved)) continue;
				add({ id: `hub-${model.id.replace(/^claude-/, "")}`, harness: "claude", label: model.label, model: model.id, billing: "hub", connectionId: "hub", description: model.description, efforts: model.efforts, defaultEffort: model.defaultEffort });
			}
		}
		if (ready.has("codex-cli")) {
			for (const model of catalog.codex ?? []) {
				if (!serves.has(model.id)) continue;
				add({ id: `hub-codex-${model.id}`, harness: "codex", label: model.label, model: model.id, billing: "hub", connectionId: "hub", description: model.description, efforts: model.efforts, defaultEffort: model.defaultEffort });
			}
		}
	}
	return agents;
}
