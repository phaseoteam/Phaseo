#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { clearScreenDown, cursorTo, moveCursor } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, platform } from "node:process";
import {
	apiFetch,
	authorizeUrl,
	exchangeAuthorizationCode,
	getSessionAccessToken,
	normalizeApiRoot,
	parseScopeArgument,
	pollDeviceToken,
	revokeRefreshToken,
	startDeviceLogin,
} from "./api.js";
import { clearSession, readSession, writeSession } from "./session.js";
import { printError, printJson, sanitizeTerminalText } from "./output.js";
import { CLI_VERSION } from "./generated/meta.js";
import { getVersionInfo } from "./release.js";

type ParsedArgs = {
	command: string[];
	flags: Record<string, string | boolean>;
};

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type LoginMethod = "browser" | "device";
type CallbackOutcome =
	| { ok: true; code: string; state: string }
	| { ok: false; error: string; errorDescription?: string; state?: string };

type CallbackInspection =
	| CallbackOutcome
	| { ok: false; pending: true };

type HelpEntry = {
	usage: string[];
	description?: string;
};

type LoginMethodOption = {
	value: LoginMethod;
	label: string;
	description: string;
};

const LOGIN_METHOD_OPTIONS: LoginMethodOption[] = [
	{
		value: "browser",
		label: "Sign in with Phaseo",
		description: "Open a browser, approve access, and return here automatically.",
	},
	{
		value: "device",
		label: "Sign in with Device Code",
		description: "Best for SSH, remote shells, and terminals without browser callback support.",
	},
];

export function parseArgs(argv: string[]): ParsedArgs {
	const command: string[] = [];
	const flags: Record<string, string | boolean> = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "-h") {
			flags.help = true;
			continue;
		}
		if (arg === "-v") {
			flags.version = true;
			continue;
		}
		if (arg.startsWith("--")) {
			const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
			if (inlineValue !== undefined) {
				flags[rawKey] = inlineValue;
				continue;
			}
			const next = argv[i + 1];
			if (next && !next.startsWith("-")) {
				flags[rawKey] = next;
				i += 1;
			} else {
				flags[rawKey] = true;
			}
			continue;
		}
		command.push(arg);
	}
	return { command, flags };
}

function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
	const value = flags[key];
	return typeof value === "string" ? value : undefined;
}

function flagBool(flags: Record<string, string | boolean>, key: string): boolean {
	return flags[key] === true || flags[key] === "true" || flags[key] === "1";
}

function flagNumber(flags: Record<string, string | boolean>, key: string): number | undefined {
	const value = flagString(flags, key);
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
	return parsed;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64Url(input: Buffer): string {
	return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteLength: number): string {
	return base64Url(randomBytes(byteLength));
}

function sha256Base64Url(value: string): string {
	return base64Url(createHash("sha256").update(value).digest());
}

function appendQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
	const [base, existingQuery] = path.split("?", 2);
	const query = new URLSearchParams(existingQuery ?? "");
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === "") continue;
		query.set(key, String(value));
	}
	const text = query.toString();
	return text ? `${base}?${text}` : base;
}

