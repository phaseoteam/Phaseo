import { appendQuery, flagBool, flagNumber, flagString, parseCsvFlag, parseJsonFlag, type Flags } from "./flags.js";
import { sanitizeTerminalText } from "./output.js";

// Dedicated commands for the /v1 management routes. Each entry maps CLI
// arguments to one API request so request building stays testable without
// a session or network access.

export type ManagementMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ManagementRequest = {
	method: ManagementMethod;
	path: string;
	body?: Record<string, unknown>;
};

export type ManagementInput = {
	readStdin: () => Promise<string>;
	env: Record<string, string | undefined>;
	/** Lets a command read current state before building a full-replacement request. */
	request?: (path: string, options: { method: ManagementMethod; body?: Record<string, unknown> }) => Promise<any>;
};

export type ManagementDeps = ManagementInput & {
	request: (path: string, options: { method: ManagementMethod; body?: Record<string, unknown> }) => Promise<any>;
	confirm: (question: string) => Promise<boolean>;
	interactive: boolean;
	write: (text: string) => void;
};

type OutputMode = "list" | "detail" | "action" | "raw";

type CommandSpec = {
	usage: string;
	description?: string;
	output: OutputMode;
	done?: string;
	confirm?: (args: string[]) => string;
	build: (args: string[], flags: Flags, input: ManagementInput) => ManagementRequest | Promise<ManagementRequest>;
};

type FieldKind = "string" | "number" | "int" | "bool" | "csv" | "json" | "usd-nanos";
type Field = [flag: string, key: string, kind?: FieldKind];

const SECRET_FIELDS = new Set(["token", "signing_secret", "secret", "client_secret", "key", "credential"]);

const id = (value: string) => encodeURIComponent(value);

function arg(args: string[], index: number, label: string): string {
	const value = args[index];
	if (!value) throw new Error(`${label} is required`);
	return value;
}

function required<T>(value: T | undefined, flag: string): T {
	if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) throw new Error(`--${flag} is required`);
	return value;
}

function setPath(target: Record<string, unknown>, key: string, value: unknown) {
	const parts = key.split(".");
	let node = target;
	for (const part of parts.slice(0, -1)) {
		const next = node[part];
		if (!next || typeof next !== "object" || Array.isArray(next)) node[part] = {};
		node = node[part] as Record<string, unknown>;
	}
	node[parts[parts.length - 1]] = value;
}

function fieldValue(flags: Flags, flag: string, kind: FieldKind): unknown {
	switch (kind) {
		case "bool":
			return flagBool(flags, flag);
		case "number":
			return flagNumber(flags, flag);
		case "int": {
			const value = flagNumber(flags, flag);
			if (value !== undefined && !Number.isInteger(value)) throw new Error(`--${flag} must be an integer`);
			return value;
		}
		case "usd-nanos": {
			const value = flagNumber(flags, flag);
			return value === undefined ? undefined : Math.round(value * 1_000_000_000);
		}
		case "csv":
			return parseCsvFlag(flags, flag);
		case "json": {
			const raw = flagString(flags, flag);
			if (raw === undefined) throw new Error(`--${flag} must be JSON`);
			return JSON.parse(raw);
		}
		default: {
			const value = flagString(flags, flag);
			if (value === undefined) throw new Error(`--${flag} requires a value`);
			return value;
		}
	}
}

/** Builds a request body from `--body-json` plus explicit flags, which take precedence. */
export function bodyFromFlags(flags: Flags, fields: Field[]): Record<string, unknown> {
	const body = parseJsonFlag(flags, "body-json");
	for (const [flag, key, kind = "string"] of fields) {
		if (flags[flag] === undefined) continue;
		setPath(body, key, fieldValue(flags, flag, kind));
	}
	return body;
}

function nonEmpty(body: Record<string, unknown>, hint: string): Record<string, unknown> {
	if (Object.keys(body).length === 0) throw new Error(`Provide ${hint} or --body-json`);
	return body;
}

/**
 * Reads a secret from stdin or a named environment variable. Secrets are never
 * accepted as plain argv values because those leak into shell history and
 * process listings.
 */
export async function readSecretFlag(
	flags: Flags,
	input: ManagementInput,
	options: { flag: string; defaultEnv: string; required: boolean },
): Promise<string | undefined> {
	const { flag, defaultEnv } = options;
	if (flags[flag] !== undefined) {
		throw new Error(`--${flag} is not accepted on the command line. Use --${flag}-stdin or --${flag}-env <VAR> (defaults to ${defaultEnv}).`);
	}
	let value: string | undefined;
	if (flagBool(flags, `${flag}-stdin`)) {
		value = (await input.readStdin()).trim();
		if (!value) throw new Error(`No value was read from stdin for --${flag}-stdin`);
	} else {
		const explicitEnv = flagString(flags, `${flag}-env`);
		const envName = explicitEnv ?? (options.required ? defaultEnv : undefined);
		if (envName) {
			value = input.env[envName]?.trim() || undefined;
			if (!value && explicitEnv) throw new Error(`Environment variable ${envName} is empty or not set`);
		}
	}
	if (options.required && !value) {
		throw new Error(`A ${flag} is required. Pipe it with --${flag}-stdin or set ${defaultEnv} (or --${flag}-env <VAR>).`);
	}
	return value;
}

/** Rejects secret-bearing fields in --body-json, which would put the secret in argv. */
export function rejectSecretBodyFields(flags: Flags, fields: string[], secretFlag: string): void {
	const body = parseJsonFlag(flags, "body-json");
	const found = fields.filter((field) => body[field] !== undefined);
	if (found.length) {
		throw new Error(`--body-json must not contain ${found.join(", ")}. Command-line arguments are visible in shell history and process lists; use --${secretFlag}-stdin or --${secretFlag}-env <VAR>.`);
	}
}

const BYOK_SECRET_FIELDS = ["key", "value", "api_key"];
const PRIVATE_MODEL_SECRET_FIELDS = ["credential", "api_key"];

/** Reads JSON from --<flag>-stdin, the variable named by --<flag>-env, or --<flag>-json. */
async function readJsonInput(flags: Flags, input: ManagementInput, flag: string): Promise<unknown> {
	if (flagBool(flags, `${flag}-stdin`)) return JSON.parse(await input.readStdin());
	const envName = flagString(flags, `${flag}-env`);
	if (envName) {
		const value = input.env[envName];
		if (!value?.trim()) throw new Error(`Environment variable ${envName} is empty or not set`);
		return JSON.parse(value);
	}
	const raw = flagString(flags, `${flag}-json`);
	return raw === undefined ? undefined : JSON.parse(raw);
}

const pageQuery = (flags: Flags) => ({ limit: flagString(flags, "limit"), offset: flagString(flags, "offset") });
const list = (path: string): CommandSpec["build"] => (_args, flags) => ({ method: "GET", path: appendQuery(path, pageQuery(flags)) });
const PAGE = "[--limit <n>] [--offset <n>]";

function crud(options: {
	base: string;
	noun: string;
	label: string;
	createUsage: string;
	updateUsage: string;
	create: (flags: Flags, input: ManagementInput) => Record<string, unknown> | Promise<Record<string, unknown>>;
	update: (flags: Flags, input: ManagementInput) => Record<string, unknown> | Promise<Record<string, unknown>>;
	listUsage?: string;
	listBuild?: CommandSpec["build"];
	updateMethod?: ManagementMethod;
	skipGet?: boolean;
	description?: string;
}): Record<string, CommandSpec> {
	const { base, noun, label } = options;
	const specs: Record<string, CommandSpec> = {
		list: { usage: options.listUsage ?? "", output: "list", build: options.listBuild ?? list(base) },
		create: {
			usage: options.createUsage,
			...(options.description ? { description: options.description } : {}),
			output: "action",
			done: `Created ${noun}`,
			build: async (_args, flags, input) => ({ method: "POST", path: base, body: await options.create(flags, input) }),
		},
		get: { usage: "<id>", output: "detail", build: (args) => ({ method: "GET", path: `${base}/${id(arg(args, 0, label))}` }) },
		update: {
			usage: `<id> ${options.updateUsage}`.trim(),
			...(options.description ? { description: options.description } : {}),
			output: "action",
			done: `Updated ${noun}`,
			build: async (args, flags, input) => ({
				method: options.updateMethod ?? "PATCH",
				path: `${base}/${id(arg(args, 0, label))}`,
				body: await options.update(flags, input),
			}),
		},
		delete: {
			usage: "<id> [--yes]",
			output: "action",
			done: `Deleted ${noun}`,
			confirm: (args) => `This permanently deletes ${noun} ${args[0] ?? ""}.`.replace(" .", "."),
			build: (args) => ({ method: "DELETE", path: `${base}/${id(arg(args, 0, label))}` }),
		},
	};
	if (options.skipGet) delete specs.get;
	return specs;
}

