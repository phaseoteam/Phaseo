import { compact, flagBool, flagString, type Flags } from "./flags.js";
import { confirmDestructive, type ManagementDeps, type ManagementInput, type ManagementMethod, type ManagementRequest } from "./management.js";
import { sanitizeTerminalText } from "./output.js";

// Commands for the /v1 routes that replaced dashboard-only settings: the rate
// limit tier, joining workspaces, auto-routing, successor replacements,
// observability destination checks, authorized apps, profile and classifier
// tests. Each entry maps CLI arguments to one API request, so request building
// is testable without a session or network access. They run beside the
// management commands (management.ts) with the same request and confirmation
// plumbing; the two command tables never share a name.

export type ParityMethod = ManagementMethod;
export type ParityRequest = ManagementRequest;
export type ParityInput = Pick<ManagementInput, "readStdin" | "env">;
export type ParityDeps = ManagementDeps;

type CommandSpec = {
	usage: string;
	description?: string;
	output: "list" | "detail" | "action";
	done?: string;
	confirm?: (args: string[]) => string;
	build: (args: string[], flags: Flags, input: ParityInput) => ParityRequest | Promise<ParityRequest>;
};

const id = (value: string) => encodeURIComponent(value);

/** true/false flags that are only sent when given. */
function optionalBool(flags: Flags, key: string): boolean | undefined {
	const value = flags[key];
	if (value === undefined) return undefined;
	if (value === true || value === "true" || value === "1") return true;
	if (value === "false" || value === "0") return false;
	throw new Error(`--${key} must be true or false`);
}