function parseJsonFlag(flags: Record<string, string | boolean>, key: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
	const raw = flagString(flags, key);
	if (!raw) return fallback;
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`--${key} must be a JSON object`);
	}
	return parsed as Record<string, unknown>;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function parseCsvFlag(flags: Record<string, string | boolean>, key: string): string[] {
	return (flagString(flags, key) ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function formatMoneyFromNanos(nanos: unknown): string {
	const value = Number(nanos ?? 0);
	if (!Number.isFinite(value)) return "$0.000000";
	return `$${(value / 1_000_000_000).toFixed(6)}`;
}

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
			"phaseo pricing --help",
			"phaseo credits --help",
			"phaseo activity --help",
			"phaseo logs --help",
			"phaseo analytics --help",
			"phaseo generation --help",
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
	models: { usage: ["phaseo models list [--limit <n>] [--offset <n>] [--all] [--json]"] },
	"models list": { usage: ["phaseo models list [--limit <n>] [--offset <n>] [--all] [--json]"] },
	providers: { usage: ["phaseo providers list [--json]"] },
	"providers list": { usage: ["phaseo providers list [--json]"] },
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

function printHelp(command: string[] = []) {
	process.stdout.write(renderHelp(command));
}

export function renderVersionText(details: {
	version: string;
	packageManager: string;
	installCommand: string;
	updateCommand: string;
	latestVersion: string | null;
	updateAvailable: boolean;
}): string {
	const lines = [
		`Phaseo CLI ${details.version}`,
		`Package manager: ${details.packageManager}`,
		`Install: ${details.installCommand}`,
		`Update: ${details.updateCommand}`,
	];
	if (details.latestVersion) {
		lines.push(
			details.updateAvailable
				? `Latest: ${details.latestVersion} (update available)`
				: `Latest: ${details.latestVersion}`,
		);
	}
	return `${lines.join("\n")}\n`;
}

async function printVersion(flags: Record<string, string | boolean>, options: { short?: boolean } = {}) {
	if (options.short) {
		const info = await getVersionInfo();
		process.stdout.write(`${CLI_VERSION}  update: ${info.updateCommand}\n`);
		return;
	}
	const refreshVersion = flagBool(flags, "refresh-version") || flagBool(flags, "check-update");
	const info = await getVersionInfo({
		lookupLatest: refreshVersion,
		forceLatestLookup: refreshVersion,
	});
	if (flagBool(flags, "json")) {
		printJson(info);
		return;
	}
	process.stdout.write(renderVersionText(info));
}

async function maybePrintUpdateNotice(json: boolean) {
	if (json || process.env.PHASEO_DISABLE_UPDATE_CHECK === "1") return;
	const info = await getVersionInfo({ lookupLatest: true });
	if (!info.updateAvailable || !info.latestVersion) return;
	process.stdout.write(
		`\nUpdate available: ${CLI_VERSION} -> ${info.latestVersion}\nRun: ${info.updateCommand}\n`,
	);
}

async function request(path: string, options: { method?: HttpMethod; body?: Record<string, unknown> } = {}) {
	const session = await getSessionAccessToken();
	return apiFetch(session.apiUrl, path, {
		method: options.method ?? "GET",
		accessToken: session.accessToken,
		...(options.body ? { body: JSON.stringify(options.body) } : {}),
	});
}

function printList(items: any[], render: (item: any) => string): void {
	for (const item of items) process.stdout.write(`${render(item)}\n`);
}

function countRenderedLines(text: string): number {
	const normalized = text.replace(/\r/g, "");
	const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
	return trimmed ? trimmed.split("\n").length : 0;
}

function clearRenderedBlock(lineCount: number) {
	if (!output.isTTY || lineCount <= 0) return;
	moveCursor(output, 0, -lineCount);
	cursorTo(output, 0);
	clearScreenDown(output);
}

function repaintBlock(text: string, previousLineCount: number): number {
	clearRenderedBlock(previousLineCount);
	output.write(text);
	return countRenderedLines(text);
}

function isInteractiveTerminal(): boolean {
	return Boolean(input.isTTY && output.isTTY);
}

export function prefersDeviceCodeByEnvironment(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return Boolean(
		env.SSH_CONNECTION ||
			env.SSH_CLIENT ||
			env.SSH_TTY ||
			env.CI,
	);
}

export function windowsBrowserOpenArgs(url: string): string[] {
	return ["url.dll,FileProtocolHandler", url];
}

export function renderOneTimeClientSecret(secret: unknown, showSecret: boolean): string {
	if (typeof secret !== "string" || !secret) return "";
	return showSecret
		? `Client secret: ${secret}\n`
		: "Client secret hidden. Re-run with --json or --show-secret to capture it once.\n";
}

function loginOptionIndex(method: LoginMethod): number {
	return LOGIN_METHOD_OPTIONS.findIndex((option) => option.value === method);
}

export function renderLoginBanner(): string {
	return [
		"  _____  _                          ",
		" |  __ \\| |                         ",
		" | |__) | |__   __ _ ___  ___  ___  ",
		" |  ___/| '_ \\ / _` / __|/ _ \\/ _ \\ ",
		" | |    | | | | (_| \\__ \\  __/ (_) |",
		" |_|    |_| |_|\\__,_|___/\\___|\\___/ ",
		"                                    ",
		"                                    ",
		"",
		"Phaseo CLI",
		"Workspace control, keys, and routing tools from your terminal.",
	].join("\n");
}

export function renderLoginMenu(selectedIndex: number, defaultMethod: LoginMethod): string {
	const lines = [
		renderLoginBanner(),
		"",
		"Choose a login method.",
		"Use Up/Down arrows and Enter to continue.",
		"",
	];

	for (const [index, option] of LOGIN_METHOD_OPTIONS.entries()) {
		const isSelected = index === selectedIndex;
		const isDefault = option.value === defaultMethod;
		lines.push(`${isSelected ? ">" : " "} ${option.label}${isDefault ? " [default]" : ""}`);
		lines.push(`    ${option.description}`);
		lines.push("");
	}

	lines.push("Tip: Device Code is the safer choice in SSH, remote devboxes, and CI.");
	lines.push("Press Ctrl+C to cancel.");
	return lines.join("\n");
}

export function nextLoginMenuIndex(currentIndex: number, rawInput: string, optionCount: number): number {
	if (optionCount <= 0) return 0;
	switch (rawInput) {
		case "\u001b[A":
			return Math.max(0, currentIndex - 1);
		case "\u001b[B":
			return Math.min(optionCount - 1, currentIndex + 1);
		case "1":
			return 0;
		case "2":
			return Math.min(optionCount - 1, 1);
		default:
			return currentIndex;
	}
}

export function inspectCallbackRequest(
	requestUrl: URL,
	expectedState: string,
): CallbackInspection {
	const error = requestUrl.searchParams.get("error") || undefined;
	const errorDescription = requestUrl.searchParams.get("error_description") || undefined;
	const state = requestUrl.searchParams.get("state") || undefined;
	const code = requestUrl.searchParams.get("code") || undefined;
	if ((error || code) && state !== expectedState) {
		return { ok: false, pending: true };
	}
	if (error) {
		return { ok: false, error, errorDescription, state };
	}
	if (!code) {
		return { ok: false, pending: true };
	}
	return { ok: true, code, state };
}

export function validateLoopbackRedirectUri(value: string): string {
	const url = new URL(value);
	const loopback = url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]" || url.hostname === "localhost";
	if (url.protocol !== "http:" || !loopback || url.pathname !== "/callback" || url.username || url.password || url.search || url.hash) {
		throw new Error("Browser redirect URI must be an HTTP loopback /callback URL");
	}
	return url.toString();
}

export function callbackListenHost(redirectUri: string): string {
	const hostname = new URL(redirectUri).hostname;
	return hostname === "[::1]" ? "::1" : hostname;
}

function openUrl(url: string): boolean {
	if (prefersDeviceCodeByEnvironment()) {
		return false;
	}
	try {
		if (platform === "win32") {
			// Pass the authorization URL as data, never through a command interpreter.
			spawn("rundll32.exe", windowsBrowserOpenArgs(url), {
				detached: true,
				stdio: "ignore",
			}).unref();
			return true;
		}
		if (platform === "darwin") {
			spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
			return true;
		}
		spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
		return true;
	} catch {
		return false;
	}
}

function resolveLoginMethod(flags: Record<string, string | boolean>, json: boolean): LoginMethod {
	if (flagBool(flags, "browser")) return "browser";
	if (flagBool(flags, "device-code")) return "device";
	const raw = flagString(flags, "method");
	if (raw) {
		if (raw === "browser" || raw === "device") return raw;
		throw new Error("--method must be browser or device");
	}
	if (json || !isInteractiveTerminal() || prefersDeviceCodeByEnvironment()) {
		return "device";
	}
	return "browser";
}

async function chooseLoginMethod(flags: Record<string, string | boolean>, json: boolean): Promise<LoginMethod> {
	const preset = flagString(flags, "method") ?? (flagBool(flags, "browser") ? "browser" : flagBool(flags, "device-code") ? "device" : undefined);
	if (preset || json || !isInteractiveTerminal() || prefersDeviceCodeByEnvironment()) {
		return resolveLoginMethod(flags, json);
	}
	const defaultMethod = resolveLoginMethod(flags, json);
	if (typeof input.setRawMode === "function") {
		return new Promise<LoginMethod>((resolve, reject) => {
			let selectedIndex = Math.max(0, loginOptionIndex(defaultMethod));
			let renderedLines = 0;

			const finish = (result: { method?: LoginMethod; error?: Error }) => {
				input.off("data", handleKeypress);
				if (typeof input.setRawMode === "function") {
					input.setRawMode(false);
				}
				input.pause();
				output.write("\x1b[?25h");
				clearRenderedBlock(renderedLines);
				if (result.error) {
					reject(result.error);
					return;
				}
				resolve(result.method ?? defaultMethod);
			};

			const render = () => {
				renderedLines = repaintBlock(`${renderLoginMenu(selectedIndex, defaultMethod)}\n`, renderedLines);
			};

			const handleKeypress = (chunk: Buffer | string) => {
				const rawInput = chunk.toString("utf8");
				if (rawInput === "\u0003") {
					finish({ error: new Error("Login cancelled.") });
					return;
				}
				if (rawInput === "\r" || rawInput === "\n") {
					finish({ method: LOGIN_METHOD_OPTIONS[selectedIndex]?.value ?? defaultMethod });
					return;
				}
				const nextIndex = nextLoginMenuIndex(selectedIndex, rawInput, LOGIN_METHOD_OPTIONS.length);
				if (nextIndex !== selectedIndex) {
					selectedIndex = nextIndex;
					render();
				}
			};

			input.setRawMode(true);
			input.resume();
			output.write("\x1b[?25l");
			render();
			input.on("data", handleKeypress);
		});
	}
	const prompt = createInterface({ input, output });
	try {
		const defaultChoice = defaultMethod === "device" ? "2" : "1";
		const answer = (
			await prompt.question(
				`Login method: [1] Sign in with Phaseo  [2] Sign in with Device Code (default ${defaultChoice}): `,
			)
		).trim();
		if (!answer) return defaultMethod;
		if (answer === "2" || /^device$/i.test(answer)) return "device";
		return "browser";
	} finally {
		prompt.close();
	}
}

function createCallbackServer(args: { redirectUri: string; expectedState: string }) {
	const redirect = new URL(args.redirectUri);
	const host = callbackListenHost(args.redirectUri);
	const port = redirect.port ? Number(redirect.port) : 8976;
	const callbackPath = redirect.pathname || "/";
	let settled = false;
	let activeRedirectUri = redirect.toString();
	let resolveCallback: (value: CallbackOutcome) => void = () => undefined;
	const waitForCallback = new Promise<CallbackOutcome>((resolve) => {
		resolveCallback = resolve;
	});
	const timeout = setTimeout(() => {
		finish({ ok: false, error: "login_timeout", errorDescription: "Browser login timed out after 10 minutes" });
	}, 10 * 60 * 1000);
	timeout.unref();

	function finish(value: CallbackOutcome) {
		if (settled) return;
		settled = true;
		clearTimeout(timeout);
		resolveCallback(value);
	}

	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		const requestUrl = new URL(req.url || "/", args.redirectUri);
		if (requestUrl.pathname !== callbackPath) {
			res.statusCode = 404;
			res.end("Not found");
			return;
		}
		const outcome = inspectCallbackRequest(requestUrl, args.expectedState);
		if ("pending" in outcome) {
			res.statusCode = 200;
			res.setHeader("content-type", "text/html; charset=utf-8");
			res.end("<!doctype html><html><body style=\"font-family:sans-serif;padding:24px\"><h1>Waiting for Phaseo authorization</h1><p>This browser window can stay open until authorization completes.</p></body></html>");
			return;
		}
		finish(outcome);
		res.statusCode = 200;
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><html><body style=\"font-family:sans-serif;padding:24px\"><h1>Phaseo login complete</h1><p>You can return to your terminal now.</p></body></html>");
	});

	return {
		start: async () =>
			new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.listen(port, host, () => {
					server.off("error", reject);
					const address = server.address();
					if (address && typeof address === "object") {
						const active = new URL(redirect);
						active.port = String(address.port);
						activeRedirectUri = active.toString();
					}
					resolve();
				});
			}),
		getRedirectUri: () => activeRedirectUri,
		waitForCallback,
		close: async () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
			}),
	};
}