function group(prefix: string, specs: Record<string, CommandSpec>): Record<string, CommandSpec> {
	return Object.fromEntries(Object.entries(specs).map(([name, spec]) => [`${prefix} ${name}`, spec]));
}

const BYOK_FIELDS: Field[] = [
	["name", "name"],
	["enabled", "enabled", "bool"],
	["routing-mode", "routing_mode"],
	["allowed-models", "allowed_models", "csv"],
	["allowed-key-ids", "allowed_api_key_ids", "csv"],
];

const SPEND_RULE_FIELDS: Field[] = [
	["name", "name"],
	["enabled", "enabled", "bool"],
	["metric", "metric"],
	["scope-type", "scope_type"],
	["scope-id", "scope_id"],
	["period", "period"],
	["window-hours", "window_hours", "int"],
	["time-zone", "time_zone"],
	["base-kind", "base_kind"],
	["base-amount-usd", "base_amount_usd", "number"],
	["threshold-percents", "threshold_percents", "csv"],
	["threshold-amount-usd", "threshold_amount_usd", "number"],
	["action", "action"],
	["block-at-percent", "block_at_percent", "int"],
	["block-at-amount-usd", "block_at_amount_usd", "number"],
	["cooldown-minutes", "cooldown_minutes", "int"],
	["destination-ids", "destination_ids", "csv"],
];

function spendRuleBody(flags: Flags) {
	const body = bodyFromFlags(flags, SPEND_RULE_FIELDS);
	if (Array.isArray(body.threshold_percents)) {
		body.threshold_percents = body.threshold_percents.map((value) => {
			const parsed = Number(value);
			if (!Number.isInteger(parsed)) throw new Error("--threshold-percents must be a comma-separated list of integers");
			return parsed;
		});
	}
	return body;
}

const SPEND_RULE_USAGE = "[--name <name>] [--metric spend|budget_percent|forecast|spike|balance] [--scope-type workspace|key|member|department|model|provider] [--scope-id <id>] [--period day|week|month|rolling] [--threshold-percents <n,n>] [--threshold-amount-usd <usd>] [--action notify|block] [--block-at-percent <n>] [--destination-ids <id,id>] [--enabled true|false] [--body-json <json>]";

const RATE_LIMIT_POLICY_FIELDS: Field[] = [
	["name", "name"],
	["description", "description"],
	["requests-per-minute", "requests_per_minute", "int"],
	["tokens-per-minute", "tokens_per_minute", "int"],
	["concurrent-requests", "concurrent_requests", "int"],
	["fail-closed", "fail_closed", "bool"],
];
const RATE_LIMIT_POLICY_USAGE = "[--description <text>] [--requests-per-minute <n>] [--tokens-per-minute <n>] [--concurrent-requests <n>] [--fail-closed true|false]";

const OBSERVABILITY_DESTINATION_FIELDS: Field[] = [
	["name", "name"],
	["enabled", "enabled", "bool"],
	["privacy-mode", "privacy_mode", "bool"],
	["sampling-rate", "sampling_rate", "number"],
];

async function observabilityDestinationBody(flags: Flags, input: ManagementInput) {
	const body = bodyFromFlags(flags, [...OBSERVABILITY_DESTINATION_FIELDS, ["type", "type"]]);
	const config = await readJsonInput(flags, input, "config");
	if (config !== undefined) body.config = config;
	return body;
}

const PRIVATE_MODEL_FIELDS: Field[] = [
	["model-reference", "model_reference"],
	["name", "name"],
	["description", "description"],
	["base-url", "base_url"],
	["upstream-model", "upstream_model_id"],
	["supports-responses", "supports_responses", "bool"],
	["enabled", "enabled", "bool"],
	["context-length", "context_length", "int"],
	["max-output-tokens", "max_output_tokens", "int"],
	["routing-policy", "routing_policy"],
];
const PRIVATE_MODEL_USAGE = "[--description <text>] [--supports-responses true|false] [--enabled true|false] [--context-length <n>] [--max-output-tokens <n>] [--routing-policy preferred|balanced|fallback]";

const CLASSIFIER_FIELDS: Field[] = [
	["name", "name"],
	["description", "description"],
	["enabled", "enabled", "bool"],
	["model", "model"],
	["instructions", "instructions"],
	["dimensions-json", "dimensions", "json"],
	["sample-rate", "sample_rate", "number"],
	["sample-by", "sample_by"],
	["input-scope", "input_scope"],
	["monthly-budget-usd", "monthly_budget_usd", "number"],
];
const CLASSIFIER_USAGE = "[--instructions <text>] [--description <text>] [--sample-rate <0-1>] [--sample-by request|session] [--input-scope prompt|prompt_and_response] [--monthly-budget-usd <usd>] [--enabled true|false] [--body-json <json>]";

const WORKLOAD_POLICY_FIELDS: Field[] = [
	["name", "name"],
	["provider", "provider"],
	["issuer", "issuer"],
	["owner-id", "owner_id"],
	["status", "status"],
	["claim-conditions-json", "claim_conditions", "json"],
	["max-token-lifetime-seconds", "max_token_lifetime_seconds", "int"],
];

const DEPARTMENT_FIELDS: Field[] = [
	["name", "name"],
	["description", "description"],
	["icon", "icon"],
	["color", "color"],
];

const FEEDBACK_FILTERS = ["request-id", "session-id", "preset-id", "test-run-id", "since", "until"];

function filterQuery(flags: Flags, names: string[]): Record<string, string | undefined> {
	return Object.fromEntries(names.map((name) => [name.replace(/-/g, "_"), flagString(flags, name)]));
}

