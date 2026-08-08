import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { readOptionalFile } from "../files.js";
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
env_key = "PHASEO_API_KEY"
env_key_instructions = "Set PHASEO_API_KEY or run phaseo keys create --name Codex"
wire_api = "responses"
`;
}

export const codexAdapter: IntegrationAdapter = {
	id: "codex",
	name: "OpenAI Codex",
	async inspect(options) {
		const path = profilePath(options);
		const current = await readOptionalFile(path);
		let installed = false;
		for (const candidate of ["codex", "codex.exe"]) {
			for (const directory of (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":")) {
				if (!directory) continue;
				try {
					await access(join(directory, candidate), constants.X_OK);
					installed = true;
					break;
				} catch {}
			}
		}
		const owned = current?.startsWith(MARKER) ?? false;
		return {
			id: "codex",
			name: "OpenAI Codex",
			status: owned ? "configured" : current ? "conflict" : installed ? "available" : "not-installed",
			configPath: path,
			details: owned
				? ["Use with: codex --profile phaseo", "Credential source: PHASEO_API_KEY"]
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