async function completeLogin(apiRoot: string, tokens: {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	scope?: string;
}, json: boolean) {
	await writeSession({
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + Number(tokens.expires_in ?? 900) * 1000,
		apiUrl: apiRoot,
		scope: tokens.scope,
	});
	if (json) {
		printJson({ ok: true, logged_in: true, api_url: apiRoot, scope: tokens.scope ?? null });
	} else {
		process.stdout.write("Logged in to Phaseo.\n");
	}
}

function requestedLoginScope(flags: Record<string, string | boolean>): string {
	return parseScopeArgument(flagString(flags, "scopes"));
}

async function loginWithDeviceCode(apiRoot: string, flags: Record<string, string | boolean>, json: boolean) {
	const scope = requestedLoginScope(flags);
	const device = await startDeviceLogin(apiRoot, scope);
	if (json) {
		printJson({
			status: "authorization_required",
			user_code: device.user_code,
			verification_uri: device.verification_uri,
			verification_uri_complete: device.verification_uri_complete,
			expires_in: device.expires_in,
		});
	} else {
		process.stdout.write("Authorize Phaseo CLI\n\n");
		process.stdout.write(`Open: ${device.verification_uri_complete}\n`);
		process.stdout.write(`Code: ${device.user_code}\n\n`);
		process.stdout.write("Waiting for approval...\n");
	}

	const deadline = Date.now() + Number(device.expires_in) * 1000;
	let intervalMs = Math.max(1, Number(device.interval ?? 5)) * 1000;
	while (Date.now() < deadline) {
		await sleep(intervalMs);
		try {
			const tokens = await pollDeviceToken(apiRoot, device.device_code);
			await completeLogin(apiRoot, tokens, json);
			return;
		} catch (error: any) {
			if (error?.code === "authorization_pending") continue;
			if (error?.code === "slow_down") {
				intervalMs += 5_000;
				continue;
			}
			throw error;
		}
	}
	throw new Error("Device login expired. Run `phaseo login` again.");
}

async function loginWithBrowser(apiRoot: string, flags: Record<string, string | boolean>) {
	const redirectUri = validateLoopbackRedirectUri(
		flagString(flags, "redirect-uri") ?? "http://127.0.0.1:0/callback",
	);
	const state = randomBase64Url(24);
	const codeVerifier = randomBase64Url(32);
	const codeChallenge = sha256Base64Url(codeVerifier);
	const callbackServer = createCallbackServer({ redirectUri, expectedState: state });
	await callbackServer.start();
	try {
		const activeRedirectUri = callbackServer.getRedirectUri();
		const scope = requestedLoginScope(flags);
		const authUrl = authorizeUrl(apiRoot, {
			clientId: "phaseo_cli",
			redirectUri: activeRedirectUri,
			scope,
			state,
			codeChallenge,
		});
		const didOpen = openUrl(authUrl);
		process.stdout.write("Sign in with Phaseo\n\n");
		process.stdout.write(`Open: ${authUrl}\n\n`);
		if (!didOpen) {
			process.stdout.write("Browser auto-open was unavailable, so use the URL above.\n");
		}
		process.stdout.write("Waiting for browser sign-in...\n");
		const callback = await callbackServer.waitForCallback;
		if (!callback.ok) {
			const failure = callback as Extract<CallbackOutcome, { ok: false }>;
			throw new Error(failure.errorDescription ?? failure.error);
		}
		const tokens = await exchangeAuthorizationCode(apiRoot, {
			code: callback.code,
			redirectUri: activeRedirectUri,
			codeVerifier,
		});
		await completeLogin(apiRoot, tokens, false);
	} finally {
		await callbackServer.close();
	}
}