const COMMANDS: Record<string, CommandSpec> = {
	"byok list": {
		usage: `[--provider <id>] ${PAGE}`,
		output: "list",
		build: (_args, flags) => ({ method: "GET", path: appendQuery("/byok", { provider: flagString(flags, "provider"), ...pageQuery(flags) }) }),
	},
	"byok create": {
		usage: "--provider <id> --name <name> [--key-stdin | --key-env <VAR>] [--routing-mode priority|fallback] [--allowed-models <id,id>] [--allowed-key-ids <id,id>] [--enabled true|false]",
		description: "Reads the provider key from stdin (--key-stdin), a named variable (--key-env), or PHASEO_BYOK_KEY. The key is never printed.",
		output: "action",
		done: "Created BYOK key",
		build: async (_args, flags, input) => {
			rejectSecretBodyFields(flags, BYOK_SECRET_FIELDS, "key");
			const body = bodyFromFlags(flags, [...BYOK_FIELDS, ["provider", "provider"]]);
			required(body.provider as string | undefined, "provider");
			required(body.name as string | undefined, "name");
			body.key = await readSecretFlag(flags, input, { flag: "key", defaultEnv: "PHASEO_BYOK_KEY", required: true });
			return { method: "POST", path: "/byok", body };
		},
	},
	"byok get": { usage: "<id>", output: "detail", build: (args) => ({ method: "GET", path: `/byok/${id(arg(args, 0, "BYOK key id"))}` }) },
	"byok update": {
		usage: "<id> [--name <name>] [--enabled true|false] [--routing-mode priority|fallback] [--allowed-models <id,id>] [--allowed-key-ids <id,id>] [--key-stdin | --key-env <VAR>]",
		output: "action",
		done: "Updated BYOK key",
		build: async (args, flags, input) => {
			const keyId = arg(args, 0, "BYOK key id");
			rejectSecretBodyFields(flags, BYOK_SECRET_FIELDS, "key");
			const body = bodyFromFlags(flags, BYOK_FIELDS);
			const key = await readSecretFlag(flags, input, { flag: "key", defaultEnv: "PHASEO_BYOK_KEY", required: false });
			if (key) body.key = key;
			return { method: "PATCH", path: `/byok/${id(keyId)}`, body: nonEmpty(body, "a field to update") };
		},
	},
	"byok delete": {
		usage: "<id> [--yes]",
		output: "action",
		done: "Deleted BYOK key",
		confirm: (args) => `This permanently deletes BYOK key ${args[0]}.`,
		build: (args) => ({ method: "DELETE", path: `/byok/${id(arg(args, 0, "BYOK key id"))}` }),
	},
	"byok reorder": {
		usage: "--provider <id> --routing-mode priority|fallback --key-ids <id,id>",
		output: "action",
		done: "Reordered BYOK keys",
		build: (_args, flags) => ({
			method: "POST",
			path: "/byok/reorder",
			body: {
				provider: required(flagString(flags, "provider"), "provider"),
				routing_mode: required(flagString(flags, "routing-mode"), "routing-mode"),
				key_ids: required(parseCsvFlag(flags, "key-ids"), "key-ids"),
			},
		}),
	},

	...group("budgets", crud({
		base: "/budgets",
		noun: "budget",
		label: "Budget id",
		createUsage: "--interval daily|weekly|monthly|lifetime --limit <usd>",
		updateUsage: "[--interval daily|weekly|monthly|lifetime] [--limit <usd>]",
		create: (flags) => ({ interval: required(flagString(flags, "interval"), "interval"), limit: required(flagNumber(flags, "limit"), "limit") }),
		update: (flags) => nonEmpty(bodyFromFlags(flags, [["interval", "interval"], ["limit", "limit", "number"]]), "--interval or --limit"),
	})),

	...group("department-budgets", crud({
		base: "/department-budgets",
		noun: "department budget",
		label: "Department budget id",
		listUsage: "[--department <id>]",
		listBuild: (_args, flags) => ({ method: "GET", path: appendQuery("/department-budgets", { department_id: flagString(flags, "department") }) }),
		createUsage: "--department <id> --interval daily|weekly|monthly --limit <usd>",
		updateUsage: "[--interval daily|weekly|monthly] [--limit <usd>]",
		create: (flags) => ({
			department_id: required(flagString(flags, "department"), "department"),
			interval: required(flagString(flags, "interval"), "interval"),
			limit: required(flagNumber(flags, "limit"), "limit"),
		}),
		update: (flags) => nonEmpty(bodyFromFlags(flags, [["interval", "interval"], ["limit", "limit", "number"]]), "--interval or --limit"),
	})),

	...group("spend-rules", {
		...crud({
			base: "/spend-rules",
			noun: "spend rule",
			label: "Spend rule id",
			listUsage: PAGE,
			createUsage: SPEND_RULE_USAGE,
			updateUsage: SPEND_RULE_USAGE,
			create: (flags) => nonEmpty(spendRuleBody(flags), "rule flags"),
			update: (flags) => nonEmpty(spendRuleBody(flags), "a field to update"),
		}),
		test: {
			usage: "<id>",
			description: "Send a test alert for the rule to its destinations.",
			output: "action",
			done: "Sent spend rule test",
			build: (args) => ({ method: "POST", path: `/spend-rules/${id(arg(args, 0, "Spend rule id"))}/test`, body: {} }),
		},
		preview: { usage: "<id>", output: "detail", build: (args) => ({ method: "GET", path: `/spend-rules/${id(arg(args, 0, "Spend rule id"))}/preview` }) },
		history: {
			usage: `<id> ${PAGE}`,
			output: "list",
			build: (args, flags) => ({ method: "GET", path: appendQuery(`/spend-rules/${id(arg(args, 0, "Spend rule id"))}/history`, pageQuery(flags)) }),
		},
	}),

	"spend-blocks list": {
		usage: "[--include-lifted] [--limit <n>]",
		output: "list",
		build: (_args, flags) => ({ method: "GET", path: appendQuery("/spend-blocks", { include_lifted: flagBool(flags, "include-lifted") || undefined, limit: flagString(flags, "limit") }) }),
	},
	"spend-blocks lift": {
		usage: "<id> [--yes]",
		output: "action",
		done: "Lifted spend block",
		confirm: (args) => `This lifts spend block ${args[0]} and lets blocked traffic through again.`,
		build: (args) => ({ method: "POST", path: `/spend-blocks/${id(arg(args, 0, "Spend block id"))}/lift`, body: {} }),
	},

	...group("rate-limits policies", crud({
		base: "/rate-limits/policies",
		noun: "rate limit policy",
		label: "Rate limit policy id",
		listUsage: PAGE,
		createUsage: `--name <name> ${RATE_LIMIT_POLICY_USAGE}`,
		updateUsage: `[--name <name>] ${RATE_LIMIT_POLICY_USAGE}`,
		create: (flags) => {
			const body = bodyFromFlags(flags, RATE_LIMIT_POLICY_FIELDS);
			required(body.name as string | undefined, "name");
			return body;
		},
		update: (flags) => nonEmpty(bodyFromFlags(flags, RATE_LIMIT_POLICY_FIELDS), "a field to update"),
	})),
	...group("rate-limits assignments", crud({
		base: "/rate-limits/assignments",
		noun: "rate limit assignment",
		label: "Rate limit assignment id",
		listUsage: `[--policy <id>] [--target-type key|member|department|guardrail|end_user_default] ${PAGE}`,
		listBuild: (_args, flags) => ({
			method: "GET",
			path: appendQuery("/rate-limits/assignments", { policy_id: flagString(flags, "policy"), target_type: flagString(flags, "target-type"), ...pageQuery(flags) }),
		}),
		createUsage: "--policy <id> --target-type key|member|department|guardrail|end_user_default [--target <id>]",
		updateUsage: "--policy <id>",
		create: (flags) => ({
			policy_id: required(flagString(flags, "policy"), "policy"),
			target_type: required(flagString(flags, "target-type"), "target-type"),
			...(flagString(flags, "target") ? { target_id: flagString(flags, "target") } : {}),
		}),
		update: (flags) => ({ policy_id: required(flagString(flags, "policy"), "policy") }),
	})),

	"observability logging-policy get": { usage: "", output: "detail", build: () => ({ method: "GET", path: "/observability/logging-policy" }) },
	"observability logging-policy update": {
		usage: "[--enabled true|false] [--retention-days <n>] [--include-provider-payloads true|false]",
		output: "action",
		done: "Updated logging policy",
		build: (_args, flags) => ({
			method: "PATCH",
			path: "/observability/logging-policy",
			body: nonEmpty(bodyFromFlags(flags, [["enabled", "enabled", "bool"], ["retention-days", "retention_days", "int"], ["include-provider-payloads", "include_provider_payloads", "bool"]]), "a field to update"),
		}),
	},
	...group("observability destinations", crud({
		base: "/observability/destinations",
		noun: "observability destination",
		label: "Destination id",
		description: "Destination configs usually hold provider credentials. Pass them with --config-stdin or --config-env <VAR>; --config-json puts them in argv, which is visible in shell history and process lists.",
		listUsage: PAGE,
		createUsage: "--type <type> --name <name> (--config-stdin | --config-env <VAR> | --config-json <json>) [--enabled true|false] [--privacy-mode true|false] [--sampling-rate <0-1>] [--body-json <json>]",
		updateUsage: "[--name <name>] [--config-stdin | --config-env <VAR> | --config-json <json>] [--enabled true|false] [--privacy-mode true|false] [--sampling-rate <0-1>] [--body-json <json>]",
		create: async (flags, input) => {
			const body = await observabilityDestinationBody(flags, input);
			required(body.type as string | undefined, "type");
			required(body.name as string | undefined, "name");
			if (body.config === undefined) throw new Error("--config-stdin, --config-env or --config-json is required");
			return body;
		},
		update: async (flags, input) => {
			if (flags.type !== undefined) throw new Error("The destination type cannot be changed; create a new destination instead");
			return nonEmpty(await observabilityDestinationBody(flags, input), "a field to update");
		},
	})),

	"notifications settings get": { usage: "", output: "detail", build: () => ({ method: "GET", path: "/notifications/settings" }) },
	"notifications settings update": {
		usage: "[--auto-top-up true|false] [--auto-top-up-threshold-usd <usd>] [--auto-top-up-amount-usd <usd>] [--payment-method <id>] [--low-balance-email true|false] [--low-balance-threshold-usd <usd>] [--auto-top-up-failure-email true|false] [--payment-method-expiring-email true|false] [--model-deprecation-email true|false] [--department-attribution all|primary] [--billing-time-zone <tz>] [--body-json <json>]",
		description: "Enabling auto top-up needs --auto-top-up-threshold-usd, --auto-top-up-amount-usd (at least 1) and --payment-method in the same call.",
		output: "action",
		done: "Updated notification settings",
		build: (_args, flags) => {
			const autoTopUpFlags = ["auto-top-up-threshold-usd", "auto-top-up-amount-usd", "payment-method"];
			if (autoTopUpFlags.some((flag) => flags[flag] !== undefined) && flags["auto-top-up"] === undefined) {
				throw new Error("--auto-top-up true|false is required when changing auto top-up fields");
			}
			if (flags["low-balance-threshold-usd"] !== undefined && flags["low-balance-email"] === undefined) {
				throw new Error("--low-balance-email true|false is required with --low-balance-threshold-usd");
			}
			const body = bodyFromFlags(flags, [
				["auto-top-up", "auto_top_up.enabled", "bool"],
				["auto-top-up-threshold-usd", "auto_top_up.balance_threshold_nanos", "usd-nanos"],
				["auto-top-up-amount-usd", "auto_top_up.amount_nanos", "usd-nanos"],
				["payment-method", "auto_top_up.payment_method_id"],
				["low-balance-email", "low_balance_email.enabled", "bool"],
				["low-balance-threshold-usd", "low_balance_email.threshold_usd", "number"],
				["auto-top-up-failure-email", "email_preferences.auto_top_up_failure", "bool"],
				["payment-method-expiring-email", "email_preferences.payment_method_expiring", "bool"],
				["model-deprecation-email", "email_preferences.model_deprecation", "bool"],
				["department-attribution", "spend.department_attribution"],
				["billing-time-zone", "spend.billing_time_zone"],
			]);
			return { method: "PATCH", path: "/notifications/settings", body: nonEmpty(body, "a settings flag") };
		},
	},
	"notifications destinations list": { usage: "", output: "list", build: () => ({ method: "GET", path: "/notifications/destinations" }) },
	"notifications destinations create": {
		usage: "--name <name> --type email|discord|discord_webhook|slack|microsoft_teams|custom_webhook (--target <value> | --target-stdin) [--show-secret]",
		description: "Webhook URLs often embed credentials; prefer --target-stdin for them. Signed destinations return a one-time signing secret.",
		output: "action",
		done: "Created notification destination",
		build: async (_args, flags, input) => ({
			method: "POST",
			path: "/notifications/destinations",
			body: {
				name: required(flagString(flags, "name"), "name"),
				type: required(flagString(flags, "type"), "type"),
				target: await notificationTarget(flags, input),
			},
		}),
	},
	"notifications destinations delete": {
		usage: "<id> [--yes]",
		output: "action",
		done: "Deleted notification destination",
		confirm: (args) => `This permanently deletes notification destination ${args[0]}.`,
		build: (args) => ({ method: "DELETE", path: `/notifications/destinations/${id(arg(args, 0, "Destination id"))}` }),
	},
	"notifications destinations test": {
		usage: "<id> | --type <type> (--target <value> | --target-stdin)",
		description: "Test a saved destination by id, or an unsaved one by type and target.",
		output: "action",
		done: "Sent test notification",
		build: async (args, flags, input) => args[0]
			? { method: "POST", path: `/notifications/destinations/${id(args[0])}/test`, body: {} }
			: {
				method: "POST",
				path: "/notifications/destinations/test",
				body: { type: required(flagString(flags, "type"), "type"), target: await notificationTarget(flags, input) },
			},
	},
	"notifications destinations rotate-secret": {
		usage: "<id> [--yes] [--show-secret]",
		output: "action",
		done: "Rotated notification signing secret",
		confirm: (args) => `This replaces the signing secret for destination ${args[0]}; receivers using the old secret will reject new deliveries.`,
		build: (args) => ({ method: "POST", path: `/notifications/destinations/${id(arg(args, 0, "Destination id"))}/rotate-secret`, body: {} }),
	},
	"notifications routes list": { usage: "", output: "detail", build: () => ({ method: "GET", path: "/notifications/routes" }) },
	"notifications routes set": {
		usage: "<event-kind> (--destination-ids <id,id> | --clear)",
		output: "action",
		done: "Updated notification route",
		build: (args, flags) => {
			const eventKind = arg(args, 0, "Event kind");
			const destinationIds = flagBool(flags, "clear") ? [] : required(parseCsvFlag(flags, "destination-ids"), "destination-ids");
			return { method: "PUT", path: `/notifications/routes/${id(eventKind)}`, body: { destination_ids: destinationIds } };
		},
	},

	...group("routing dynamic-routes", {
		...crud({
			base: "/routing/dynamic-routes",
			noun: "dynamic route",
			label: "Dynamic route id",
			listUsage: PAGE,
			createUsage: "--name <name> --config-json <json> [--slug <slug>] [--description <text>] [--status active|paused]",
			updateUsage: "[--name <name>] [--description <text>] [--status active|paused] [--config-json <json>]",
			create: (flags) => {
				const body = bodyFromFlags(flags, [["name", "name"], ["slug", "slug"], ["description", "description"], ["status", "status"], ["config-json", "config", "json"]]);
				required(body.name as string | undefined, "name");
				required(body.config as object | undefined, "config-json");
				return body;
			},
			update: (flags) => nonEmpty(bodyFromFlags(flags, [["name", "name"], ["description", "description"], ["status", "status"], ["config-json", "config", "json"]]), "a field to update"),
		}),
		delete: {
			usage: "<id> [--confirm-name <name>] [--yes]",
			output: "action",
			done: "Deleted dynamic route",
			confirm: (args) => `This permanently deletes dynamic route ${args[0]} and unlinks its keys.`,
			build: (args, flags) => ({
				method: "DELETE",
				path: appendQuery(`/routing/dynamic-routes/${id(arg(args, 0, "Dynamic route id"))}`, { confirm_name: flagString(flags, "confirm-name") }),
			}),
		},
		"set-keys": {
			usage: "<id> (--key-ids <id,id> | --clear)",
			description: "Replace the API keys that use this route.",
			output: "action",
			done: "Updated dynamic route keys",
			build: (args, flags) => ({
				method: "PUT",
				path: `/routing/dynamic-routes/${id(arg(args, 0, "Dynamic route id"))}/keys`,
				body: { key_ids: flagBool(flags, "clear") ? [] : required(parseCsvFlag(flags, "key-ids"), "key-ids") },
			}),
		},
		deploy: {
			usage: "<id> <version>",
			description: "Make a saved version the live configuration.",
			output: "action",
			done: "Deployed dynamic route version",
			build: (args) => ({
				method: "POST",
				path: `/routing/dynamic-routes/${id(arg(args, 0, "Dynamic route id"))}/versions/${id(arg(args, 1, "Version"))}/deploy`,
				body: {},
			}),
		},
	}),

	...group("private-models", crud({
		base: "/private-models",
		noun: "private model",
		label: "Private model id",
		createUsage: `--model-reference <ref> --name <name> --base-url <url> --upstream-model <id> [--credential-stdin | --credential-env <VAR>] ${PRIVATE_MODEL_USAGE}`,
		updateUsage: `[--name <name>] [--base-url <url>] [--upstream-model <id>] [--credential-stdin | --credential-env <VAR>] ${PRIVATE_MODEL_USAGE}`,
		create: async (flags, input) => {
			rejectSecretBodyFields(flags, PRIVATE_MODEL_SECRET_FIELDS, "credential");
			const body = bodyFromFlags(flags, PRIVATE_MODEL_FIELDS);
			for (const [flag, key] of [["model-reference", "model_reference"], ["name", "name"], ["base-url", "base_url"], ["upstream-model", "upstream_model_id"]]) {
				required(body[key] as string | undefined, flag);
			}
			body.credential = await readSecretFlag(flags, input, { flag: "credential", defaultEnv: "PHASEO_PRIVATE_MODEL_CREDENTIAL", required: true });
			return body;
		},
		update: async (flags, input) => {
			rejectSecretBodyFields(flags, PRIVATE_MODEL_SECRET_FIELDS, "credential");
			const body = bodyFromFlags(flags, PRIVATE_MODEL_FIELDS);
			const credential = await readSecretFlag(flags, input, { flag: "credential", defaultEnv: "PHASEO_PRIVATE_MODEL_CREDENTIAL", required: false });
			if (credential) body.credential = credential;
			return nonEmpty(body, "a field to update");
		},
	})),

	...group("classifiers", crud({
		base: "/classifiers",
		noun: "classifier",
		label: "Classifier id",
		createUsage: `--name <name> --model <id> --dimensions-json <json> ${CLASSIFIER_USAGE}`,
		updateUsage: `[--name <name>] [--model <id>] [--dimensions-json <json>] ${CLASSIFIER_USAGE}`,
		create: (flags) => {
			const body = bodyFromFlags(flags, CLASSIFIER_FIELDS);
			required(body.name as string | undefined, "name");
			required(body.model as string | undefined, "model");
			required(body.dimensions as unknown[] | undefined, "dimensions-json");
			return body;
		},
		update: (flags) => nonEmpty(bodyFromFlags(flags, CLASSIFIER_FIELDS), "a field to update"),
	})),

	"presets versions list": { usage: "<preset>", output: "list", build: (args) => ({ method: "GET", path: `/presets/${id(arg(args, 0, "Preset id, slug, or name"))}/versions` }) },
	"presets versions create": {
		usage: "<preset> [--release-notes <text>] [--version-label <label>]",
		description: "Publish the current draft as a new version.",
		output: "action",
		done: "Published preset version",
		build: (args, flags) => ({
			method: "POST",
			path: `/presets/${id(arg(args, 0, "Preset id, slug, or name"))}/versions`,
			body: bodyFromFlags(flags, [["release-notes", "release_notes"], ["version-label", "version_label"]]),
		}),
	},
	"presets labels list": { usage: "<preset>", output: "list", build: (args) => ({ method: "GET", path: `/presets/${id(arg(args, 0, "Preset id, slug, or name"))}/labels` }) },
	"presets labels set": {
		usage: "<preset> <label> (--version-id <id> | --version <version>)",
		output: "action",
		done: "Moved preset label",
		build: (args, flags) => {
			const body = bodyFromFlags(flags, [["version-id", "version_id"], ["version", "version"]]);
			if (!body.version_id && !body.version) throw new Error("--version-id or --version is required");
			return { method: "PUT", path: `/presets/${id(arg(args, 0, "Preset id, slug, or name"))}/labels/${id(arg(args, 1, "Label"))}`, body };
		},
	},
	"presets labels delete": {
		usage: "<preset> <label> [--yes]",
		output: "action",
		done: "Deleted preset label",
		confirm: (args) => `This removes label ${args[1]} from preset ${args[0]}; requests pinned to it will stop resolving.`,
		build: (args) => ({ method: "DELETE", path: `/presets/${id(arg(args, 0, "Preset id, slug, or name"))}/labels/${id(arg(args, 1, "Label"))}` }),
	},
	"presets fork": {
		usage: "<preset> [--source-version-id <id>]",
		output: "action",
		done: "Forked preset",
		build: (args, flags) => ({
			method: "POST",
			path: `/presets/${id(arg(args, 0, "Preset id, slug, or name"))}/fork`,
			body: bodyFromFlags(flags, [["source-version-id", "source_version_id"]]),
		}),
	},
	"presets upstream": {
		usage: "<preset> --version-id <id>",
		description: "Pull an upstream version into a forked preset.",
		output: "action",
		done: "Updated preset from upstream",
		build: (args, flags) => ({
			method: "POST",
			path: `/presets/${id(arg(args, 0, "Preset id, slug, or name"))}/upstream`,
			body: { version_id: required(flagString(flags, "version-id"), "version-id") },
		}),
	},
	"presets publisher get": { usage: "", output: "detail", build: () => ({ method: "GET", path: "/presets/publisher" }) },
	"presets publisher set": {
		usage: "--handle <handle>",
		output: "action",
		done: "Updated preset publisher",
		build: (_args, flags) => ({ method: "PUT", path: "/presets/publisher", body: { handle: required(flagString(flags, "handle"), "handle") } }),
	},

	"workspaces set-role": {
		usage: "<workspace> <user-id> --role admin|member",
		output: "action",
		done: "Updated member role",
		build: (args, flags) => ({
			method: "PATCH",
			path: `/workspaces/${id(arg(args, 0, "Workspace id or slug"))}/members/${id(arg(args, 1, "User id"))}`,
			body: { role: required(flagString(flags, "role"), "role") },
		}),
	},
	"workspaces invites list": {
		usage: `<workspace> ${PAGE}`,
		output: "list",
		build: (args, flags) => ({ method: "GET", path: appendQuery(`/workspaces/${id(arg(args, 0, "Workspace id or slug"))}/invites`, pageQuery(flags)) }),
	},
	"workspaces invites create": {
		usage: "<workspace> [--role admin|member] [--expires-in-days <n>] [--max-uses <n>] [--show-secret]",
		description: "The invite token is shown once; use --show-secret or --json to capture it.",
		output: "action",
		done: "Created workspace invite",
		build: (args, flags) => ({
			method: "POST",
			path: `/workspaces/${id(arg(args, 0, "Workspace id or slug"))}/invites`,
			body: bodyFromFlags(flags, [["role", "role"], ["expires-in-days", "expires_in_days", "int"], ["max-uses", "max_uses", "int"]]),
		}),
	},
	"workspaces invites revoke": {
		usage: "<workspace> <invite-id> [--yes]",
		output: "action",
		done: "Revoked workspace invite",
		confirm: (args) => `This revokes invite ${args[1]} in workspace ${args[0]}.`,
		build: (args) => ({ method: "DELETE", path: `/workspaces/${id(arg(args, 0, "Workspace id or slug"))}/invites/${id(arg(args, 1, "Invite id"))}` }),
	},
	"workspaces join-requests list": {
		usage: `<workspace> [--status pending|approved|rejected] ${PAGE}`,
		output: "list",
		build: (args, flags) => ({
			method: "GET",
			path: appendQuery(`/workspaces/${id(arg(args, 0, "Workspace id or slug"))}/join-requests`, { status: flagString(flags, "status"), ...pageQuery(flags) }),
		}),
	},
	"workspaces join-requests approve": {
		usage: "<workspace> <request-id>",
		output: "action",
		done: "Approved join request",
		build: (args) => ({ method: "POST", path: `/workspaces/${id(arg(args, 0, "Workspace id or slug"))}/join-requests/${id(arg(args, 1, "Join request id"))}/approve`, body: {} }),
	},
	"workspaces join-requests reject": {
		usage: "<workspace> <request-id>",
		output: "action",
		done: "Rejected join request",
		build: (args) => ({ method: "POST", path: `/workspaces/${id(arg(args, 0, "Workspace id or slug"))}/join-requests/${id(arg(args, 1, "Join request id"))}/reject`, body: {} }),
	},

	"identity sso get": { usage: "", output: "detail", build: () => ({ method: "GET", path: "/identity/sso" }) },
	"identity sso update": {
		usage: "--enabled true|false --mode none|saml|custom_oidc [--provider-identifier <id>] [--domains <domain,domain>]",
		output: "action",
		done: "Updated SSO settings",
		build: (_args, flags) => {
			const body = bodyFromFlags(flags, [["enabled", "enabled", "bool"], ["mode", "mode"], ["provider-identifier", "provider_identifier"], ["domains", "domains", "csv"]]);
			if (typeof body.enabled !== "boolean") throw new Error("--enabled is required");
			required(body.mode as string | undefined, "mode");
			return { method: "PUT", path: "/identity/sso", body };
		},
	},
	"identity scim get": { usage: "", output: "detail", build: () => ({ method: "GET", path: "/identity/scim" }) },
	"identity scim update": {
		usage: "--enabled true|false",
		output: "action",
		done: "Updated SCIM settings",
		build: (_args, flags) => {
			if (flags.enabled === undefined) throw new Error("--enabled is required");
			return { method: "PUT", path: "/identity/scim", body: { enabled: flagBool(flags, "enabled") } };
		},
	},
	"identity scim tokens create": {
		usage: "[--label <label>] [--expires-at <iso>] [--show-secret]",
		description: "The provisioning token is shown once; use --show-secret or --json to capture it.",
		output: "action",
		done: "Created SCIM token",
		build: (_args, flags) => ({ method: "POST", path: "/identity/scim/tokens", body: bodyFromFlags(flags, [["label", "label"], ["expires-at", "expires_at"]]) }),
	},
	"identity scim tokens revoke": {
		usage: "<id> [--yes]",
		output: "action",
		done: "Revoked SCIM token",
		confirm: (args) => `This revokes SCIM token ${args[0]}; your identity provider will stop provisioning with it.`,
		build: (args) => ({ method: "DELETE", path: `/identity/scim/tokens/${id(arg(args, 0, "SCIM token id"))}` }),
	},
	"identity scim audit": {
		usage: "[--limit <n>] [--before <iso>]",
		output: "list",
		build: (_args, flags) => ({ method: "GET", path: appendQuery("/identity/scim/audit", { limit: flagString(flags, "limit"), before: flagString(flags, "before") }) }),
	},
	"identity directory list": { usage: "", output: "detail", build: () => ({ method: "GET", path: "/identity/directory" }) },
	"identity directory update": {
		usage: "<user-id> [--access-role directory|admin|member] [--department-mode directory|department|none] [--department <id>] [--department-position member|lead]",
		description: "Changes only the fields you pass; the rest of the member's current override is kept. --department implies --department-mode department.",
		output: "action",
		done: "Updated directory member",
		build: async (args, flags, input) => {
			const userId = arg(args, 0, "User id");
			const changes = nonEmpty(bodyFromFlags(flags, [
				["access-role", "access_role"],
				["department-mode", "department_mode"],
				["department", "department_id"],
				["department-position", "department_position"],
			]), "a field to update");
			// The API ignores department_id unless department_mode is "department" and defaults the mode to "directory".
			if (changes.department_id !== undefined) {
				changes.department_mode ??= "department";
				if (changes.department_mode !== "department") throw new Error("--department needs --department-mode department");
			}
			const current = await currentDirectoryOverride(input, userId);
			const body = { ...current, ...changes };
			if (body.department_mode !== "department") delete body.department_id;
			if (body.department_mode === "department" && current.department_mode === "department" && changes.department_position === undefined) {
				throw new Error("This member already has a department override and the API would reset its position to member. Pass --department-position member|lead to keep or set it.");
			}
			return { method: "PUT", path: `/identity/directory/members/${id(userId)}`, body };
		},
	},
	...group("identity departments", crud({
		base: "/identity/departments",
		noun: "department",
		label: "Department id",
		skipGet: true,
		createUsage: "--name <name> [--description <text>] [--icon <icon>] [--color <color>]",
		updateUsage: "[--name <name>] [--description <text>] [--icon <icon>] [--color <color>]",
		create: (flags) => {
			const body = bodyFromFlags(flags, DEPARTMENT_FIELDS);
			required(body.name as string | undefined, "name");
			return body;
		},
		update: (flags) => nonEmpty(bodyFromFlags(flags, DEPARTMENT_FIELDS), "a field to update"),
	})),
	"identity departments set-member": {
		usage: "<department-id> <user-id> [--position member|lead] [--primary true|false]",
		output: "action",
		done: "Updated department member",
		build: (args, flags) => ({
			method: "PUT",
			path: `/identity/departments/${id(arg(args, 0, "Department id"))}/members/${id(arg(args, 1, "User id"))}`,
			body: bodyFromFlags(flags, [["position", "position"], ["primary", "primary", "bool"]]),
		}),
	},
	"identity departments remove-member": {
		usage: "<department-id> <user-id> [--yes]",
		output: "action",
		done: "Removed department member",
		confirm: (args) => `This removes user ${args[1]} from department ${args[0]}.`,
		build: (args) => ({ method: "DELETE", path: `/identity/departments/${id(arg(args, 0, "Department id"))}/members/${id(arg(args, 1, "User id"))}` }),
	},
	...group("identity group-mappings", crud({
		base: "/identity/group-mappings",
		noun: "group mapping",
		label: "Group mapping id",
		skipGet: true,
		createUsage: "--scim-group <id> --department <id> [--access-role member|admin] [--department-position member|lead]",
		updateUsage: "[--access-role member|admin] [--department-position member|lead]",
		create: (flags) => ({
			scim_group_id: required(flagString(flags, "scim-group"), "scim-group"),
			department_id: required(flagString(flags, "department"), "department"),
			...bodyFromFlags(flags, [["access-role", "access_role"], ["department-position", "department_position"]]),
		}),
		update: (flags) => nonEmpty(bodyFromFlags(flags, [["access-role", "access_role"], ["department-position", "department_position"]]), "a field to update"),
	})),

	...group("workload-identity policies", crud({
		base: "/workload-identity/policies",
		noun: "workload identity policy",
		label: "Policy id",
		createUsage: "--name <name> --provider vercel|github_actions --owner-id <id> [--issuer <url>] [--claim-conditions-json <json>] [--max-token-lifetime-seconds <n>]",
		updateUsage: "[--name <name>] [--status active|disabled] [--claim-conditions-json <json>] [--max-token-lifetime-seconds <n>]",
		create: (flags) => {
			const body = bodyFromFlags(flags, WORKLOAD_POLICY_FIELDS);
			for (const [flag, key] of [["name", "name"], ["provider", "provider"], ["owner-id", "owner_id"]]) required(body[key] as string | undefined, flag);
			return body;
		},
		update: (flags) => nonEmpty(bodyFromFlags(flags, WORKLOAD_POLICY_FIELDS.filter(([flag]) => !["provider", "issuer", "owner-id"].includes(flag))), "a field to update"),
	})),

	"keys rotate": {
		usage: "<id> [--previous-key-expires-at <iso>] [--show-secret] [--yes]",
		description: "Create a replacement key with the same settings. The old key keeps working until --previous-key-expires-at, if given. The new secret is shown once.",
		output: "action",
		done: "Rotated API key",
		confirm: (args) => `This creates a replacement for API key ${args[0]} and shows its secret once; the old key stops working at --previous-key-expires-at if you set it.`,
		build: (args, flags) => ({
			method: "POST",
			path: `/keys/${id(arg(args, 0, "Key id"))}/rotate`,
			body: bodyFromFlags(flags, [["previous-key-expires-at", "previous_key_expires_at"]]),
		}),
	},
	"keys invalidate": {
		usage: "<id> [--yes]",
		description: "Drop the key from the gateway cache so the next request re-reads its current state.",
		output: "action",
		done: "Invalidated API key cache",
		confirm: (args) => `This invalidates cached state for API key ${args[0]}.`,
		build: (args) => ({ method: "POST", path: `/keys/${id(arg(args, 0, "Key id"))}/invalidate`, body: {} }),
	},
	"webhooks test": {
		usage: "<id>",
		description: "Send a signed test event to the webhook endpoint and report the response.",
		output: "detail",
		build: (args) => ({ method: "POST", path: `/webhook-endpoints/${id(arg(args, 0, "Webhook endpoint id"))}/test`, body: {} }),
	},
	"analytics export": {
		usage: "[--date YYYY-MM-DD] [--workspace <id>] [--key-id <id>] [--model <id>] [--provider <id>] [--endpoint <id>] [--label-key <key> --label-value <value>] [--end-user-id <id>] [--byok true|false] [--success true|false]",
		description: "Write the analytics CSV to stdout; redirect it to save a file.",
		output: "raw",
		build: (_args, flags) => ({
			method: "GET",
			path: appendQuery("/analytics/export", {
				...filterQuery(flags, ["date", "key-id", "model", "provider", "endpoint", "label-key", "label-value", "end-user-id", "byok", "success"]),
				workspace_id: flagString(flags, "workspace"),
			}),
		}),
	},
	"events list": {
		usage: `[--request-id <id>] [--session-id <id>] [--preset-id <id>] [--test-run-id <id>] [--category feedback|behavior|outcome|app|test|custom] [--event <name>] ${PAGE}`,
		output: "list",
		build: (_args, flags) => ({
			method: "GET",
			path: appendQuery("/events", { ...filterQuery(flags, ["request-id", "session-id", "preset-id", "test-run-id", "category", "event"]), ...pageQuery(flags) }),
		}),
	},
	"events create": {
		usage: "--event-name <name> [--category feedback|behavior|outcome|app|test|custom] [--request-id <id>] [--session-id <id>] [--preset-id <id>] [--numeric-value <n>] [--value-json <json>] [--occurred-at <iso>] [--body-json <json>]",
		output: "action",
		done: "Recorded event",
		build: (_args, flags) => {
			const body = bodyFromFlags(flags, [
				["event-name", "event_name"],
				["category", "category"],
				["request-id", "request_id"],
				["session-id", "session_id"],
				["preset-id", "preset_id"],
				["test-run-id", "test_run_id"],
				["numeric-value", "numeric_value", "number"],
				["value-json", "value", "json"],
				["occurred-at", "occurred_at"],
			]);
			required(body.event_name as string | undefined, "event-name");
			return { method: "POST", path: "/events", body };
		},
	},

	"audit-events list": {
		usage: "[--limit <n>] [--cursor <cursor>] [--action <action>] [--target-type <type>]",
		output: "list",
		build: (_args, flags) => ({ method: "GET", path: appendQuery("/audit-events", filterQuery(flags, ["limit", "cursor", "action", "target-type"])) }),
	},

	"apps list": { usage: PAGE, output: "list", build: list("/apps") },
	"apps update": {
		usage: "<id> [--title <title>] [--url <url>] [--docs-url <url>] [--image-url <url>] [--public true|false] [--active true|false] [--category <category>]",
		output: "action",
		done: "Updated app",
		build: (args, flags) => ({
			method: "PATCH",
			path: `/apps/${id(arg(args, 0, "App id"))}`,
			body: nonEmpty(bodyFromFlags(flags, [
				["title", "title"],
				["url", "url"],
				["docs-url", "docs_url"],
				["image-url", "image_url"],
				["public", "is_public", "bool"],
				["active", "is_active", "bool"],
				["category", "category"],
			]), "a field to update"),
		}),
	},
	"apps merge": {
		usage: "<id> --into <target-app-id> [--yes]",
		description: "Merge an app's attribution history into another app.",
		output: "action",
		done: "Merged app",
		confirm: (args) => `This merges app ${args[0]} into another app and cannot be undone.`,
		build: (args, flags) => ({
			method: "POST",
			path: `/apps/${id(arg(args, 0, "App id"))}/merge`,
			body: { target_app_id: required(flagString(flags, "into"), "into") },
		}),
	},

	"feedback list": {
		usage: `[--request-id <id>] [--session-id <id>] [--preset-id <id>] [--test-run-id <id>] [--rating <rating>] [--since <iso>] [--until <iso>] ${PAGE}`,
		output: "list",
		build: (_args, flags) => ({ method: "GET", path: appendQuery("/feedback", { ...filterQuery(flags, [...FEEDBACK_FILTERS, "rating"]), ...pageQuery(flags) }) }),
	},
	"feedback create": {
		usage: "[--request-id <id>] [--session-id <id>] [--preset-id <id>] [--rating <rating>] [--score <n>] [--reason <text>] [--comment <text>] [--body-json <json>]",
		output: "action",
		done: "Recorded feedback",
		build: (_args, flags) => ({
			method: "POST",
			path: "/feedback",
			body: nonEmpty(bodyFromFlags(flags, [
				["request-id", "request_id"],
				["session-id", "session_id"],
				["preset-id", "preset_id"],
				["test-run-id", "test_run_id"],
				["rating", "rating"],
				["score", "score", "number"],
				["reason", "reason"],
				["comment", "comment"],
			]), "feedback flags"),
		}),
	},
	"feedback summary": {
		usage: "[--group-by <field>] [--metadata-key <key>] [--preset-id <id>] [--test-run-id <id>] [--since <iso>] [--until <iso>]",
		output: "detail",
		build: (_args, flags) => ({ method: "GET", path: appendQuery("/feedback/summary", filterQuery(flags, ["group-by", "metadata-key", "preset-id", "test-run-id", "since", "until"])) }),
	},

	"preset-test-runs list": {
		usage: `[--preset-id <id>] ${PAGE}`,
		output: "list",
		build: (_args, flags) => ({ method: "GET", path: appendQuery("/preset-test-runs", { preset_id: flagString(flags, "preset-id"), ...pageQuery(flags) }) }),
	},
	"preset-test-runs create": {
		usage: "[--preset-id <id>] [--baseline-preset-id <id>] [--name <name>] [--description <text>] [--dataset-name <name>] [--status pending|running|completed|failed|cancelled] [--body-json <json>]",
		output: "action",
		done: "Created preset test run",
		build: (_args, flags) => ({
			method: "POST",
			path: "/preset-test-runs",
			body: bodyFromFlags(flags, [
				["preset-id", "preset_id"],
				["baseline-preset-id", "baseline_preset_id"],
				["name", "name"],
				["description", "description"],
				["dataset-name", "dataset_name"],
				["status", "status"],
			]),
		}),
	},
	"preset-test-runs get": { usage: "<id>", output: "detail", build: (args) => ({ method: "GET", path: `/preset-test-runs/${id(arg(args, 0, "Test run id"))}` }) },
	"preset-test-runs update": {
		usage: "<id> [--name <name>] [--description <text>] [--status pending|running|completed|failed|cancelled] [--summary-json <json>] [--body-json <json>]",
		output: "action",
		done: "Updated preset test run",
		build: (args, flags) => ({
			method: "PATCH",
			path: `/preset-test-runs/${id(arg(args, 0, "Test run id"))}`,
			body: nonEmpty(bodyFromFlags(flags, [["name", "name"], ["description", "description"], ["status", "status"], ["summary-json", "summary", "json"]]), "a field to update"),
		}),
	},
};

