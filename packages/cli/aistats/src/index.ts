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
import { printError, printJson } from "./output.js";

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
		label: "Sign in with AI Stats",
		description: "Open a browser, approve access, and return here automatically.",
	},
	{
		value: "device",
		label: "Sign in with Device Code",
		description: "Best for SSH, remote shells, and terminals without browser callback support.",
	},
];

function parseArgs(argv: string[]): ParsedArgs {
	const command: string[] = [];
	const flags: Record<string, string | boolean> = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
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
		description: "AI Stats CLI",
		usage: [
			"aistats login [--api-url <url>] [--method browser|device] [--browser] [--device-code] [--scopes <csv>] [--json]",
			"aistats logout [--json]",
			"aistats whoami [--json]",
			"",
			"aistats keys --help",
			"aistats workspaces --help",
			"aistats presets --help",
			"aistats settings --help",
			"aistats guardrails --help",
			"aistats oauth-clients --help",
			"aistats management-keys --help",
			"aistats models --help",
			"aistats providers --help",
			"aistats pricing --help",
			"aistats credits --help",
			"aistats activity --help",
			"aistats analytics --help",
			"aistats generation --help",
			"aistats api --help",
			"",
			"Login scopes:",
			"  Default login requests full first-party CLI access across the control plane.",
			"  Use --scopes workspaces:read,keys:write,... when a narrower token is preferred.",
			"",
			"Environment:",
			"  AI_STATS_API_URL  Override API root, defaults to https://api.phaseo.app",
		],
	},
	login: {
		usage: [
			"aistats login [--api-url <url>] [--method browser|device] [--browser] [--device-code] [--scopes <csv>] [--json]",
		],
	},
	logout: { usage: ["aistats logout [--json]"] },
	whoami: { usage: ["aistats whoami [--json]"] },
	keys: {
		usage: [
			"aistats keys current [--json]",
			"aistats keys list [--limit <n>] [--offset <n>] [--include-disabled] [--json]",
			"aistats keys create --name <name> [--limit <usd>] [--limit-reset daily|weekly|monthly] [--expires-at <iso>] [--show-secret] [--json]",
			"aistats keys get <id-or-hash> [--json]",
			"aistats keys update <id-or-hash> [--name <name>] [--disabled true|false] [--limit <usd>] [--limit-reset daily|weekly|monthly] [--json]",
			"aistats keys delete <id-or-hash> [--json]",
		],
	},
	"keys current": { usage: ["aistats keys current [--json]"] },
	"keys list": { usage: ["aistats keys list [--limit <n>] [--offset <n>] [--include-disabled] [--json]"] },
	"keys create": { usage: ["aistats keys create --name <name> [--limit <usd>] [--limit-reset daily|weekly|monthly] [--expires-at <iso>] [--show-secret] [--json]"] },
	"keys get": { usage: ["aistats keys get <id-or-hash> [--json]"] },
	"keys update": { usage: ["aistats keys update <id-or-hash> [--name <name>] [--disabled true|false] [--limit <usd>] [--limit-reset daily|weekly|monthly] [--json]"] },
	"keys delete": { usage: ["aistats keys delete <id-or-hash> [--json]"] },
	workspaces: {
		usage: [
			"aistats workspaces list [--json]",
			"aistats workspaces create --name <name> [--slug <slug>] [--json]",
			"aistats workspaces get <id-or-slug> [--json]",
			"aistats workspaces update <id-or-slug> [--name <name>] [--slug <slug>] [--json]",
			"aistats workspaces delete <id-or-slug> [--json]",
			"aistats workspaces members <id-or-slug> [--json]",
			"aistats workspaces add-members <id-or-slug> --user-ids <id,id> [--role member|admin] [--json]",
			"aistats workspaces remove-members <id-or-slug> --user-ids <id,id> [--json]",
		],
	},
	"workspaces list": { usage: ["aistats workspaces list [--json]"] },
	"workspaces create": { usage: ["aistats workspaces create --name <name> [--slug <slug>] [--json]"] },
	"workspaces get": { usage: ["aistats workspaces get <id-or-slug> [--json]"] },
	"workspaces update": { usage: ["aistats workspaces update <id-or-slug> [--name <name>] [--slug <slug>] [--json]"] },
	"workspaces delete": { usage: ["aistats workspaces delete <id-or-slug> [--json]"] },
	"workspaces members": { usage: ["aistats workspaces members <id-or-slug> [--json]"] },
	"workspaces add-members": { usage: ["aistats workspaces add-members <id-or-slug> --user-ids <id,id> [--role member|admin] [--json]"] },
	"workspaces remove-members": { usage: ["aistats workspaces remove-members <id-or-slug> --user-ids <id,id> [--json]"] },
	presets: {
		usage: [
			"aistats presets list [--json]",
			"aistats presets create --name <@name> [--model <model>] [--system-prompt <text>] [--config-json <json>] [--json]",
			"aistats presets get <id-or-slug-or-name> [--json]",
			"aistats presets update <id-or-slug-or-name> [--config-json <json>] [--json]",
			"aistats presets delete <id-or-slug-or-name> [--json]",
		],
	},
	"presets list": { usage: ["aistats presets list [--json]"] },
	"presets create": { usage: ["aistats presets create --name <@name> [--model <model>] [--system-prompt <text>] [--config-json <json>] [--json]"] },
	"presets get": { usage: ["aistats presets get <id-or-slug-or-name> [--json]"] },
	"presets update": { usage: ["aistats presets update <id-or-slug-or-name> [--config-json <json>] [--json]"] },
	"presets delete": { usage: ["aistats presets delete <id-or-slug-or-name> [--json]"] },
	settings: {
		usage: [
			"aistats settings get [--json]",
			"aistats settings update [--routing-mode balanced|price|latency|throughput] [--body-json <json>] [--json]",
		],
	},
	"settings get": { usage: ["aistats settings get [--json]"] },
	"settings update": { usage: ["aistats settings update [--routing-mode balanced|price|latency|throughput] [--body-json <json>] [--json]"] },
	guardrails: {
		usage: [
			"aistats guardrails list [--json]",
			"aistats guardrails create --name <name> [--body-json <json>] [--json]",
			"aistats guardrails get <id> [--json]",
			"aistats guardrails update <id> --body-json <json> [--json]",
			"aistats guardrails delete <id> [--json]",
			"aistats guardrails list-keys <id> [--json]",
			"aistats guardrails add-keys <id> --key-ids <id,id> [--json]",
			"aistats guardrails remove-keys <id> --key-ids <id,id> [--json]",
			"aistats guardrails list-members <id> [--json]",
			"aistats guardrails add-members <id> --user-ids <id,id> [--json]",
			"aistats guardrails remove-members <id> --user-ids <id,id> [--json]",
			"aistats guardrails set-keys <id> --key-ids <id,id> [--json]",
		],
	},
	"guardrails list": { usage: ["aistats guardrails list [--json]"] },
	"guardrails create": { usage: ["aistats guardrails create --name <name> [--body-json <json>] [--json]"] },
	"guardrails get": { usage: ["aistats guardrails get <id> [--json]"] },
	"guardrails update": { usage: ["aistats guardrails update <id> --body-json <json> [--json]"] },
	"guardrails delete": { usage: ["aistats guardrails delete <id> [--json]"] },
	"guardrails list-keys": { usage: ["aistats guardrails list-keys <id> [--json]"] },
	"guardrails add-keys": { usage: ["aistats guardrails add-keys <id> --key-ids <id,id> [--json]"] },
	"guardrails remove-keys": { usage: ["aistats guardrails remove-keys <id> --key-ids <id,id> [--json]"] },
	"guardrails list-members": { usage: ["aistats guardrails list-members <id> [--json]"] },
	"guardrails add-members": { usage: ["aistats guardrails add-members <id> --user-ids <id,id> [--json]"] },
	"guardrails remove-members": { usage: ["aistats guardrails remove-members <id> --user-ids <id,id> [--json]"] },
	"guardrails set-keys": { usage: ["aistats guardrails set-keys <id> --key-ids <id,id> [--json]"] },
	"oauth-clients": {
		usage: [
			"aistats oauth-clients list [--json]",
			"aistats oauth-clients create --name <name> --redirect-uri <uri> [--redirect-uri <uri>] [--client-type public|confidential] [--scopes <csv>] [--description <text>] [--homepage-url <url>] [--logo-url <url>] [--privacy-policy-url <url>] [--terms-of-service-url <url>] [--json]",
			"aistats oauth-clients get <client-id> [--json]",
			"aistats oauth-clients update <client-id> [--name <name>] [--redirect-uri <uri>] [--scopes <csv>] [--description <text>] [--homepage-url <url>] [--logo-url <url>] [--privacy-policy-url <url>] [--terms-of-service-url <url>] [--json]",
			"aistats oauth-clients delete <client-id> [--json]",
			"aistats oauth-clients regenerate-secret <client-id> [--json]",
		],
	},
	"oauth-clients list": { usage: ["aistats oauth-clients list [--json]"] },
	"oauth-clients create": { usage: ["aistats oauth-clients create --name <name> --redirect-uri <uri> [--redirect-uri <uri>] [--client-type public|confidential] [--scopes <csv>] [--description <text>] [--homepage-url <url>] [--logo-url <url>] [--privacy-policy-url <url>] [--terms-of-service-url <url>] [--json]"] },
	"oauth-clients get": { usage: ["aistats oauth-clients get <client-id> [--json]"] },
	"oauth-clients update": { usage: ["aistats oauth-clients update <client-id> [--name <name>] [--redirect-uri <uri>] [--scopes <csv>] [--description <text>] [--homepage-url <url>] [--logo-url <url>] [--privacy-policy-url <url>] [--terms-of-service-url <url>] [--json]"] },
	"oauth-clients delete": { usage: ["aistats oauth-clients delete <client-id> [--json]"] },
	"oauth-clients regenerate-secret": { usage: ["aistats oauth-clients regenerate-secret <client-id> [--json]"] },
	"management-keys": {
		usage: [
			"aistats management-keys list [--json]",
			"aistats management-keys create --name <name> [--show-secret] [--json]",
			"aistats management-keys get <id> [--json]",
			"aistats management-keys update <id> [--name <name>] [--paused true|false] [--json]",
			"aistats management-keys delete <id> [--json]",
		],
	},
	"management-keys list": { usage: ["aistats management-keys list [--json]"] },
	"management-keys create": { usage: ["aistats management-keys create --name <name> [--show-secret] [--json]"] },
	"management-keys get": { usage: ["aistats management-keys get <id> [--json]"] },
	"management-keys update": { usage: ["aistats management-keys update <id> [--name <name>] [--paused true|false] [--json]"] },
	"management-keys delete": { usage: ["aistats management-keys delete <id> [--json]"] },
	models: { usage: ["aistats models list [--limit <n>] [--offset <n>] [--all] [--json]"] },
	"models list": { usage: ["aistats models list [--limit <n>] [--offset <n>] [--all] [--json]"] },
	providers: { usage: ["aistats providers list [--json]"] },
	"providers list": { usage: ["aistats providers list [--json]"] },
	pricing: {
		usage: [
			"aistats pricing models [--json]",
			"aistats pricing calculate --provider <provider> --model <model> --endpoint <endpoint> --usage-json <json>",
		],
	},
	"pricing models": { usage: ["aistats pricing models [--json]"] },
	"pricing calculate": { usage: ["aistats pricing calculate --provider <provider> --model <model> --endpoint <endpoint> --usage-json <json>"] },
	credits: { usage: ["aistats credits get [--json]"] },
	"credits get": { usage: ["aistats credits get [--json]"] },
	activity: { usage: ["aistats activity list [--days <n>] [--limit <n>] [--offset <n>] [--json]"] },
	"activity list": { usage: ["aistats activity list [--days <n>] [--limit <n>] [--offset <n>] [--json]"] },
	analytics: { usage: ["aistats analytics get [--date YYYY-MM-DD] [--json]"] },
	"analytics get": { usage: ["aistats analytics get [--date YYYY-MM-DD] [--json]"] },
	generation: { usage: ["aistats generation get --id <request-id> [--json]"] },
	"generation get": { usage: ["aistats generation get --id <request-id> [--json]"] },
	api: {
		usage: [
			"aistats api get <v1-path> [--json]",
			"aistats api post <v1-path> --body-json <json> [--json]",
			"aistats api put <v1-path> --body-json <json> [--json]",
			"aistats api patch <v1-path> --body-json <json> [--json]",
			"aistats api delete <v1-path> [--json]",
		],
	},
	"api get": { usage: ["aistats api get <v1-path> [--json]"] },
	"api post": { usage: ["aistats api post <v1-path> --body-json <json> [--json]"] },
	"api put": { usage: ["aistats api put <v1-path> --body-json <json> [--json]"] },
	"api patch": { usage: ["aistats api patch <v1-path> --body-json <json> [--json]"] },
	"api delete": { usage: ["aistats api delete <v1-path> [--json]"] },
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
		lines.push(entry.description ?? "AI Stats CLI", "", "Usage:");
	} else {
		lines.push(`AI Stats CLI Help: ${key}`, "", "Usage:");
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
	const escapedUrl = url.replace(/'/g, "''");
	return [
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		`Start-Process -FilePath '${escapedUrl}'`,
	];
}

function loginOptionIndex(method: LoginMethod): number {
	return LOGIN_METHOD_OPTIONS.findIndex((option) => option.value === method);
}

export function renderLoginBanner(): string {
	return [
		"    _    ___     ____  _        _       ",
		"   / \\  |_ _|   / ___|| |_ __ _| |_ ___ ",
		"  / _ \\  | |____\\___ \\| __/ _` | __/ __|",
		" / ___ \\ | |_____|__) | || (_| | |_\\__ \\",
		"/_/   \\_\\___|   |____/ \\__\\__,_|\\__|___/",
		"",
		"AI Stats CLI",
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
	if (error) {
		return { ok: false, error, errorDescription, state };
	}
	if (!code) {
		return { ok: false, pending: true };
	}
	if (state !== expectedState) {
		return {
			ok: false,
			error: "state_mismatch",
			errorDescription: `Expected ${expectedState}, got ${state ?? "<none>"}`,
			state,
		};
	}
	return { ok: true, code, state };
}

function openUrl(url: string): boolean {
	if (prefersDeviceCodeByEnvironment()) {
		return false;
	}
	try {
		if (platform === "win32") {
			spawn("powershell.exe", windowsBrowserOpenArgs(url), {
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
				`Login method: [1] Sign in with AI Stats  [2] Sign in with Device Code (default ${defaultChoice}): `,
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
	const host = redirect.hostname;
	const port = redirect.port ? Number(redirect.port) : 80;
	const callbackPath = redirect.pathname || "/";
	let settled = false;
	let resolveCallback: (value: CallbackOutcome) => void = () => undefined;
	const waitForCallback = new Promise<CallbackOutcome>((resolve) => {
		resolveCallback = resolve;
	});

	function finish(value: CallbackOutcome) {
		if (settled) return;
		settled = true;
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
			res.end("<!doctype html><html><body style=\"font-family:sans-serif;padding:24px\"><h1>Waiting for AI Stats authorization</h1><p>This browser window can stay open until authorization completes.</p></body></html>");
			return;
		}
		finish(outcome);
		res.statusCode = 200;
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><html><body style=\"font-family:sans-serif;padding:24px\"><h1>AI Stats login complete</h1><p>You can return to your terminal now.</p></body></html>");
	});

	return {
		start: async () =>
			new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.listen(port, host, () => {
					server.off("error", reject);
					resolve();
				});
			}),
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
		process.stdout.write("Logged in to AI Stats.\n");
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
		process.stdout.write("Authorize AI Stats CLI\n\n");
		process.stdout.write(`Open: ${device.verification_uri_complete}\n`);
		process.stdout.write(`Code: ${device.user_code}\n\n`);
		process.stdout.write("Waiting for approval...\n");
	}

	const deadline = Date.now() + Number(device.expires_in) * 1000;
	const intervalMs = Math.max(1, Number(device.interval ?? 5)) * 1000;
	while (Date.now() < deadline) {
		await sleep(intervalMs);
		try {
			const tokens = await pollDeviceToken(apiRoot, device.device_code);
			await completeLogin(apiRoot, tokens, json);
			return;
		} catch (error: any) {
			if (error?.code === "authorization_pending") continue;
			throw error;
		}
	}
	throw new Error("Device login expired. Run `aistats login` again.");
}

async function loginWithBrowser(apiRoot: string, flags: Record<string, string | boolean>) {
	const redirectUri = flagString(flags, "redirect-uri") ?? "http://127.0.0.1:8976/callback";
	const state = randomBase64Url(24);
	const codeVerifier = randomBase64Url(32);
	const codeChallenge = sha256Base64Url(codeVerifier);
	const callbackServer = createCallbackServer({ redirectUri, expectedState: state });
	await callbackServer.start();
	try {
		const scope = requestedLoginScope(flags);
		const authUrl = authorizeUrl(apiRoot, {
			clientId: "aistats_cli",
			redirectUri,
			scope,
			state,
			codeChallenge,
		});
		const didOpen = openUrl(authUrl);
		process.stdout.write("Sign in with AI Stats\n\n");
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
			redirectUri,
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
		throw new Error("Browser login is not supported with --json. Use --method device instead.");
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
		process.stdout.write(revoked ? "Logged out of AI Stats and revoked the session.\n" : "Logged out of AI Stats.\n");
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
			scopes: flagString(flags, "scopes")?.split(",").map((scope) => scope.trim()).filter(Boolean),
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
			scopes: flagString(flags, "scopes")?.split(",").map((scope) => scope.trim()).filter(Boolean),
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
	if (body.client_secret) process.stdout.write(`Client secret: ${body.client_secret}\n`);
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
	if (body.client_secret) process.stdout.write(`Client secret: ${body.client_secret}\n`);
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

async function listModels(flags: Record<string, string | boolean>) {
	const mine = flagBool(flags, "mine");
	const body = await request(appendQuery(mine ? "/gateway/models/me" : "/gateway/models", {
		limit: flagString(flags, "limit"),
		offset: flagString(flags, "offset"),
		availability: flagBool(flags, "all") ? "all" : undefined,
	}));
	if (flagBool(flags, "json")) return printJson(body);
	printList(body.data ?? [], (model) => `${model.id ?? model.model_id} ${model.name ?? ""}`.trim());
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
		if (!first) return printHelp();
		if (first === "help") return printHelp(parsed.command.slice(1));
		if (flagBool(parsed.flags, "help")) return printHelp(parsed.command);
		if (first === "login") return login(parsed.flags);
		if (first === "logout") return logout(parsed.flags);
		if (first === "whoami") return whoami(parsed.flags);
		if (first === "keys" && second === "current") return currentKey(parsed.flags);
		if (first === "keys" && second === "list") return listKeys(parsed.flags);
		if (first === "keys" && second === "create") return createKey(parsed.flags);
		if (first === "keys" && second === "get") return getKey(third, parsed.flags);
		if (first === "keys" && second === "update") return updateKey(third, parsed.flags);
		if (first === "keys" && second === "delete") return deleteKey(third, parsed.flags);
		if (first === "workspaces" && second === "list") return listWorkspaces(parsed.flags);
		if (first === "workspaces" && second === "create") return createWorkspace(parsed.flags);
		if (first === "workspaces" && second === "get") return getWorkspace(third, parsed.flags);
		if (first === "workspaces" && second === "update") return updateWorkspace(third, parsed.flags);
		if (first === "workspaces" && second === "delete") return deleteWorkspace(third, parsed.flags);
		if (first === "workspaces" && second === "members") return listWorkspaceMembers(third, parsed.flags);
		if (first === "workspaces" && second === "add-members") return addWorkspaceMembers(third, parsed.flags);
		if (first === "workspaces" && second === "remove-members") return removeWorkspaceMembers(third, parsed.flags);
		if (first === "presets" && second === "list") return listPresets(parsed.flags);
		if (first === "presets" && second === "create") return createPreset(parsed.flags);
		if (first === "presets" && second === "get") return getPreset(third, parsed.flags);
		if (first === "presets" && second === "update") return updatePreset(third, parsed.flags);
		if (first === "presets" && second === "delete") return deletePreset(third, parsed.flags);
		if (first === "settings" && second === "get") return settingsGet(parsed.flags);
		if (first === "settings" && second === "update") return settingsUpdate(parsed.flags);
		if (first === "guardrails" && second === "list") return listGuardrails(parsed.flags);
		if (first === "guardrails" && second === "create") return createGuardrail(parsed.flags);
		if (first === "guardrails" && second === "get") return getGuardrail(third, parsed.flags);
		if (first === "guardrails" && second === "update") return updateGuardrail(third, parsed.flags);
		if (first === "guardrails" && second === "delete") return deleteGuardrail(third, parsed.flags);
		if (first === "guardrails" && second === "list-keys") return listGuardrailKeys(third, parsed.flags);
		if (first === "guardrails" && second === "add-keys") return addGuardrailKeys(third, parsed.flags);
		if (first === "guardrails" && second === "remove-keys") return removeGuardrailKeys(third, parsed.flags);
		if (first === "guardrails" && second === "list-members") return listGuardrailMembers(third, parsed.flags);
		if (first === "guardrails" && second === "add-members") return addGuardrailMembers(third, parsed.flags);
		if (first === "guardrails" && second === "remove-members") return removeGuardrailMembers(third, parsed.flags);
		if (first === "guardrails" && second === "set-keys") return setGuardrailKeys(third, parsed.flags);
		if (first === "oauth-clients" && second === "list") return listOauthClients(parsed.flags);
		if (first === "oauth-clients" && second === "create") return createOauthClient(parsed.flags);
		if (first === "oauth-clients" && second === "get") return getOauthClient(third, parsed.flags);
		if (first === "oauth-clients" && second === "update") return updateOauthClient(third, parsed.flags);
		if (first === "oauth-clients" && second === "delete") return deleteOauthClient(third, parsed.flags);
		if (first === "oauth-clients" && second === "regenerate-secret") return regenerateOauthClientSecret(third, parsed.flags);
		if (first === "management-keys" && second === "list") return listManagementKeys(parsed.flags);
		if (first === "management-keys" && second === "create") return createManagementKey(parsed.flags);
		if (first === "management-keys" && second === "get") return getManagementKey(third, parsed.flags);
		if (first === "management-keys" && second === "update") return updateManagementKey(third, parsed.flags);
		if (first === "management-keys" && second === "delete") return deleteManagementKey(third, parsed.flags);
		if (first === "models" && second === "list") return listModels(parsed.flags);
		if (first === "providers" && second === "list") return listProviders(parsed.flags);
		if (first === "pricing" && second === "models") return pricingModels(parsed.flags);
		if (first === "pricing" && second === "calculate") return pricingCalculate(parsed.flags);
		if (first === "credits" && second === "get") return creditsGet(parsed.flags);
		if (first === "activity" && second === "list") return activityList(parsed.flags);
		if (first === "analytics" && second === "get") return analyticsGet(parsed.flags);
		if (first === "generation" && second === "get") return generationGet(parsed.flags);
		if (first === "api" && second === "get") return rawApi("GET", third, parsed.flags);
		if (first === "api" && second === "post") return rawApi("POST", third, parsed.flags);
		if (first === "api" && second === "put") return rawApi("PUT", third, parsed.flags);
		if (first === "api" && second === "patch") return rawApi("PATCH", third, parsed.flags);
		if (first === "api" && second === "delete") return rawApi("DELETE", third, parsed.flags);
		throw new Error(`Unknown command: ${parsed.command.join(" ")}`);
	} catch (error) {
		printError(error, { json });
		process.exitCode = 1;
	}
}

await main();