async function login(flags: Record<string, string | boolean>) {
	const apiRoot = normalizeApiRoot(flagString(flags, "api-url"));
	const json = flagBool(flags, "json");
	const method = await chooseLoginMethod(flags, json);
	if (json && method === "browser") {
		throw new Error(
			"Browser login is interactive and requires user action in the browser, so it cannot produce immediate JSON output with --json. Use --method device instead.",
		);
	}
	if (method === "browser") {
		return loginWithBrowser(apiRoot, flags);
	}
	return loginWithDeviceCode(apiRoot, flags, json);
}

async function logout(flags: Record<string, string | boolean>) {
	const session = await readSession();
	let revoked = false;
	if (session?.refreshToken) {
		try {
			await revokeRefreshToken(session.apiUrl, session.refreshToken);
			revoked = true;
		} catch {
			revoked = false;
		}
	}
	await clearSession();
	if (flagBool(flags, "json")) {
		printJson({ ok: true, logged_in: false, refresh_token_revoked: revoked });
	} else {
		process.stdout.write(revoked ? "Logged out of Phaseo and revoked the session.\n" : "Logged out of Phaseo.\n");
	}
}

async function whoami(flags: Record<string, string | boolean>) {
	const body = await request("/me");
	if (flagBool(flags, "json")) return printJson(body);
	const data = body.data;
	process.stdout.write(`${data.user.email ?? data.user.id}\n`);
	process.stdout.write(`Current workspace: ${data.current_workspace_id}\n`);
	if (Array.isArray(data.workspaces) && data.workspaces.length) {
		process.stdout.write("\nWorkspaces:\n");
		for (const workspace of data.workspaces) {
			const marker = workspace.current ? "*" : " ";
			process.stdout.write(`${marker} ${workspace.name ?? workspace.id} (${workspace.role}) ${workspace.id}\n`);
		}
	}
}

async function listKeys(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/keys", {
		limit: flagString(flags, "limit"),
		offset: flagString(flags, "offset"),
		include_disabled: flagBool(flags, "include-disabled") || undefined,
	}));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (key) => `${key.disabled ? "paused" : "active"} ${key.name ?? key.id} ${key.id} ${key.prefix ?? ""}`.trim());
}

async function createKey(flags: Record<string, string | boolean>) {
	const name = flagString(flags, "name");
	if (!name) throw new Error("`--name` is required");
	const body = await request("/keys", {
		method: "POST",
		body: compact({
			name,
			workspace_id: flagString(flags, "workspace"),
			limit: flagNumber(flags, "limit"),
			limit_reset: flagString(flags, "limit-reset"),
			expires_at: flagString(flags, "expires-at"),
			disabled: flagBool(flags, "disabled") || undefined,
		}),
	});
	if (flagBool(flags, "json")) return printJson(body);
	const key = body.data;
	process.stdout.write(`Created API key: ${key.name ?? name}\n`);
	process.stdout.write(`ID: ${key.id}\n`);
	process.stdout.write(`Prefix: ${key.prefix ?? "unknown"}\n`);
	if (flagBool(flags, "show-secret")) process.stdout.write(`Key: ${key.key}\n`);
	else process.stdout.write("Secret hidden. Re-run with --json or --show-secret if an agent needs to capture it.\n");
}

async function getKey(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Key id or hash is required");
	const body = await request(`/keys/${encodeURIComponent(id)}`);
	if (flagBool(flags, "json")) return printJson(body);
	const key = body.data;
	process.stdout.write(`${key.name ?? key.id}\nStatus: ${key.disabled ? "disabled" : "active"}\nID: ${key.id}\nPrefix: ${key.prefix ?? "unknown"}\n`);
}

async function updateKey(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Key id or hash is required");
	const body = await request(`/keys/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: compact({
			name: flagString(flags, "name"),
			disabled: flags.disabled === undefined ? undefined : flagBool(flags, "disabled"),
			limit: flagNumber(flags, "limit"),
			limit_reset: flagString(flags, "limit-reset"),
			expires_at: flagString(flags, "expires-at"),
		}),
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Updated API key: ${body.data.name ?? body.data.id}\n`);
}

async function deleteKey(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Key id or hash is required");
	const body = await request(`/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write("Deleted API key.\n");
}

async function currentKey(flags: Record<string, string | boolean>) {
	const body = await request("/key");
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`${body.data.name ?? body.data.prefix ?? body.data.id}\n`);
	process.stdout.write(`ID: ${body.data.id}\n`);
	process.stdout.write(`Workspace: ${body.data.workspace_id}\n`);
	process.stdout.write(`Status: ${body.data.status}\n`);
	process.stdout.write(`Expires: ${body.data.expires_at ?? "never"}\n`);
}

async function listWorkspaces(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/workspaces", { limit: flagString(flags, "limit"), offset: flagString(flags, "offset") }));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (workspace) => `${workspace.name ?? workspace.id} ${workspace.slug ?? ""} ${workspace.id}`.trim());
}

async function createWorkspace(flags: Record<string, string | boolean>) {
	const name = flagString(flags, "name");
	if (!name) throw new Error("`--name` is required");
	const body = await request("/workspaces", { method: "POST", body: compact({ name, slug: flagString(flags, "slug") }) });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Created workspace: ${body.data.name} (${body.data.id})\n`);
}

async function getWorkspace(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Workspace id or slug is required");
	const body = await request(`/workspaces/${encodeURIComponent(id)}`);
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`${body.data.name ?? body.data.id}\nSlug: ${body.data.slug ?? ""}\nID: ${body.data.id}\n`);
}

async function updateWorkspace(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Workspace id or slug is required");
	const body = await request(`/workspaces/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: compact({ name: flagString(flags, "name"), slug: flagString(flags, "slug") }),
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Updated workspace: ${body.data.name ?? body.data.id}\n`);
}