/**
 * PUT /identity/directory/members/:id replaces the whole override, so read the current one and
 * resend the fields the caller did not change. The directory does not report the override's
 * department position, so keeping a department override requires --department-position.
 */
async function currentDirectoryOverride(input: ManagementInput, userId: string): Promise<Record<string, unknown>> {
	if (!input.request) throw new Error("Reading the current directory override needs an API session");
	const directory = await input.request("/identity/directory", { method: "GET" });
	const members = Array.isArray(directory?.data?.members) ? directory.data.members : [];
	const member = members.find((entry: any) => entry?.user_id === userId);
	if (!member) throw new Error(`User ${userId} is not a member of this workspace directory`);
	const current: Record<string, unknown> = { access_role: member.role_override ?? "directory" };
	if (!member.department_override_enabled) current.department_mode = "directory";
	else if (member.department_override_id) {
		current.department_mode = "department";
		current.department_id = member.department_override_id;
	} else current.department_mode = "none";
	return current;
}

async function notificationTarget(flags: Flags, input: ManagementInput): Promise<string> {
	if (flagBool(flags, "target-stdin")) {
		const value = (await input.readStdin()).trim();
		if (!value) throw new Error("No value was read from stdin for --target-stdin");
		return value;
	}
	return required(flagString(flags, "target"), "target");
}

