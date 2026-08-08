type HelpEntry = {
	usage: string[];
	description?: string;
};

const HELP_ENTRIES: Record<string, HelpEntry> = {
	root: {
		description: "Phaseo CLI",
		usage: [
			"phaseo login [--api-url <url>] [--method browser|device] [--browser] [--device-code] [--scopes <csv>] [--json]",
			"phaseo logout [--json]",
			"phaseo whoami [--json]",
			"phaseo version [--json]",
			"",
			"phaseo keys --help",
			"phaseo workspaces --help",
			"phaseo presets --help",
			"phaseo settings --help",
			"phaseo guardrails --help",
			"phaseo oauth-clients --help",
			"phaseo management-keys --help",
			"phaseo models --help",
			"phaseo providers --help",
			"phaseo organisations --help",
			"phaseo endpoints --help",
			"phaseo pricing --help",
			"phaseo credits --help",
			"phaseo activity --help",
			"phaseo logs --help",
			"phaseo analytics --help",
			"phaseo generation --help",
			"phaseo curie --help",
			"phaseo integrations --help",
			"phaseo webhooks --help",
			"phaseo api --help",
			"",
			"Login scopes:",
			"  Default login requests full first-party CLI access across the control plane.",
			"  Use --scopes workspaces:read,keys:write,... when a narrower token is preferred.",
			"",
			"Environment:",
			"  PHASEO_API_URL  Override API root, defaults to https://api.phaseo.app",
		],
	},
	login: {
		usage: [
			"phaseo login [--api-url <url>] [--method browser|device] [--browser] [--device-code] [--scopes <csv>] [--json]",
		],
	},
	version: { usage: ["phaseo version [--json]"] },
	integrations: {
		usage: [
			"phaseo integrations list [--json]",
			"phaseo integrations status [codex|claude-code] [--json]",
			"phaseo integrations setup <codex|claude-code> [--model <id>] [--dry-run] [--json]",
			"phaseo integrations remove <codex|claude-code> [--dry-run] [--json]",
			"phaseo integrations credential",
		],
		description: "Detect and configure coding agents to use the Phaseo gateway.",
	},
	curie: {
		usage: [
			"phaseo curie run <config.json> [--repeats <n>] [--report <path>] [--base-url <url> --allow-custom-base-url --api-key-env PHASEO_CURIE_API_KEY] [--dry-run] [--json]",
		],
		description: "Run a local model comparison from a JSON configuration.",
	},
	"curie run": { usage: ["phaseo curie run <config.json> [--repeats <n>] [--report <path>] [--base-url <url> --allow-custom-base-url --api-key-env PHASEO_CURIE_API_KEY] [--dry-run] [--json]"] },
	logout: { usage: ["phaseo logout [--json]"] },
	whoami: { usage: ["phaseo whoami [--json]"] },
	keys: {
		usage: [
			"phaseo keys current [--json]",
			"phaseo keys list [--limit <n>] [--offset <n>] [--include-disabled] [--json]",
			"phaseo keys create --name <name> [--limit <usd>] [--limit-reset daily|weekly|monthly] [--expires-at <iso>] [--show-secret] [--json]",
			"phaseo keys get <id-or-hash> [--json]",
			"phaseo keys update <id-or-hash> [--name <name>] [--disabled true|false] [--limit <usd>] [--limit-reset daily|weekly|monthly] [--json]",
			"phaseo keys delete <id-or-hash> [--json]",
		],
	},
	"keys current": { usage: ["phaseo keys current [--json]"] },
	"keys list": { usage: ["phaseo keys list [--limit <n>] [--offset <n>] [--include-disabled] [--json]"] },
	"keys create": { usage: ["phaseo keys create --name <name> [--limit <usd>] [--limit-reset daily|weekly|monthly] [--expires-at <iso>] [--show-secret] [--json]"] },
	"keys get": { usage: ["phaseo keys get <id-or-hash> [--json]"] },
	"keys update": { usage: ["phaseo keys update <id-or-hash> [--name <name>] [--disabled true|false] [--limit <usd>] [--limit-reset daily|weekly|monthly] [--json]"] },
	"keys delete": { usage: ["phaseo keys delete <id-or-hash> [--json]"] },
	workspaces: {
		usage: [
			"phaseo workspaces list [--json]",
			"phaseo workspaces create --name <name> [--slug <slug>] [--json]",
			"phaseo workspaces get <id-or-slug> [--json]",
			"phaseo workspaces update <id-or-slug> [--name <name>] [--slug <slug>] [--json]",
			"phaseo workspaces delete <id-or-slug> [--json]",
			"phaseo workspaces members <id-or-slug> [--json]",
			"phaseo workspaces add-members <id-or-slug> --user-ids <id,id> [--role member|admin] [--json]",
			"phaseo workspaces remove-members <id-or-slug> --user-ids <id,id> [--json]",
		],
	},
	"workspaces list": { usage: ["phaseo workspaces list [--json]"] },
	"workspaces create": { usage: ["phaseo workspaces create --name <name> [--slug <slug>] [--json]"] },
	"workspaces get": { usage: ["phaseo workspaces get <id-or-slug> [--json]"] },
	"workspaces update": { usage: ["phaseo workspaces update <id-or-slug> [--name <name>] [--slug <slug>] [--json]"] },
	"workspaces delete": { usage: ["phaseo workspaces delete <id-or-slug> [--json]"] },
	"workspaces members": { usage: ["phaseo workspaces members <id-or-slug> [--json]"] },
	"workspaces add-members": { usage: ["phaseo workspaces add-members <id-or-slug> --user-ids <id,id> [--role member|admin] [--json]"] },
	"workspaces remove-members": { usage: ["phaseo workspaces remove-members <id-or-slug> --user-ids <id,id> [--json]"] },
	presets: {
		usage: [
			"phaseo presets list [--json]",
			"phaseo presets create --name <@name> [--model <model>] [--system-prompt <text>] [--config-json <json>] [--json]",
			"phaseo presets get <id-or-slug-or-name> [--json]",
			"phaseo presets update <id-or-slug-or-name> [--config-json <json>] [--json]",
			"phaseo presets delete <id-or-slug-or-name> [--json]",
		],
	},
	"presets list": { usage: ["phaseo presets list [--json]"] },
	"presets create": { usage: ["phaseo presets create --name <@name> [--model <model>] [--system-prompt <text>] [--config-json <json>] [--json]"] },
	"presets get": { usage: ["phaseo presets get <id-or-slug-or-name> [--json]"] },
	"presets update": { usage: ["phaseo presets update <id-or-slug-or-name> [--config-json <json>] [--json]"] },
	"presets delete": { usage: ["phaseo presets delete <id-or-slug-or-name> [--json]"] },
	settings: {
		usage: [
			"phaseo settings get [--json]",
			"phaseo settings update [--routing-mode balanced|price|latency|throughput] [--body-json <json>] [--json]",
		],
	},
	"settings get": { usage: ["phaseo settings get [--json]"] },
	"settings update": { usage: ["phaseo settings update [--routing-mode balanced|price|latency|throughput] [--body-json <json>] [--json]"] },
	guardrails: {
		usage: [
			"phaseo guardrails list [--json]",
			"phaseo guardrails create --name <name> [--body-json <json>] [--json]",
			"phaseo guardrails get <id> [--json]",
			"phaseo guardrails update <id> --body-json <json> [--json]",
			"phaseo guardrails delete <id> [--json]",
			"phaseo guardrails list-keys <id> [--json]",
			"phaseo guardrails add-keys <id> --key-ids <id,id> [--json]",
			"phaseo guardrails remove-keys <id> --key-ids <id,id> [--json]",
			"phaseo guardrails list-members <id> [--json]",
			"phaseo guardrails add-members <id> --user-ids <id,id> [--json]",
			"phaseo guardrails remove-members <id> --user-ids <id,id> [--json]",
			"phaseo guardrails set-keys <id> --key-ids <id,id> [--json]",
		],
	},
	"guardrails list": { usage: ["phaseo guardrails list [--json]"] },
	"guardrails create": { usage: ["phaseo guardrails create --name <name> [--body-json <json>] [--json]"] },
	"guardrails get": { usage: ["phaseo guardrails get <id> [--json]"] },
	"guardrails update": { usage: ["phaseo guardrails update <id> --body-json <json> [--json]"] },
	"guardrails delete": { usage: ["phaseo guardrails delete <id> [--json]"] },
	"guardrails list-keys": { usage: ["phaseo guardrails list-keys <id> [--json]"] },
	"guardrails add-keys": { usage: ["phaseo guardrails add-keys <id> --key-ids <id,id> [--json]"] },
	"guardrails remove-keys": { usage: ["phaseo guardrails remove-keys <id> --key-ids <id,id> [--json]"] },
	"guardrails list-members": { usage: ["phaseo guardrails list-members <id> [--json]"] },
	"guardrails add-members": { usage: ["phaseo guardrails add-members <id> --user-ids <id,id> [--json]"] },
	"guardrails remove-members": { usage: ["phaseo guardrails remove-members <id> --user-ids <id,id> [--json]"] },
	"guardrails set-keys": { usage: ["phaseo guardrails set-keys <id> --key-ids <id,id> [--json]"] },
	"oauth-clients": {
		usage: [
			"phaseo oauth-clients list [--json]",
			"phaseo oauth-clients create --name <name> --redirect-uri <uri>|--redirect-uris <uri,uri> [--client-type public|confidential] [--scopes scope_a,scope_b] [--show-secret] [--json]",
			"phaseo oauth-clients get <client-id> [--json]",
			"phaseo oauth-clients update <client-id> [--name <name>] [--redirect-uri <uri>|--redirect-uris <uri,uri>] [--scopes scope_a,scope_b] [--json]",
			"phaseo oauth-clients delete <client-id> [--json]",
			"phaseo oauth-clients regenerate-secret <client-id> [--show-secret] [--json]",
		],
	},
	"oauth-clients list": { usage: ["phaseo oauth-clients list [--json]"] },
	"oauth-clients create": { usage: ["phaseo oauth-clients create --name <name> --redirect-uri <uri>|--redirect-uris <uri,uri> [--client-type public|confidential] [--scopes scope_a,scope_b] [--show-secret] [--json]"] },
	"oauth-clients get": { usage: ["phaseo oauth-clients get <client-id> [--json]"] },
	"oauth-clients update": { usage: ["phaseo oauth-clients update <client-id> [--name <name>] [--redirect-uri <uri>|--redirect-uris <uri,uri>] [--scopes scope_a,scope_b] [--json]"] },
	"oauth-clients delete": { usage: ["phaseo oauth-clients delete <client-id> [--json]"] },
	"oauth-clients regenerate-secret": { usage: ["phaseo oauth-clients regenerate-secret <client-id> [--show-secret] [--json]"] },
	"management-keys": {
		usage: [
			"phaseo management-keys list [--json]",
			"phaseo management-keys create --name <name> [--template raycast-readonly|read-only|read-write|full-control] [--scopes scope_a,scope_b] [--show-secret] [--json]",
			"phaseo management-keys get <id> [--json]",
			"phaseo management-keys update <id> [--name <name>] [--paused true|false] [--json]",
			"phaseo management-keys delete <id> [--json]",
		],
	},
	"management-keys list": { usage: ["phaseo management-keys list [--json]"] },
	"management-keys create": { usage: ["phaseo management-keys create --name <name> [--show-secret] [--json]"] },
	"management-keys get": { usage: ["phaseo management-keys get <id> [--json]"] },
	"management-keys update": { usage: ["phaseo management-keys update <id> [--name <name>] [--template raycast-readonly|read-only|read-write|full-control] [--paused true|false] [--json]"] },
	"management-keys delete": { usage: ["phaseo management-keys delete <id> [--json]"] },
	models: { usage: [
		"phaseo models list [--limit <n>] [--offset <n>] [--all] [--json]",
		"phaseo models get <model-id> [--json]",
	] },
	"models list": { usage: ["phaseo models list [--limit <n>] [--offset <n>] [--all] [--json]"] },
	"models get": { usage: ["phaseo models get <model-id> [--json]"] },
	providers: { usage: ["phaseo providers list [--json]"] },
	"providers list": { usage: ["phaseo providers list [--json]"] },
	organisations: { usage: ["phaseo organisations list [--limit <n>] [--offset <n>] [--json]"] },
	"organisations list": { usage: ["phaseo organisations list [--limit <n>] [--offset <n>] [--json]"] },
	endpoints: { usage: ["phaseo endpoints list [--json]"] },
	"endpoints list": { usage: ["phaseo endpoints list [--json]"] },
	pricing: {
		usage: [
			"phaseo pricing models [--json]",
			"phaseo pricing calculate --provider <provider> --model <model> --endpoint <endpoint> --usage-json <json>",
		],
	},
	"pricing models": { usage: ["phaseo pricing models [--json]"] },
	"pricing calculate": { usage: ["phaseo pricing calculate --provider <provider> --model <model> --endpoint <endpoint> --usage-json <json>"] },
	credits: { usage: ["phaseo credits get [--json]"] },
	"credits get": { usage: ["phaseo credits get [--json]"] },
	activity: { usage: ["phaseo activity list [--days <n>] [--limit <n>] [--offset <n>] [--json]"] },
	"activity list": { usage: ["phaseo activity list [--days <n>] [--limit <n>] [--offset <n>] [--json]"] },
	logs: {
		usage: [
			"phaseo logs list [--since <15m|1h|7d>] [--from <iso>] [--to <iso>] [--status <success|error|2xx|4xx|5xx|code>] [--provider <id>] [--model <id>] [--endpoint <path>] [--request-id <id>] [--key-id <id>] [--session-id <id>] [--error-code <code>] [--workspace <id>] [--limit <n>] [--offset <n>] [--json]",
			"phaseo logs get <request-id> [--workspace <id>] [--json]",
		],
	},
	"logs list": { usage: ["phaseo logs list [--since <15m|1h|7d>] [--from <iso>] [--to <iso>] [--status <success|error|2xx|4xx|5xx|code>] [--provider <id>] [--model <id>] [--endpoint <path>] [--request-id <id>] [--key-id <id>] [--session-id <id>] [--error-code <code>] [--workspace <id>] [--limit <n>] [--offset <n>] [--json]"] },
	"logs get": { usage: ["phaseo logs get <request-id> [--workspace <id>] [--json]"] },
	analytics: { usage: ["phaseo analytics get [--date YYYY-MM-DD] [--json]"] },
	"analytics get": { usage: ["phaseo analytics get [--date YYYY-MM-DD] [--json]"] },
	generation: { usage: ["phaseo generation get --id <request-id> [--json]"] },
	"generation get": { usage: ["phaseo generation get --id <request-id> [--json]"] },
	webhooks: {
		usage: [
			"phaseo webhooks list [--limit <n>] [--offset <n>] [--include-deleted] [--json]",
			"phaseo webhooks create --url <https-url> [--name <name>] [--events <event,event>] [--show-secret] [--json]",
			"phaseo webhooks get <id> [--json]",
			"phaseo webhooks update <id> [--url <https-url>] [--name <name>] [--events <event,event>] [--status active|disabled] [--json]",
			"phaseo webhooks rotate-secret <id> [--show-secret] [--json]",
			"phaseo webhooks delete <id> [--json]",
		],
	},
	"webhooks list": { usage: ["phaseo webhooks list [--limit <n>] [--offset <n>] [--include-deleted] [--json]"] },
	"webhooks create": { usage: ["phaseo webhooks create --url <https-url> [--name <name>] [--events <event,event>] [--show-secret] [--json]"] },
	"webhooks get": { usage: ["phaseo webhooks get <id> [--json]"] },
	"webhooks update": { usage: ["phaseo webhooks update <id> [--url <https-url>] [--name <name>] [--events <event,event>] [--status active|disabled] [--json]"] },
	"webhooks rotate-secret": { usage: ["phaseo webhooks rotate-secret <id> [--show-secret] [--json]"] },
	"webhooks delete": { usage: ["phaseo webhooks delete <id> [--json]"] },
	api: {
		usage: [
			"phaseo api get <v1-path> [--json]",
			"phaseo api post <v1-path> --body-json <json> [--json]",
			"phaseo api put <v1-path> --body-json <json> [--json]",
			"phaseo api patch <v1-path> --body-json <json> [--json]",
			"phaseo api delete <v1-path> [--json]",
		],
	},
	"api get": { usage: ["phaseo api get <v1-path> [--json]"] },
	"api post": { usage: ["phaseo api post <v1-path> --body-json <json> [--json]"] },
	"api put": { usage: ["phaseo api put <v1-path> --body-json <json> [--json]"] },
	"api patch": { usage: ["phaseo api patch <v1-path> --body-json <json> [--json]"] },
	"api delete": { usage: ["phaseo api delete <v1-path> [--json]"] },
};

export function helpKeyForCommand(command: string[]): string {
	if (command.length >= 2) {
		const twoPart = `${command[0]} ${command[1]}`;
		if (twoPart in HELP_ENTRIES) return twoPart;
	}
	if (command.length >= 1 && command[0] in HELP_ENTRIES) return command[0];
	return "root";
}

export function renderHelp(command: string[]): string {
	const key = helpKeyForCommand(command);
	const entry = HELP_ENTRIES[key] ?? HELP_ENTRIES.root;
	const lines: string[] = [];
	if (key === "root") {
		lines.push(entry.description ?? "Phaseo CLI", "", "Usage:");
	} else {
		lines.push(`Phaseo CLI Help: ${key}`, "", "Usage:");
	}
	for (const usageLine of entry.usage) {
		if (usageLine === "") {
			lines.push("");
			continue;
		}
		if (usageLine.endsWith(":")) {
			lines.push(usageLine);
			continue;
		}
		lines.push(`  ${usageLine}`);
	}
	return `${lines.join("\n")}\n`;
}

export function printHelp(command: string[] = []) {
	process.stdout.write(renderHelp(command));
}