async function deleteWorkspace(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Workspace id or slug is required");
	const body = await request(`/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write("Deleted workspace.\n");
}

async function listWorkspaceMembers(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Workspace id or slug is required");
	const body = await request(`/workspaces/${encodeURIComponent(id)}/members`);
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (member) => `${member.role ?? "member"} ${member.user_id}`);
}

async function addWorkspaceMembers(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Workspace id or slug is required");
	const userIds = (flagString(flags, "user-ids") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (!userIds.length) throw new Error("--user-ids is required");
	const body = await request(`/workspaces/${encodeURIComponent(id)}/members/add`, {
		method: "POST",
		body: compact({
			user_ids: userIds,
			role: flagString(flags, "role"),
		}),
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Added ${body.added_count ?? userIds.length} member(s) to workspace.\n`);
}

async function removeWorkspaceMembers(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Workspace id or slug is required");
	const userIds = (flagString(flags, "user-ids") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (!userIds.length) throw new Error("--user-ids is required");
	const body = await request(`/workspaces/${encodeURIComponent(id)}/members/remove`, {
		method: "POST",
		body: { user_ids: userIds },
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Removed ${body.removed_count ?? 0} member(s) from workspace.\n`);
}

function buildPresetConfig(flags: Record<string, string | boolean>): Record<string, unknown> {
	const config = parseJsonFlag(flags, "config-json");
	const model = flagString(flags, "model");
	if (model) config.models = [model];
	const systemPrompt = flagString(flags, "system-prompt");
	if (systemPrompt) config.system_prompt = systemPrompt;
	const routingMode = flagString(flags, "routing-mode");
	if (routingMode) config.routing_mode = routingMode;
	return config;
}

async function listPresets(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/presets", { limit: flagString(flags, "limit"), offset: flagString(flags, "offset"), visibility: flagString(flags, "visibility") }));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (preset) => `${preset.name ?? preset.id} ${preset.visibility ?? "team"} ${preset.id}`);
}

async function createPreset(flags: Record<string, string | boolean>) {
	const name = flagString(flags, "name");
	if (!name) throw new Error("`--name` is required");
	const body = await request("/presets", {
		method: "POST",
		body: compact({
			name,
			slug: flagString(flags, "slug"),
			description: flagString(flags, "description"),
			visibility: flagString(flags, "visibility"),
			config: buildPresetConfig(flags),
		}),
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Created preset: ${body.data.name} (${body.data.id})\n`);
}

async function getPreset(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Preset id, slug, or name is required");
	const body = await request(`/presets/${encodeURIComponent(id)}`);
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`${body.data.name ?? body.data.id}\nVisibility: ${body.data.visibility}\nID: ${body.data.id}\n`);
}

async function updatePreset(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Preset id, slug, or name is required");
	const body = await request(`/presets/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: compact({
			name: flagString(flags, "name"),
			slug: flagString(flags, "slug"),
			description: flagString(flags, "description"),
			visibility: flagString(flags, "visibility"),
			config: buildPresetConfig(flags),
		}),
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Updated preset: ${body.data.name ?? body.data.id}\n`);
}

async function deletePreset(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Preset id, slug, or name is required");
	const body = await request(`/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write("Deleted preset.\n");
}

async function settingsGet(flags: Record<string, string | boolean>) {
	const body = await request("/settings");
	if (flagBool(flags, "json")) return printJson(body);
	const settings = body.data ?? {};
	process.stdout.write(`Routing: ${settings.routing_mode ?? "balanced"}\n`);
	process.stdout.write(`Beta channel: ${Boolean(settings.beta_channel_enabled)}\n`);
	process.stdout.write(`Alpha channel: ${Boolean(settings.alpha_channel_enabled)}\n`);
	process.stdout.write(`Response healing: ${Boolean(settings.response_healing_enabled)}\n`);
	process.stdout.write(`BYOK fallback: ${Boolean(settings.byok_fallback_enabled)}\n`);
}

async function settingsUpdate(flags: Record<string, string | boolean>) {
	const patch = parseJsonFlag(flags, "body-json");
	const routingMode = flagString(flags, "routing-mode");
	if (routingMode) patch.routing_mode = routingMode;
	if (flags["beta-channel"] !== undefined) patch.beta_channel_enabled = flagBool(flags, "beta-channel");
	if (flags["alpha-channel"] !== undefined) patch.alpha_channel_enabled = flagBool(flags, "alpha-channel");
	if (flags["response-healing"] !== undefined) patch.response_healing_enabled = flagBool(flags, "response-healing");
	if (flags["byok-fallback"] !== undefined) patch.byok_fallback_enabled = flagBool(flags, "byok-fallback");
	if (Object.keys(patch).length === 0) throw new Error("Provide --routing-mode, another settings flag, or --body-json");
	const body = await request("/settings", { method: "PATCH", body: patch });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write("Updated workspace settings.\n");
}

async function listGuardrails(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/guardrails", { limit: flagString(flags, "limit"), offset: flagString(flags, "offset") }));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (guardrail) => `${guardrail.enabled === false ? "off" : "on"} ${guardrail.name ?? guardrail.id} ${guardrail.id}`);
}

async function createGuardrail(flags: Record<string, string | boolean>) {
	const name = flagString(flags, "name");
	if (!name) throw new Error("`--name` is required");
	const payload = parseJsonFlag(flags, "body-json");
	payload.name = name;
	if (flagString(flags, "description")) payload.description = flagString(flags, "description");
	const body = await request("/guardrails", { method: "POST", body: payload });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Created guardrail: ${body.data.name ?? body.data.id} (${body.data.id})\n`);
}

async function getGuardrail(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const body = await request(`/guardrails/${encodeURIComponent(id)}`);
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`${body.data.name ?? body.data.id}\nEnabled: ${body.data.enabled !== false}\nID: ${body.data.id}\nKeys: ${(body.data.key_ids ?? []).join(", ")}\n`);
}

async function updateGuardrail(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const payload = parseJsonFlag(flags, "body-json");
	if (flagString(flags, "name")) payload.name = flagString(flags, "name");
	if (flags.enabled !== undefined) payload.enabled = flagBool(flags, "enabled");
	if (Object.keys(payload).length === 0) throw new Error("Provide --body-json or a supported flag");
	const body = await request(`/guardrails/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Updated guardrail: ${body.data.name ?? body.data.id}\n`);
}