export const MANAGEMENT_GROUP_NOTES: Record<string, string> = {
	byok: "Bring-your-own provider keys. Secrets are read from stdin or the environment and never printed. If these return 403, run `phaseo login` again: older sessions lack the provider_credentials scopes.",
	"private-models": "If these return 403, run `phaseo login` again: older sessions lack the private_models scopes.",
	feedback: "Requires feedback:read and feedback:write, which the default login does not request. Log in again with an explicit --scopes list that adds them.",
	events: "Requires feedback:read and feedback:write, which the default login does not request. Log in again with an explicit --scopes list that adds them.",
	"preset-test-runs": "Requires feedback:read and feedback:write, which the default login does not request. Log in again with an explicit --scopes list that adds them.",
};

export function managementCommandKeys(): string[] {
	return Object.keys(COMMANDS);
}

export function resolveManagementCommand(tokens: string[]): { key: string; spec: CommandSpec; args: string[] } | null {
	for (let length = Math.min(tokens.length, 4); length >= 1; length--) {
		const key = tokens.slice(0, length).join(" ");
		const spec = COMMANDS[key];
		if (spec) return { key, spec, args: tokens.slice(length) };
	}
	return null;
}

export function managementUsage(key: string): string {
	const spec = COMMANDS[key];
	const flags = spec.output === "action" && spec.confirm && !spec.usage.includes("--yes") ? " [--yes]" : "";
	return `phaseo ${key} ${spec.usage}${flags} [--json]`.replace(/\s+/g, " ");
}

