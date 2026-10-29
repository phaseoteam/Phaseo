import { join } from "node:path";
import { applyEdits, modify } from "jsonc-parser";
import { isCommandAvailable, readOptionalFile } from "../files.js";
import type { FileChange, IntegrationAdapter, IntegrationModel, IntegrationOptions } from "../types.js";

const DEFAULT_MODEL = "openai/gpt-5.6-terra";
const PROVIDER_ID = "phaseo";
const PROTOCOL = "openai-chat-completions";
const BASE_URL = "https://api.phaseo.app/v1";
const KEY_ENV = "PHASEO_FX_API_KEY";
const ENV_MARKER = "# Managed by Phaseo CLI.";
// fx rejects settings with more than 256 model_metadata entries or 32 connections.
const MAX_MODELS = 256;
const MAX_PROVIDERS = 32;
const MAX_LIMIT = 0xffff_ffff;

type JsonObject = Record<string, unknown>;
type PreviousValue = { present: boolean; value?: unknown };
type FxState = { version: 1; provider: PreviousValue };

function isObject(value: unknown): value is JsonObject {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function settingsPath(options: IntegrationOptions): string {
	return join(options.homeDir, ".fx", "settings.json");
}

function integrationDir(options: IntegrationOptions): string {
	return join(options.homeDir, ".config", "phaseo", "integrations");
}

function statePath(options: IntegrationOptions): string {
	return join(integrationDir(options), "fx.json");
}

export function fxEnvPath(options: IntegrationOptions): string {
	return join(integrationDir(options), "fx.env");
}

function parseSettings(path: string, input: string | null): JsonObject {
	if (input === null || input.trim() === "") return {};
	let value: unknown;
	try {
		value = JSON.parse(input);
	} catch (error) {
		throw new Error(`Cannot update malformed fx settings at ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!isObject(value)) throw new Error(`Cannot update fx settings at ${path}: root must be an object`);
	return value;
}

function parseState(input: string | null): FxState | null {
	if (input === null) return null;
	try {
		const value = JSON.parse(input);
		if (isObject(value) && value.version === 1 && isObject(value.provider) && typeof value.provider.present === "boolean") return value as FxState;
	} catch {}
	return null;
}

function phaseoConnection(settings: JsonObject): JsonObject | null {
	if (settings.providers === undefined) return null;
	if (!isObject(settings.providers)) throw new Error("fx providers configuration must be an object");
	const connection = settings.providers[PROVIDER_ID];
	if (connection === undefined) return null;
	return isObject(connection) ? connection : {};
}

function hasManagedShape(connection: JsonObject): boolean {
	return connection.protocol === PROTOCOL &&
		connection.base_url === BASE_URL &&
		isObject(connection.auth) &&
		connection.auth.type === "bearer" &&
		connection.auth.env === KEY_ENV;
}

function limit(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	const integer = Math.floor(value);
	return integer > 0 && integer <= MAX_LIMIT ? integer : undefined;
}

function isValidModelId(id: string): boolean {
	return id.length > 0 && id.length <= 1024 && id.trim() === id && !/[\u0000-\u001f\u007f]/.test(id);
}

function modelMetadata(model: IntegrationModel): JsonObject {
	const context = limit(model.contextWindow);
	const output = limit(model.maxOutputTokens);
	return {
		...(context ? { context_window: context } : {}),
		// fx refuses an output limit that is not smaller than the context window.
		...(output && (!context || output < context) ? { max_output_tokens: output } : {}),
		...(model.input ? { supports_vision: model.input.includes("image") } : {}),
	};
}

function selectedCatalog(model: string, models?: IntegrationModel[]): IntegrationModel[] {
	const catalog = (models ?? []).filter((entry) => entry.id !== model && isValidModelId(entry.id));
	const selected = models?.find((entry) => entry.id === model) ?? { id: model, name: model };
	return [selected, ...catalog].slice(0, MAX_MODELS);
}

export function renderFxConnection(model = DEFAULT_MODEL, models?: IntegrationModel[]): JsonObject {
	return {
		protocol: PROTOCOL,
		base_url: BASE_URL,
		auth: { type: "bearer", env: KEY_ENV },
		model_metadata: Object.fromEntries(selectedCatalog(model, models).map((entry) => [entry.id, modelMetadata(entry)])),
	};
}

function formattingOptions(input: string) {
	return {
		insertSpaces: !/^\t/m.test(input),
		tabSize: 2,
		eol: input.includes("\r\n") ? "\r\n" : "\n",
	};
}

function setJsonValue(input: string, path: string[], value: unknown): string {
	return applyEdits(input, modify(input, path, value, { formattingOptions: formattingOptions(input) }));
}

function withTrailingNewline(input: string): string {
	return input.endsWith("\n") ? input : `${input}\n`;
}

export function renderFxSettings(path: string, before: string | null, model = DEFAULT_MODEL, models?: IntegrationModel[], owned = false): string {
	if (!isValidModelId(model)) throw new Error(`fx does not accept the model ID ${JSON.stringify(model)}`);
	const settings = parseSettings(path, before);
	const current = phaseoConnection(settings);
	if (current && (!owned || !hasManagedShape(current))) {
		throw new Error(`${path} already defines a phaseo connection that is not managed by Phaseo CLI`);
	}
	if (!current && isObject(settings.providers) && Object.keys(settings.providers).length >= MAX_PROVIDERS) {
		throw new Error(`fx allows at most ${MAX_PROVIDERS} custom connections; remove one from ${path} before setup`);
	}
	if (settings.models !== undefined && !isObject(settings.models)) throw new Error("fx models configuration must be an object");
	let output = before?.trim() ? before : "{}\n";
	output = setJsonValue(output, ["providers", PROVIDER_ID], renderFxConnection(model, models));
	output = setJsonValue(output, ["models", PROVIDER_ID], model);
	output = setJsonValue(output, ["provider"], PROVIDER_ID);
	return withTrailingNewline(output);
}

export function renderFxRemovedSettings(path: string, before: string, state: FxState): string {
	const settings = parseSettings(path, before);
	const current = phaseoConnection(settings);
	let output = before;
	if (current && hasManagedShape(current)) {
		const providers = settings.providers as JsonObject;
		output = setJsonValue(output, Object.keys(providers).length === 1 ? ["providers"] : ["providers", PROVIDER_ID], undefined);
	}
	if (isObject(settings.models) && settings.models[PROVIDER_ID] !== undefined) {
		output = setJsonValue(output, Object.keys(settings.models).length === 1 ? ["models"] : ["models", PROVIDER_ID], undefined);
	}
	// Only restore the previous provider when Phaseo is still the active one.
	if (settings.provider === PROVIDER_ID) {
		output = setJsonValue(output, ["provider"], state.provider.present ? state.provider.value : undefined);
	}
	return withTrailingNewline(output);
}

export function renderFxEnv(credential: string): string {
	if (!/^[A-Za-z0-9._~+/=-]+$/.test(credential)) throw new Error("The Phaseo credential contains characters that cannot be written to a shell file safely");
	return `${ENV_MARKER} Run \`phaseo integrations remove fx\` to remove.\nexport ${KEY_ENV}='${credential}'\n`;
}

export function fxProfileLine(options: IntegrationOptions): string {
	const relative = fxEnvPath({ ...options, homeDir: "" }).replace(/\\/g, "/").replace(/^\/+/, "");
	return `[ -f "$HOME/${relative}" ] && . "$HOME/${relative}"`;
}

export const fxAdapter: IntegrationAdapter = {
	id: "fx",
	name: "fx",
	setupIsAutomatic: true,
	guideUrl: "https://phaseo.app/docs/v1/guides/integrations/fx",
	async inspect(options) {
		const path = settingsPath(options);
		const current = await readOptionalFile(path);
		const owned = parseState(await readOptionalFile(statePath(options))) !== null;
		const installed = await isCommandAvailable(["fx"]);
		const connection = current === null ? null : phaseoConnection(parseSettings(path, current));
		const configured = owned && connection !== null && hasManagedShape(connection);
		const models = connection && isObject(connection.model_metadata) ? Object.keys(connection.model_metadata).length : 0;
		return {
			id: "fx",
			name: "fx",
			status: configured ? "configured" : connection !== null ? "conflict" : installed ? "available" : "not-installed",
			configPath: path,
			details: configured
				? [`Models: ${models}`, `Credential source: ${KEY_ENV} from ${fxEnvPath(options)}`]
				: connection !== null
					? ["Remove or rename the existing phaseo connection in fx settings before setup."]
					: [],
		};
	},
	async planSetup(options) {
		const path = settingsPath(options);
		const before = await readOptionalFile(path);
		const stateFile = statePath(options);
		const stateBefore = await readOptionalFile(stateFile);
		const state = parseState(stateBefore);
		if (stateBefore !== null && state === null) throw new Error(`${stateFile} is not a Phaseo CLI fx state file`);
		const after = renderFxSettings(path, before, options.model, options.models, state !== null);
		const changes: FileChange[] = [];
		if (state === null) {
			const settings = parseSettings(path, before);
			const previous: FxState = { version: 1, provider: settings.provider === undefined ? { present: false } : { present: true, value: settings.provider } };
			changes.push({ path: stateFile, before: null, after: `${JSON.stringify(previous, null, 2)}\n`, description: "Record the previous fx provider for removal" });
		}
		if (before !== after) changes.push({ path, before, after, description: "Configure the Phaseo fx connection" });
		return changes;
	},
	async planCredential(options, credential) {
		const path = fxEnvPath(options);
		const before = await readOptionalFile(path);
		if (before !== null && !before.startsWith(ENV_MARKER)) throw new Error(`${path} already exists and is not managed by Phaseo CLI`);
		const after = renderFxEnv(credential);
		return before === after ? [] : [{ path, before, after, description: "Store the Phaseo credential for fx" }];
	},
	async planRemove(options) {
		const stateFile = statePath(options);
		const stateBefore = await readOptionalFile(stateFile);
		const state = parseState(stateBefore);
		if (state === null || stateBefore === null) return [];
		const changes: FileChange[] = [];
		const path = settingsPath(options);
		const before = await readOptionalFile(path);
		if (before !== null) {
			const after = renderFxRemovedSettings(path, before, state);
			if (after !== before) changes.push({ path, before, after, description: "Remove the Phaseo fx connection" });
		}
		const envFile = fxEnvPath(options);
		const envBefore = await readOptionalFile(envFile);
		if (envBefore?.startsWith(ENV_MARKER)) changes.push({ path: envFile, before: envBefore, after: null, description: "Remove the Phaseo credential for fx" });
		changes.push({ path: stateFile, before: stateBefore, after: null, description: "Remove the Phaseo fx state" });
		return changes;
	},
	setupInstructions(options) {
		const instructions = [
			`fx reads its key from ${KEY_ENV}. Add this line to ~/.zshrc or ~/.bashrc once, then open a new terminal: ${fxProfileLine(options)}`,
			"Run fx. Phaseo is now the active provider; switch back any time with `fx provider <name>`.",
		];
		if ((options.models?.length ?? 0) > MAX_MODELS) {
			instructions.push(`fx lists at most ${MAX_MODELS} models. Other Phaseo models still work with FX_MODEL=<id> fx.`);
		}
		return instructions;
	},
	removeInstructions(options) {
		return [`The shell-profile line now does nothing; delete it from ~/.zshrc or ~/.bashrc if you like: ${fxProfileLine(options)}`];
	},
};