function optionalNumber(flags: Flags, key: string): number | null | undefined {
	const value = flagString(flags, key);
	if (value === undefined) return undefined;
	if (value === "none") return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number, or none`);
	return parsed;
}

function csv(flags: Flags, key: string): string[] | undefined {
	const value = flagString(flags, key);
	if (value === undefined) return undefined;
	return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function arg(args: string[], index: number, label: string): string {
	const value = args[index];
	if (!value) throw new Error(`${label} is required`);
	return value;
}

function required(value: string | undefined, flag: string): string {
	if (!value) throw new Error(`--${flag} is required`);
	return value;
}

function jsonObject(raw: string, label: string): Record<string, unknown> {
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
	return parsed as Record<string, unknown>;
}

/** --body-json as the base, with explicit flags taking precedence. */
function withBodyJson(flags: Flags, fields: Record<string, unknown>): Record<string, unknown> {
	const raw = flagString(flags, "body-json");
	return { ...(raw ? jsonObject(raw, "--body-json") : {}), ...compact(fields) };
}

function nonEmpty(body: Record<string, unknown>, hint: string): Record<string, unknown> {
	if (Object.keys(body).length === 0) throw new Error(`Provide ${hint} or --body-json`);
	return body;
}

/** Text from --<flag>-stdin or --<flag>, for values too long or private for argv. */
async function textInput(flags: Flags, input: ParityInput, flag: string): Promise<string | undefined> {
	if (flagBool(flags, `${flag}-stdin`)) return (await input.readStdin()).trim();
	return flagString(flags, flag);
}

/** Destination settings hold credentials, so they can come from stdin or an environment variable. */
async function configInput(flags: Flags, input: ParityInput): Promise<Record<string, unknown>> {
	if (flagBool(flags, "config-stdin")) return jsonObject(await input.readStdin(), "Config from stdin");
	const envName = flagString(flags, "config-env");
	if (envName) {
		const value = input.env[envName];
		if (!value?.trim()) throw new Error(`Environment variable ${envName} is empty or not set`);
		return jsonObject(value, `Config in ${envName}`);
	}
	const raw = flagString(flags, "config-json");
	if (raw) return jsonObject(raw, "--config-json");
	throw new Error("Provide the destination settings with --config-stdin, --config-env <VAR> or --config-json <json>");
}

/**
 * Parses an IP allowlist: `none` clears it, otherwise comma-separated
 * `label=address` entries (IPv4, IPv6 or CIDR), e.g. `Office=203.0.113.0/24`.
 * The API validates the addresses with the dashboard's rules.
 */
export function parseIpAllowlist(value: string): Array<{ label: string; address: string }> {
	if (value.trim().toLowerCase() === "none") return [];
	return value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
		const separator = entry.indexOf("=");
		const label = separator > 0 ? entry.slice(0, separator).trim() : "";
		const address = separator > 0 ? entry.slice(separator + 1).trim() : "";
		if (!label || !address) throw new Error(`--ip-allowlist entries must look like label=address, e.g. Office=203.0.113.0/24 (got "${entry}")`);
		return { label, address };
	});
}

const COMMANDS: Record<string, CommandSpec> = {
	"rate-limits tier get": {
		usage: "",
		description: "The workspace's rate limit tier and whether it can raise itself one tier now. Owners and admins.",
		output: "detail",
		build: () => ({ method: "GET", path: "/rate-limits/tier" }),
	},
	"rate-limits tier raise": {
		usage: "",
		description: "Raises an eligible workspace one tier for a limited time. Workspace owner only; management keys cannot raise.",
		output: "action",
		done: "Raised the workspace's rate limit tier",
		build: () => ({ method: "POST", path: "/rate-limits/tier/raise" }),
	},
	"invites accept": {
		usage: "<code> | --code-stdin",
		description: "Asks to join the workspace an invite code belongs to. An owner or admin then approves the request.",
		output: "action",
		done: "Asked to join the workspace",
		build: async (args, flags, input) => {
			const code = flagBool(flags, "code-stdin") ? (await input.readStdin()).trim() : args[0];
			if (!code) throw new Error("Invite code is required");
			return { method: "POST", path: "/invites/accept", body: { token: code } };
		},
	},
	"invites requests": {
		usage: "[--status pending|approved|denied|cancelled|all]",
		description: "Your own requests to join workspaces. Pending only unless --status says otherwise.",
		output: "list",
		build: (_args, flags) => {
			const status = flagString(flags, "status");
			return { method: "GET", path: status ? `/invites/requests?status=${id(status)}` : "/invites/requests" };
		},
	},
	"routing auto get": {
		usage: "",
		description: "The limits the auto-router works within.",
		output: "detail",
		build: () => ({ method: "GET", path: "/routing/auto" }),
	},
	"routing auto update": {
		usage: "[--allowed-patterns <provider/model,...>|none] [--spend-profile economy|standard|premium|unrestricted|custom] [--max-input-price-per-million <usd>|none] [--max-output-price-per-million <usd>|none] [--objective balanced|quality|cost|latency] [--allow-fallbacks true|false] [--body-json <json>]",
		description: "Changes only the fields given. A custom spend profile needs both price limits.",
		output: "detail",
		build: (_args, flags) => {
			const patterns = flagString(flags, "allowed-patterns") === "none" ? [] : csv(flags, "allowed-patterns");
			return {
				method: "PATCH",
				path: "/routing/auto",
				body: nonEmpty(withBodyJson(flags, {
					allowed_patterns: patterns,
					spend_profile: flagString(flags, "spend-profile"),
					max_input_price_per_million: optionalNumber(flags, "max-input-price-per-million"),
					max_output_price_per_million: optionalNumber(flags, "max-output-price-per-million"),
					objective: flagString(flags, "objective"),
					allow_fallbacks: optionalBool(flags, "allow-fallbacks"),
				}), "a field to change"),
			};
		},
	},
	"routing successors list": {
		usage: "",
		description: "Your own choices of replacement for models no provider serves any more.",
		output: "list",
		build: () => ({ method: "GET", path: "/routing/successor/replacements" }),
	},
	"routing successors set": {
		usage: "--model <id> (--successor <id> | --never)",
		description: "Sends requests for --model to --successor, or with --never stops them being redirected at all.",
		output: "action",
		done: "Saved the replacement",
		build: (_args, flags) => {
			const never = flagBool(flags, "never");
			const successor = flagString(flags, "successor");
			if (never === Boolean(successor)) throw new Error("Pass either --successor <id> or --never");
			return { method: "PUT", path: "/routing/successor/replacements", body: { model: required(flagString(flags, "model"), "model"), successor: never ? null : successor } };
		},
	},
	"routing successors remove": {
		usage: "--model <id>",
		description: "Removes your choice for --model, so the catalogue's successor applies again.",
		output: "action",
		done: "Removed the replacement",
		build: (_args, flags) => ({ method: "DELETE", path: `/routing/successor/replacements?model=${id(required(flagString(flags, "model"), "model"))}` }),
	},
	"observability destinations test": {
		usage: "<id>",
		description: "Checks a saved destination by sending it a sample trace without messages.",
		output: "detail",
		build: (args) => ({ method: "POST", path: `/observability/destinations/${id(arg(args, 0, "Destination id"))}/test` }),
	},
	"observability destinations sample": {
		usage: "<id>",
		description: "Sends a saved destination a sample trace, with messages unless it leaves prompts and outputs out.",
		output: "detail",
		build: (args) => ({ method: "POST", path: `/observability/destinations/${id(arg(args, 0, "Destination id"))}/sample` }),
	},
	"observability destinations test-config": {
		usage: "--type <type> (--config-stdin | --config-env <VAR> | --config-json <json>)",
		description: "Tests destination settings before saving them. Settings hold credentials: prefer --config-stdin or --config-env over --config-json.",
		output: "detail",
		build: async (_args, flags, input) => ({
			method: "POST",
			path: "/observability/destinations/test",
			body: { type: required(flagString(flags, "type"), "type"), config: await configInput(flags, input) },
		}),
	},
	"authorized-apps list": {
		usage: "",
		description: "Apps you have authorized with OAuth, in every workspace.",
		output: "list",
		build: () => ({ method: "GET", path: "/me/authorized-apps" }),
	},
	"authorized-apps revoke": {
		usage: "<id> [--yes]",
		description: "Revokes an app's access so its tokens stop working. Revoking this CLI's own authorization signs it out.",
		output: "action",
		done: "Revoked the app's access",
		confirm: (args) => `This revokes authorized app ${args[0] ?? ""}; its tokens stop working.`,
		build: (args) => ({ method: "DELETE", path: `/me/authorized-apps/${id(arg(args, 0, "Authorization id"))}` }),
	},
	"authorized-apps update-scopes": {
		usage: "<id> --scopes <scope,...>",
		description: "Keeps only the scopes given. Scopes can only be removed; add them by authorizing the app again in the browser.",
		output: "action",
		done: "Updated the app's scopes",
		build: (args, flags) => {
			const scopes = csv(flags, "scopes");
			if (!scopes?.length) throw new Error("--scopes is required");
			return { method: "PATCH", path: `/me/authorized-apps/${id(arg(args, 0, "Authorization id"))}`, body: { scopes } };
		},
	},
	"profile get": {
		usage: "",
		description: "Your display name, default workspace and whether your details are hidden on screen.",
		output: "detail",
		build: () => ({ method: "GET", path: "/me/profile" }),
	},
	"profile update": {
		usage: "[--display-name <name>] [--default-workspace <id>|none] [--obfuscate-info true|false]",
		description: "Password, MFA and passkeys are managed in the browser only.",
		output: "detail",
		build: (_args, flags) => {
			const workspace = flagString(flags, "default-workspace");
			return {
				method: "PATCH",
				path: "/me/profile",
				body: nonEmpty(withBodyJson(flags, {
					display_name: flagString(flags, "display-name"),
					default_workspace_id: workspace === "none" ? null : workspace,
					obfuscate_info: optionalBool(flags, "obfuscate-info"),
				}), "a field to change"),
			};
		},
	},
	"classifiers test": {
		usage: "[<id>] (--prompt <text> | --prompt-stdin) [--response <text>] [--model <id>] [--dimensions-json <json>] [--instructions <text>] [--body-json <json>]",
		description: "Runs a saved classifier (<id>) or a draft once on a sample. This is a billed model request made with your session's own credential, so it needs gateway:access as well as classifiers:write. CLI sign-ins cannot be granted gateway:access yet, so this returns 403 gateway_access_required for now. Management keys cannot run tests.",
		output: "detail",
		build: async (args, flags, input) => {
			const draft = compact({
				model: flagString(flags, "model"),
				instructions: flagString(flags, "instructions"),
				dimensions: flagString(flags, "dimensions-json") === undefined ? undefined : JSON.parse(flagString(flags, "dimensions-json")!),
			});
			const prompt = await textInput(flags, input, "prompt");
			const base = flagString(flags, "body-json") ? jsonObject(flagString(flags, "body-json")!, "--body-json") : {};
			// Only flags that were given override --body-json's sample.
			const sample = { ...(base.sample as Record<string, unknown> | undefined), ...compact({ prompt, response: flagString(flags, "response") }) };
			const body: Record<string, unknown> = { ...base, sample };
			if (args[0]) body.classifier_id = args[0];
			if (Object.keys(draft).length) body.classifier = { ...(base.classifier as Record<string, unknown> | undefined), ...draft };
			if (!sample.prompt) throw new Error("A sample prompt is required: --prompt <text> or --prompt-stdin");
			if (!body.classifier_id && !body.classifier) throw new Error("Pass a saved classifier id, or a draft with --model and --dimensions-json");
			return { method: "POST", path: "/classifiers/test", body };
		},
	},
};

export function parityCommandKeys(): string[] {
	return Object.keys(COMMANDS);
}

export function resolveParityCommand(tokens: string[]): { key: string; spec: CommandSpec; args: string[] } | null {
	for (let length = Math.min(tokens.length, 3); length >= 2; length--) {
		const key = tokens.slice(0, length).join(" ");
		const spec = COMMANDS[key];
		if (spec) return { key, spec, args: tokens.slice(length) };
	}
	return null;
}

export function parityUsage(key: string): string {
	return `phaseo ${key} ${COMMANDS[key].usage} [--json]`.replace(/\s+/g, " ");
}

/** Help entries for every command and each parent group, e.g. `routing successors` and `routing`. */
export function parityHelpEntries(): Record<string, { usage: string[]; description?: string }> {
	const entries: Record<string, { usage: string[]; description?: string }> = {};
	for (const [key, spec] of Object.entries(COMMANDS)) {
		const usage = parityUsage(key);
		entries[key] = { usage: [usage], ...(spec.description ? { description: spec.description } : {}) };
		const words = key.split(" ");
		for (let length = 1; length < words.length; length++) {
			const prefix = words.slice(0, length).join(" ");
			(entries[prefix] ??= { usage: [] }).usage.push(usage);
		}
	}
	return entries;
}

export async function buildParityRequest(tokens: string[], flags: Flags, input: ParityInput): Promise<ParityRequest> {
	const match = resolveParityCommand(tokens);
	if (!match) throw new Error(`Unknown command: ${tokens.join(" ")}`);
	return match.spec.build(match.args, flags, input);
}

function text(value: unknown): string {
	return sanitizeTerminalText(String(value));
}

function renderValue(value: unknown): string {
	if (value === null || value === undefined) return "none";
	if (Array.isArray(value)) return value.length ? value.map((entry) => typeof entry === "object" ? JSON.stringify(entry) : String(entry)).map(text).join(", ") : "none";
	if (typeof value === "object") return text(JSON.stringify(value));
	return text(value);
}

function renderRow(item: any): string {
	if (!item || typeof item !== "object") return text(item);
	const parts = [item.status, item.app_name ?? item.workspace_name ?? item.model, item.successor === undefined ? undefined : `-> ${item.successor ?? "never"}`, item.id ?? item.client_id];
	return parts.filter((part) => part !== undefined && part !== null && part !== "").map(text).join(" ");
}

export function renderParityResult(key: string, body: any): string {
	const spec = COMMANDS[key];
	const data = body && typeof body === "object" && "data" in body ? body.data : body;
	if (spec.output === "list" && Array.isArray(data)) return data.length ? `${data.map(renderRow).join("\n")}\n` : "No results.\n";
	if (spec.output === "action") {
		const record = data && typeof data === "object" && !Array.isArray(data) ? data : {};
		return `${spec.done ?? "Done"}.${record.id ? `\nID: ${text(record.id)}` : ""}\n`;
	}
	if (!data || typeof data !== "object") return `${renderValue(data)}\n`;
	return `${Object.entries(data).map(([field, value]) => `${field.replace(/_/g, " ")}: ${renderValue(value)}`).join("\n")}\n`;
}

/** Runs the command if it is one of these; returns false otherwise. */
export async function runParityCommand(tokens: string[], flags: Flags, deps: ParityDeps): Promise<boolean> {
	const match = resolveParityCommand(tokens);
	if (!match) return false;
	const request = await match.spec.build(match.args, flags, deps);
	if (match.spec.confirm) await confirmDestructive(match.spec.confirm(match.args), flags, deps);
	const body = await deps.request(request.path, { method: request.method, body: request.body });
	deps.write(flagBool(flags, "json") ? `${JSON.stringify(body, null, 2)}\n` : renderParityResult(match.key, body));
	return true;
}
