import { join } from "node:path";
import { isCommandAvailable, readOptionalFile } from "../files.js";
import type { FileChange, IntegrationAdapter, IntegrationOptions } from "../types.js";

const BASE_URL = "https://api.phaseo.app";
const HELPER = "phaseo integrations credential claude-code";
const HELPER_TTL_MS = "300000";
const MANAGED_PATH = ["env", "ANTHROPIC_BASE_URL"] as const;
const SHADOWING_CREDENTIALS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;

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
	if (env.ANTHROPIC_BASE_URL !== undefined && env.ANTHROPIC_BASE_URL !== BASE_URL) {
		throw new Error("Claude Code already has a different ANTHROPIC_BASE_URL");
	}
	if (settings.apiKeyHelper !== undefined && settings.apiKeyHelper !== HELPER) {
		throw new Error("Claude Code already has a different apiKeyHelper");
	}
	for (const key of SHADOWING_CREDENTIALS) {
		if (env[key] !== undefined && env[key] !== "") {
			throw new Error(`Claude Code settings already define ${key}; remove it before enabling the Phaseo credential helper`);
		}
	}
	env.ANTHROPIC_BASE_URL = BASE_URL;
	if (env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS === undefined) env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS = HELPER_TTL_MS;
	for (const key of SHADOWING_CREDENTIALS) env[key] = "";
	settings.env = env;
	settings.apiKeyHelper = HELPER;
	return `${JSON.stringify(settings, null, 2)}\n`;
}

export const claudeCodeAdapter: IntegrationAdapter = {
	id: "claude-code",
	name: "Claude Code",
	// User MCP servers live in ~/.claude.json, which Claude Code rewrites constantly; leave it to `claude mcp add`.
	setupTips: () => ["give Claude Code live Phaseo model, pricing and usage tools with: claude mcp add --scope user phaseo -- phaseo mcp"],
	async inspect(options) {
		const path = settingsPath(options);
		const current = await readOptionalFile(path);
		if (current === null) {
			const installed = await isCommandAvailable(["claude", "claude.exe", "claude.cmd", "claude.ps1"]);
			return { id: "claude-code", name: "Claude Code", status: installed ? "available" : "not-installed", configPath: path, details: [] };
		}
		const settings = parseSettings(path, current);
		const env = envObject(settings);
		const base = env[MANAGED_PATH[1]];
		const helper = settings.apiKeyHelper;
		const credentialsShadowHelper = SHADOWING_CREDENTIALS.some((key) => env[key] !== undefined && env[key] !== "");
		const configured = base === BASE_URL && helper === HELPER && !credentialsShadowHelper;
		const conflict = (base !== undefined && base !== BASE_URL) || (helper !== undefined && helper !== HELPER) || credentialsShadowHelper;
		return {
			id: "claude-code",
			name: "Claude Code",
			status: configured ? "configured" : conflict ? "conflict" : "available",
			configPath: path,
			details: configured
				? ["Phaseo gateway enabled", "Credential source: Phaseo CLI session or PHASEO_API_KEY"]
				: conflict
					? ["Remove the existing gateway or credential setting before setup."]
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
		if (settings.apiKeyHelper !== HELPER) return [];
		const env = envObject(settings);
		let changed = false;
		if (env.ANTHROPIC_BASE_URL === BASE_URL) {
			delete env.ANTHROPIC_BASE_URL;
			changed = true;
		}
		if (env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS === HELPER_TTL_MS) {
			delete env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS;
			changed = true;
		}
		for (const key of SHADOWING_CREDENTIALS) {
			if (env[key] === "") {
				delete env[key];
				changed = true;
			}
		}
		delete settings.apiKeyHelper;
		changed = true;
		if (!changed) return [];
		if (Object.keys(env).length === 0) delete settings.env;
		else settings.env = env;
		const after = `${JSON.stringify(settings, null, 2)}\n`;
		if (after === before) return [];
		return [{ path, before, after, description: "Remove Phaseo from Claude Code settings" }];
	},
};