async function deleteGuardrail(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const body = await request(`/guardrails/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write("Deleted guardrail.\n");
}

async function setGuardrailKeys(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const keyIds = (flagString(flags, "key-ids") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	const body = await request(`/guardrails/${encodeURIComponent(id)}/keys`, { method: "PUT", body: { key_ids: keyIds } });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Assigned ${keyIds.length} key(s) to guardrail.\n`);
}

async function listGuardrailKeys(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const body = await request(`/guardrails/${encodeURIComponent(id)}/keys`);
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (assignment) => `${assignment.name ?? assignment.prefix ?? assignment.key_id} ${assignment.key_id}`);
}

async function addGuardrailKeys(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const keyIds = (flagString(flags, "key-ids") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (!keyIds.length) throw new Error("--key-ids is required");
	const body = await request(`/guardrails/${encodeURIComponent(id)}/keys/add`, {
		method: "POST",
		body: { key_ids: keyIds },
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Added ${body.added_count ?? keyIds.length} key assignment(s).\n`);
}

async function removeGuardrailKeys(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const keyIds = (flagString(flags, "key-ids") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (!keyIds.length) throw new Error("--key-ids is required");
	const body = await request(`/guardrails/${encodeURIComponent(id)}/keys/remove`, {
		method: "POST",
		body: { key_ids: keyIds },
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Removed ${body.removed_count ?? 0} key assignment(s).\n`);
}

async function listGuardrailMembers(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const body = await request(`/guardrails/${encodeURIComponent(id)}/members`);
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (assignment) => `${assignment.display_name ?? assignment.user_id} ${assignment.role ?? "member"} ${assignment.user_id}`);
}

async function addGuardrailMembers(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const userIds = parseCsvFlag(flags, "user-ids");
	if (!userIds.length) throw new Error("--user-ids is required");
	const body = await request(`/guardrails/${encodeURIComponent(id)}/members/add`, {
		method: "POST",
		body: { user_ids: userIds },
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Added ${body.added_count ?? userIds.length} member assignment(s).\n`);
}

async function removeGuardrailMembers(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Guardrail id is required");
	const userIds = parseCsvFlag(flags, "user-ids");
	if (!userIds.length) throw new Error("--user-ids is required");
	const body = await request(`/guardrails/${encodeURIComponent(id)}/members/remove`, {
		method: "POST",
		body: { user_ids: userIds },
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Removed ${body.removed_count ?? 0} member assignment(s).\n`);
}

function buildOauthClientPayload(flags: Record<string, string | boolean>) {
	const redirectUris = [
		...parseCsvFlag(flags, "redirect-uris"),
		...parseCsvFlag(flags, "redirect-uri"),
	];
	const uniqueRedirectUris = Array.from(new Set(redirectUris));
	const scopes = parseCsvFlag(flags, "scopes");
	return compact({
		name: flagString(flags, "name"),
		client_type: flagString(flags, "client-type"),
		allowed_scopes: scopes.length ? scopes : undefined,
		description: flagString(flags, "description"),
		homepage_url: flagString(flags, "homepage-url"),
		logo_url: flagString(flags, "logo-url"),
		privacy_policy_url: flagString(flags, "privacy-policy-url"),
		terms_of_service_url: flagString(flags, "terms-of-service-url"),
		redirect_uris: uniqueRedirectUris.length ? uniqueRedirectUris : undefined,
	});
}

async function listOauthClients(flags: Record<string, string | boolean>) {
	const body = await request("/oauth-clients");
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (client) => `${client.name ?? client.client_id} ${client.client_id}`);
}

async function createOauthClient(flags: Record<string, string | boolean>) {
	const payload = buildOauthClientPayload(flags);
	if (!payload.name) throw new Error("--name is required");
	if (!Array.isArray(payload.redirect_uris) || payload.redirect_uris.length === 0) {
		throw new Error("--redirect-uri or --redirect-uris is required");
	}
	const body = await request("/oauth-clients", { method: "POST", body: payload });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Created OAuth client: ${body.name ?? payload.name}\nClient ID: ${body.client_id}\n`);
	process.stdout.write(renderOneTimeClientSecret(body.client_secret, flagBool(flags, "show-secret")));
}

async function getOauthClient(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("OAuth client id is required");
	const body = await request(`/oauth-clients/${encodeURIComponent(id)}`);
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`${body.name ?? body.client_id}\nClient ID: ${body.client_id}\nRedirect URIs: ${(body.redirect_uris ?? []).join(", ")}\n`);
}

async function updateOauthClient(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("OAuth client id is required");
	const payload = buildOauthClientPayload(flags);
	if (Object.keys(payload).length === 0) throw new Error("Provide at least one field to update");
	const body = await request(`/oauth-clients/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Updated OAuth client: ${body.name ?? body.client_id}\n`);
}

async function deleteOauthClient(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("OAuth client id is required");
	const body = await request(`/oauth-clients/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`${body.message ?? "Deleted OAuth client."}\n`);
}

async function regenerateOauthClientSecret(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("OAuth client id is required");
	const body = await request(`/oauth-clients/${encodeURIComponent(id)}/regenerate-secret`, { method: "POST" });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Regenerated secret for ${body.client_id}\n`);
	process.stdout.write(renderOneTimeClientSecret(body.client_secret, flagBool(flags, "show-secret")));
}

async function listManagementKeys(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/management-keys", { limit: flagString(flags, "limit"), offset: flagString(flags, "offset") }));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (key) => `${key.status ?? "unknown"} ${key.name ?? key.id} ${key.id} ${key.prefix ?? ""}`.trim());
}

async function createManagementKey(flags: Record<string, string | boolean>) {
	const name = flagString(flags, "name");
	if (!name) throw new Error("`--name` is required");
	const body = await request("/management-keys", {
		method: "POST",
		body: compact({
			name,
			template: flagString(flags, "template"),
			scopes: flagString(flags, "scopes")?.split(",").map((scope) => scope.trim()).filter(Boolean),
			expires_at: flagString(flags, "expires-at"),
			paused: flagBool(flags, "paused") || undefined,
		}),
	});
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Created management key: ${body.data.name ?? name}\nID: ${body.data.id}\nPrefix: ${body.data.prefix ?? "unknown"}\n`);
	if (flagBool(flags, "show-secret")) process.stdout.write(`Key: ${body.data.key}\n`);
	else process.stdout.write("Secret hidden. Re-run with --json or --show-secret if an agent needs to capture it.\n");
}

async function getManagementKey(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Management key id is required");
	const body = await request(`/management-keys/${encodeURIComponent(id)}`);
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`${body.data.name ?? body.data.id}\nStatus: ${body.data.status}\nID: ${body.data.id}\nPrefix: ${body.data.prefix ?? "unknown"}\n`);
}