/** Help entries for every command plus each parent group, e.g. `rate-limits` and `rate-limits policies`. */
export function managementHelpEntries(): Record<string, { usage: string[]; description?: string }> {
	const entries: Record<string, { usage: string[]; description?: string }> = {};
	for (const [key, spec] of Object.entries(COMMANDS)) {
		const usage = managementUsage(key);
		entries[key] = { usage: [usage], ...(spec.description ? { description: spec.description } : {}) };
		const words = key.split(" ");
		for (let length = 1; length < words.length; length++) {
			const prefix = words.slice(0, length).join(" ");
			entries[prefix] ??= { usage: [], ...(MANAGEMENT_GROUP_NOTES[prefix] ? { description: MANAGEMENT_GROUP_NOTES[prefix] } : {}) };
			entries[prefix].usage.push(usage);
		}
	}
	return entries;
}

export async function buildManagementRequest(tokens: string[], flags: Flags, input: ManagementInput): Promise<ManagementRequest> {
	const match = resolveManagementCommand(tokens);
	if (!match) throw new Error(`Unknown command: ${tokens.join(" ")}`);
	return match.spec.build(match.args, flags, input);
}

function text(value: unknown): string {
	return sanitizeTerminalText(String(value));
}

function isScalar(value: unknown): value is string | number | boolean {
	return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function listItems(body: any): unknown[] | null {
	if (Array.isArray(body)) return body;
	if (Array.isArray(body?.data)) return body.data;
	for (const key of ["items", "events", "entries", "versions", "labels", "history"]) {
		if (Array.isArray(body?.data?.[key])) return body.data[key];
		if (Array.isArray(body?.[key])) return body[key];
	}
	return null;
}

export function renderManagementRow(item: any): string {
	if (!item || typeof item !== "object") return text(item);
	const state = typeof item.status === "string" ? item.status : typeof item.enabled === "boolean" ? (item.enabled ? "on" : "off") : undefined;
	const label = item.name ?? item.title ?? item.label ?? item.handle ?? item.email ?? item.slug ?? item.event_name ?? item.action ?? item.version_label ?? item.version;
	const identifier = item.id ?? item.key_id ?? item.user_id ?? item.request_id;
	const parts = [state, label, identifier].filter((part) => part !== undefined && part !== null && part !== "");
	return parts.length ? parts.map(text).join(" ") : text(JSON.stringify(item));
}

function humanize(key: string): string {
	const words = key.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderValue(value: unknown): string {
	if (value === null || value === undefined) return "none";
	if (isScalar(value)) return text(value);
	if (Array.isArray(value) && value.every(isScalar)) return value.length ? value.map(text).join(", ") : "none";
	return text(JSON.stringify(value));
}

/** Human output for one record. Secret-bearing fields are only printed with --show-secret. */
export function renderManagementDetail(record: Record<string, unknown>, showSecret: boolean): string {
	const lines: string[] = [];
	let hiddenSecret = false;
	for (const [key, value] of Object.entries(record)) {
		if (SECRET_FIELDS.has(key) && typeof value === "string" && value) {
			if (showSecret) lines.push(`${humanize(key)}: ${value}`);
			else hiddenSecret = true;
			continue;
		}
		if (Array.isArray(value) && value.some((entry) => entry && typeof entry === "object")) {
			lines.push(`${humanize(key)}:`);
			for (const entry of value) lines.push(`  ${renderManagementRow(entry)}`);
			continue;
		}
		lines.push(`${humanize(key)}: ${renderValue(value)}`);
	}
	if (hiddenSecret) lines.push("Secret hidden. Re-run with --json or --show-secret to capture it once.");
	return lines.length ? `${lines.join("\n")}\n` : "";
}

export function renderManagementResult(key: string, body: any, flags: Flags): string {
	const spec = COMMANDS[key];
	const showSecret = flagBool(flags, "show-secret");
	if (spec.output === "list") {
		const items = listItems(body);
		if (items) return items.length ? `${items.map(renderManagementRow).join("\n")}\n` : "No results.\n";
	}
	const data = body && typeof body === "object" && body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : body;
	// Some routes return one-time secrets beside `data` (for example workspace invite tokens).
	const record = data && typeof data === "object" && !Array.isArray(data)
		? { ...data, ...(data !== body && typeof body.token === "string" ? { token: body.token } : {}) }
		: null;
	if (spec.output === "action") {
		const name = record ? record.name ?? record.title ?? record.label : undefined;
		let out = `${spec.done ?? "Done"}${name ? `: ${text(name)}` : ""}.\n`;
		if (record?.id) out += `ID: ${text(record.id)}\n`;
		const secretKey = record ? Object.keys(record).find((field) => SECRET_FIELDS.has(field) && typeof record[field] === "string" && record[field]) : undefined;
		if (record && secretKey) {
			out += showSecret
				? `${humanize(secretKey)}: ${record[secretKey]}\n`
				: "Secret hidden. Re-run with --json or --show-secret to capture it once.\n";
		}
		return out;
	}
	return record ? renderManagementDetail(record, showSecret) : `${renderValue(body)}\n`;
}

export async function confirmDestructive(question: string, flags: Flags, deps: Pick<ManagementDeps, "confirm" | "interactive">): Promise<void> {
	if (flagBool(flags, "yes")) return;
	if (!deps.interactive || flagBool(flags, "json")) {
		throw new Error(`${question} Re-run with --yes to confirm.`);
	}
	if (!(await deps.confirm(`${question} Continue? [y/N] `))) throw new Error("Cancelled.");
}

export async function runManagementCommand(tokens: string[], flags: Flags, deps: ManagementDeps): Promise<boolean> {
	const match = resolveManagementCommand(tokens);
	if (!match) return false;
	const request = await match.spec.build(match.args, flags, deps);
	if (match.spec.confirm) await confirmDestructive(match.spec.confirm(match.args), flags, deps);
	const body = await deps.request(request.path, { method: request.method, body: request.body });
	if (match.spec.output === "raw" && typeof body === "string") deps.write(body);
	else deps.write(flagBool(flags, "json") ?`${JSON.stringify(body, null, 2)}\n` : renderManagementResult(match.key, body, flags));
	return true;
}
