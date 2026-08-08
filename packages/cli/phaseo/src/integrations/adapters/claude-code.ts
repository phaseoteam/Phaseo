import { join } from "node:path";
import { readOptionalFile } from "../files.js";
import type { FileChange, IntegrationAdapter, IntegrationOptions } from "../types.js";

const BASE_URL = "https://api.phaseo.app";
const HELPER = "phaseo integrations credential";
const MANAGED_PATH = ["env", "ANTHROPIC_BASE_URL"] as const;

function settingsPath(options: IntegrationOptions): string {
	return join(options.homeDir, ".claude", "settings.json");
}

function parseSettings(path: string, input: string | null): Record<string, unknown> {
	if (input === null || input.trim() === "") return {};
	try {
		const value = JSON.parse(input);
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("root must be an object");
		return value as Record<string, unknown>;
	} catch (error) {
		throw new Error(`Cannot update malformed Claude Code settings at ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function envObject(settings: Record<string, unknown>): Record<string, unknown> {
	const env = settings.env;
	if (env === undefined) return {};
	if (!env || typeof env !== "object" || Array.isArray(env)) throw new Error("Claude Code settings env must be an object");
	return { ...(env as Record<string, unknown>) };
}

export function renderClaudeSettings(path: string, before: string | null): string {
	const settings = parseSettings(path, before);
	const env = envObject(settings);
	env.ANTHROPIC_BASE_URL = BASE_URL;
	env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1";
	settings.env = env;
	settings.apiKeyHelper = HELPER;
	return `${JSON.stringify(settings, null, 2)}\n`;
}

export const claudeCodeAdapter: IntegrationAdapter = {
	id: "claude-code",
	name: "Claude Code",
	async inspect(options) {
		const path = settingsPath(options);
		const current = await readOptionalFile(path);
		if (current === null) return { id: "claude-code", name: "Claude Code", status: "available", configPath: path, details: [] };
		const settings = parseSettings(path, current);
		const env = envObject(settings);
		const base = env[MANAGED_PATH[1]];
		const helper = settings.apiKeyHelper;
		const configured = base === BASE_URL && helper === HELPER;
		const conflict = (base !== undefined && base !== BASE_URL) || (helper !== undefined && helper !== HELPER);
		return {
			id: "claude-code",
			name: "Claude Code",
			status: configured ? "configured" : conflict ? "conflict" : "available",
			configPath: path,
			details: configured
				? ["Gateway model discovery enabled", "Credential source: Phaseo CLI helper"]
				: conflict
					? ["Existing gateway or apiKeyHelper configuration would be replaced."]
					: [],
		};
	},
	async planSetup(options) {
		const path = settingsPath(options);
		const before = await readOptionalFile(path);
		const after = renderClaudeSettings(path, before);
		if (before === after) return [];
		return [{ path, before, after, description: "Configure Claude Code to use the Phaseo gateway" }];
	},
	async planRemove(options) {
		const path = settingsPath(options);
		const before = await readOptionalFile(path);
		if (before === null) return [];
		const settings = parseSettings(path, before);
		const env = envObject(settings);
		if (env.ANTHROPIC_BASE_URL === BASE_URL) delete env.ANTHROPIC_BASE_URL;
		if (env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY === "1") delete env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY;
		if (settings.apiKeyHelper === HELPER) delete settings.apiKeyHelper;
		if (Object.keys(env).length === 0) delete settings.env;
		else settings.env = env;
		const after = `${JSON.stringify(settings, null, 2)}\n`;
		if (after === before) return [];
		return [{ path, before, after, description: "Remove Phaseo from Claude Code settings" }];
	},
};