async function updateManagementKey(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Management key id is required");
	const payload: Record<string, unknown> = {};
	if (flagString(flags, "name")) payload.name = flagString(flags, "name");
	if (flagString(flags, "template")) payload.template = flagString(flags, "template");
	if (flags.paused !== undefined) payload.paused = flagBool(flags, "paused");
	if (flagString(flags, "expires-at")) payload.expires_at = flagString(flags, "expires-at");
	Object.assign(payload, parseJsonFlag(flags, "body-json"));
	if (Object.keys(payload).length === 0) throw new Error("Provide a supported flag or --body-json");
	const body = await request(`/management-keys/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Updated management key: ${body.data.name ?? body.data.id}\n`);
}

async function deleteManagementKey(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Management key id is required");
	const body = await request(`/management-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write("Deleted management key.\n");
}

export function buildModelsListPath(flags: Record<string, string | boolean>): string {
	const mine = flagBool(flags, "mine");
	return appendQuery(mine ? "/models/me" : "/models", {
		limit: flagString(flags, "limit"),
		offset: flagString(flags, "offset"),
		availability: flagBool(flags, "all") ? "all" : undefined,
	});
}

async function listModels(flags: Record<string, string | boolean>) {
	const body = await request(buildModelsListPath(flags));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.models ?? body.data ?? [], (model) => `${model.id ?? model.model_id} ${model.name ?? ""}`.trim());
}

async function listProviders(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/providers", { limit: flagString(flags, "limit"), offset: flagString(flags, "offset") }));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.providers ?? [], (provider) => `${provider.api_provider_id} ${provider.api_provider_name ?? ""}`.trim());
}

async function pricingModels(flags: Record<string, string | boolean>) {
	const body = await request("/pricing/models");
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.models ?? [], (model) => `${model.provider}/${model.model} ${model.endpoint} ${model.meters?.length ?? 0} meters`);
}

async function pricingCalculate(flags: Record<string, string | boolean>) {
	const provider = flagString(flags, "provider");
	const model = flagString(flags, "model");
	const endpoint = flagString(flags, "endpoint");
	if (!provider || !model || !endpoint) throw new Error("--provider, --model, and --endpoint are required");
	const body = await request("/pricing/calculate", {
		method: "POST",
		body: {
			provider,
			model,
			endpoint,
			usage: parseJsonFlag(flags, "usage-json"),
		},
	});
	return printJson(body);
}

async function creditsGet(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/credits", { workspace_id: flagString(flags, "workspace") }));
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`Available: ${formatMoneyFromNanos(body.credits?.available_nanos)}\nReserved: ${formatMoneyFromNanos(body.credits?.reserved_nanos)}\n30d requests: ${body.credits?.thirty_day_requests ?? 0}\n`);
}

async function activityList(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/activity", {
		workspace_id: flagString(flags, "workspace"),
		days: flagString(flags, "days"),
		limit: flagString(flags, "limit"),
		offset: flagString(flags, "offset"),
	}));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.activity ?? [], (item) => `${item.timestamp} ${item.model} ${item.provider} ${item.cost_cents ?? 0}c ${item.request_id}`);
}

export function buildLogsListPath(flags: Record<string, string | boolean>): string {
	return appendQuery("/logs", {
		workspace_id: flagString(flags, "workspace"),
		since: flagString(flags, "since"),
		from: flagString(flags, "from"),
		to: flagString(flags, "to"),
		status: flagString(flags, "status"),
		provider: flagString(flags, "provider"),
		model: flagString(flags, "model"),
		endpoint: flagString(flags, "endpoint"),
		request_id: flagString(flags, "request-id"),
		key_id: flagString(flags, "key-id"),
		session_id: flagString(flags, "session-id"),
		error_code: flagString(flags, "error-code"),
		limit: flagString(flags, "limit"),
		offset: flagString(flags, "offset"),
	});
}

async function logsList(flags: Record<string, string | boolean>) {
	const body = await request(buildLogsListPath(flags));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (item) => {
		const status = item.status_code ?? (item.success ? "success" : "error");
		return `${item.created_at} ${status} ${item.model_id ?? "unknown"} ${item.provider ?? "unknown"} ${item.latency_ms ?? 0}ms ${item.request_id}`;
	});
}

async function logsGet(id: string | undefined, flags: Record<string, string | boolean>) {
	if (!id) throw new Error("Request id is required");
	const body = await request(appendQuery(`/logs/${encodeURIComponent(id)}`, {
		workspace_id: flagString(flags, "workspace"),
	}));
	if (flagBool(flags, "json")) return printJson(body);
	const item = body.data ?? {};
	const errorMessage = item.error_message ? ` - ${sanitizeTerminalText(String(item.error_message))}` : "";
	process.stdout.write(`${item.request_id ?? id}\nStatus: ${item.status_code ?? (item.success ? "success" : "error")}\nModel: ${item.model_id ?? "unknown"}\nProvider: ${item.provider ?? "unknown"}\nEndpoint: ${item.endpoint ?? "unknown"}\nLatency: ${item.latency_ms ?? 0}ms\nError: ${item.error_code ?? "none"}${errorMessage}\n`);
}

async function analyticsGet(flags: Record<string, string | boolean>) {
	const body = await request(appendQuery("/analytics", { workspace_id: flagString(flags, "workspace"), date: flagString(flags, "date") }));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (item) => `${item.date} ${item.model_permaslug} ${item.provider_name} ${item.requests} req $${item.usage}`);
}

async function generationGet(flags: Record<string, string | boolean>) {
	const id = flagString(flags, "id");
	if (!id) throw new Error("--id is required");
	const body = await request(appendQuery("/generations", { id }));
	if (flagBool(flags, "json")) return printJson(body);
	process.stdout.write(`${body.request_id ?? id}\nModel: ${body.model_id ?? body.model ?? "unknown"}\nProvider: ${body.provider ?? "unknown"}\nCost: ${formatMoneyFromNanos(body.cost_nanos)}\nReplay supported: ${Boolean(body.replay_supported)}\n`);
}

async function rawApi(method: HttpMethod, path: string | undefined, flags: Record<string, string | boolean>) {
	if (!path) throw new Error("API path is required");
	const normalizedPath = path.startsWith("/v1/") ? path.slice(3) : path;
	const body = method === "GET" || method === "DELETE" ? undefined : parseJsonFlag(flags, "body-json");
	const response = await request(normalizedPath, { method, body });
	printJson(response);
}

async function main() {
	const parsed = parseArgs(process.argv.slice(2));
	const json = flagBool(parsed.flags, "json");
	try {
		const [first, second, third] = parsed.command;
		if (flagBool(parsed.flags, "version")) {
			await printVersion(parsed.flags, { short: true });
			return;
		}
		if (!first) {
			printHelp();
			return;
		}
		if (first === "help") {
			printHelp(parsed.command.slice(1));
			return;
		}
		if (flagBool(parsed.flags, "help")) {
			printHelp(parsed.command);
			return;
		}
		if (first === "version") {
			await printVersion(parsed.flags);
			return;
		}

		let action: Promise<unknown> | null = null;
		if (first === "login") action = login(parsed.flags);
		else if (first === "logout") action = logout(parsed.flags);
		else if (first === "whoami") action = whoami(parsed.flags);
		else if (first === "keys" && second === "current") action = currentKey(parsed.flags);
		else if (first === "keys" && second === "list") action = listKeys(parsed.flags);
		else if (first === "keys" && second === "create") action = createKey(parsed.flags);
		else if (first === "keys" && second === "get") action = getKey(third, parsed.flags);
		else if (first === "keys" && second === "update") action = updateKey(third, parsed.flags);
		else if (first === "keys" && second === "delete") action = deleteKey(third, parsed.flags);
		else if (first === "workspaces" && second === "list") action = listWorkspaces(parsed.flags);
		else if (first === "workspaces" && second === "create") action = createWorkspace(parsed.flags);
		else if (first === "workspaces" && second === "get") action = getWorkspace(third, parsed.flags);
		else if (first === "workspaces" && second === "update") action = updateWorkspace(third, parsed.flags);
		else if (first === "workspaces" && second === "delete") action = deleteWorkspace(third, parsed.flags);
		else if (first === "workspaces" && second === "members") action = listWorkspaceMembers(third, parsed.flags);
		else if (first === "workspaces" && second === "add-members") action = addWorkspaceMembers(third, parsed.flags);
		else if (first === "workspaces" && second === "remove-members") action = removeWorkspaceMembers(third, parsed.flags);
		else if (first === "presets" && second === "list") action = listPresets(parsed.flags);
		else if (first === "presets" && second === "create") action = createPreset(parsed.flags);
		else if (first === "presets" && second === "get") action = getPreset(third, parsed.flags);
		else if (first === "presets" && second === "update") action = updatePreset(third, parsed.flags);
		else if (first === "presets" && second === "delete") action = deletePreset(third, parsed.flags);
		else if (first === "settings" && second === "get") action = settingsGet(parsed.flags);
		else if (first === "settings" && second === "update") action = settingsUpdate(parsed.flags);
		else if (first === "guardrails" && second === "list") action = listGuardrails(parsed.flags);
		else if (first === "guardrails" && second === "create") action = createGuardrail(parsed.flags);
		else if (first === "guardrails" && second === "get") action = getGuardrail(third, parsed.flags);
		else if (first === "guardrails" && second === "update") action = updateGuardrail(third, parsed.flags);
		else if (first === "guardrails" && second === "delete") action = deleteGuardrail(third, parsed.flags);
		else if (first === "guardrails" && second === "list-keys") action = listGuardrailKeys(third, parsed.flags);
		else if (first === "guardrails" && second === "add-keys") action = addGuardrailKeys(third, parsed.flags);
		else if (first === "guardrails" && second === "remove-keys") action = removeGuardrailKeys(third, parsed.flags);
		else if (first === "guardrails" && second === "list-members") action = listGuardrailMembers(third, parsed.flags);
		else if (first === "guardrails" && second === "add-members") action = addGuardrailMembers(third, parsed.flags);
		else if (first === "guardrails" && second === "remove-members") action = removeGuardrailMembers(third, parsed.flags);
		else if (first === "guardrails" && second === "set-keys") action = setGuardrailKeys(third, parsed.flags);
		else if (first === "oauth-clients" && second === "list") action = listOauthClients(parsed.flags);
		else if (first === "oauth-clients" && second === "create") action = createOauthClient(parsed.flags);
		else if (first === "oauth-clients" && second === "get") action = getOauthClient(third, parsed.flags);
		else if (first === "oauth-clients" && second === "update") action = updateOauthClient(third, parsed.flags);
		else if (first === "oauth-clients" && second === "delete") action = deleteOauthClient(third, parsed.flags);
		else if (first === "oauth-clients" && second === "regenerate-secret") action = regenerateOauthClientSecret(third, parsed.flags);
		else if (first === "management-keys" && second === "list") action = listManagementKeys(parsed.flags);
		else if (first === "management-keys" && second === "create") action = createManagementKey(parsed.flags);
		else if (first === "management-keys" && second === "get") action = getManagementKey(third, parsed.flags);
		else if (first === "management-keys" && second === "update") action = updateManagementKey(third, parsed.flags);
		else if (first === "management-keys" && second === "delete") action = deleteManagementKey(third, parsed.flags);
		else if (first === "models" && second === "list") action = listModels(parsed.flags);
		else if (first === "providers" && second === "list") action = listProviders(parsed.flags);
		else if (first === "pricing" && second === "models") action = pricingModels(parsed.flags);
		else if (first === "pricing" && second === "calculate") action = pricingCalculate(parsed.flags);
		else if (first === "credits" && second === "get") action = creditsGet(parsed.flags);
		else if (first === "activity" && second === "list") action = activityList(parsed.flags);
		else if (first === "logs" && second === "list") action = logsList(parsed.flags);
		else if (first === "logs" && second === "get") action = logsGet(third, parsed.flags);
		else if (first === "analytics" && second === "get") action = analyticsGet(parsed.flags);
		else if (first === "generation" && second === "get") action = generationGet(parsed.flags);
		else if (first === "api" && second === "get") action = rawApi("GET", third, parsed.flags);
		else if (first === "api" && second === "post") action = rawApi("POST", third, parsed.flags);
		else if (first === "api" && second === "put") action = rawApi("PUT", third, parsed.flags);
		else if (first === "api" && second === "patch") action = rawApi("PATCH", third, parsed.flags);
		else if (first === "api" && second === "delete") action = rawApi("DELETE", third, parsed.flags);
		if (action) {
			await action;
			await maybePrintUpdateNotice(json);
			return;
		}
		throw new Error(`Unknown command: ${parsed.command.join(" ")}`);
	} catch (error) {
		printError(error, { json });
		process.exitCode = 1;
	}
}

await main();
