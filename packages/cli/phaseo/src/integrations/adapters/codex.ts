import { join } from "node:path";
import { isCommandAvailable, readOptionalFile } from "../files.js";
import type { FileChange, IntegrationAdapter, IntegrationOptions } from "../types.js";

const MARKER = "# Managed by Phaseo CLI";
const DEFAULT_MODEL = "openai/gpt-5.6-terra";

function codexHome(options: IntegrationOptions): string {
	return process.env.CODEX_HOME || join(options.homeDir, ".codex");
}

function profilePath(options: IntegrationOptions): string {
	return join(codexHome(options), "phaseo.config.toml");
}

export function renderCodexProfile(model = DEFAULT_MODEL): string {
	return `${MARKER}
model_provider = "phaseo"
model = ${JSON.stringify(model)}

[model_providers.phaseo]
name = "Phaseo"
base_url = "https://api.phaseo.app/v1"
wire_api = "responses"

[model_providers.phaseo.auth]
command = "phaseo"
args = ["integrations", "credential", "codex"]
refresh_interval_ms = 300000

# Live Phaseo model, pricing and usage tools, signed in with your phaseo login (read-only).
[mcp_servers.phaseo]
command = "phaseo"
args = ["mcp"]
`;
}

export const codexAdapter: IntegrationAdapter = {
	id: "codex",
	name: "OpenAI Codex",
	async inspect(options) {
		const path = profilePath(options);
		const current = await readOptionalFile(path);
		const installed = await isCommandAvailable(["codex", "codex.exe", "codex.cmd", "codex.ps1"]);
		const owned = current?.startsWith(MARKER) ?? false;
		return {
			id: "codex",
			name: "OpenAI Codex",
			status: owned ? "configured" : current ? "conflict" : installed ? "available" : "not-installed",
			configPath: path,
			details: owned
				? ["Use with: codex --profile phaseo", "Credential source: Phaseo CLI session or PHASEO_API_KEY", "Phaseo MCP: phaseo mcp (read-only)"]
				: current
					? ["A phaseo.config.toml file exists but is not managed by Phaseo."]
					: [],
		};
	},
	async planSetup(options) {
		const path = profilePath(options);
		const before = await readOptionalFile(path);
		if (before !== null && !before.startsWith(MARKER)) {
			throw new Error(`${path} already exists and is not managed by Phaseo`);
		}
		const after = renderCodexProfile(options.model);
		if (before === after) return [];
		return [{ path, before, after, description: "Configure the Phaseo Codex profile" }];
	},
	async planRemove(options) {
		const path = profilePath(options);
		const before = await readOptionalFile(path);
		if (before === null) return [];
		if (!before.startsWith(MARKER)) throw new Error(`Refusing to remove unmanaged file: ${path}`);
		return [{ path, before, after: null, description: "Remove the Phaseo Codex profile" }];
	},
};
