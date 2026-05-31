#!/usr/bin/env node
import { apiFetch, getSessionAccessToken, normalizeApiRoot, pollDeviceToken, startDeviceLogin } from "./api";
import { clearSession, writeSession } from "./session";
import { printError, printJson } from "./output";

type ParsedArgs = {
	command: string[];
	flags: Record<string, string | boolean>;
};

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

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

function formatMoneyFromNanos(nanos: unknown): string {
	const value = Number(nanos ?? 0);
	if (!Number.isFinite(value)) return "$0.000000";
	return `$${(value / 1_000_000_000).toFixed(6)}`;
}

function printHelp() {
	process.stdout.write(`AI Stats CLI

Usage:
  aistats login [--api-url <url>] [--json]
  aistats logout [--json]
  aistats whoami [--json]

  aistats keys list [--limit <n>] [--offset <n>] [--include-disabled] [--json]
  aistats keys create --name <name> [--limit <usd>] [--limit-reset daily|weekly|monthly] [--expires-at <iso>] [--show-secret] [--json]
  aistats keys get <id-or-hash> [--json]
  aistats keys update <id-or-hash> [--name <name>] [--disabled true|false] [--limit <usd>] [--limit-reset daily|weekly|monthly] [--json]
  aistats keys delete <id-or-hash> [--json]

  aistats workspaces list [--json]
  aistats workspaces create --name <name> [--slug <slug>] [--json]
  aistats workspaces get <id-or-slug> [--json]
  aistats workspaces update <id-or-slug> [--name <name>] [--slug <slug>] [--json]
  aistats workspaces delete <id-or-slug> [--json]

  aistats presets list [--json]
  aistats presets create --name <@name> [--model <model>] [--system-prompt <text>] [--config-json <json>] [--json]
  aistats presets get <id-or-slug-or-name> [--json]
  aistats presets update <id-or-slug-or-name> [--config-json <json>] [--json]
  aistats presets delete <id-or-slug-or-name> [--json]

  aistats models list [--limit <n>] [--offset <n>] [--all] [--json]
  aistats providers list [--json]
  aistats pricing models [--json]
  aistats credits get [--json]
  aistats activity list [--days <n>] [--limit <n>] [--offset <n>] [--json]
  aistats analytics get [--date YYYY-MM-DD] [--json]
  aistats generation get --id <request-id> [--json]

  aistats api get <v1-path> [--json]
  aistats api post <v1-path> --body-json <json> [--json]
  aistats api patch <v1-path> --body-json <json> [--json]
  aistats api delete <v1-path> [--json]

Environment:
  AI_STATS_API_URL  Override API root, defaults to https://api.phaseo.app
`);
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

async function login(flags: Record<string, string | boolean>) {
	const apiRoot = normalizeApiRoot(flagString(flags, "api-url"));
	const json = flagBool(flags, "json");
	const device = await startDeviceLogin(apiRoot);
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
			return;
		} catch (error: any) {
			if (error?.code === "authorization_pending") continue;
			throw error;
		}
	}
	throw new Error("Device login expired. Run `aistats login` again.");
}

async function logout(flags: Record<string, string | boolean>) {
	await clearSession();
	if (flagBool(flags, "json")) printJson({ ok: true, logged_in: false });
	else process.stdout.write("Logged out of AI Stats.\n");
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
		if (!first || first === "help" || flagBool(parsed.flags, "help")) return printHelp();
		if (first === "login") return login(parsed.flags);
		if (first === "logout") return logout(parsed.flags);
		if (first === "whoami") return whoami(parsed.flags);
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
		if (first === "presets" && second === "list") return listPresets(parsed.flags);
		if (first === "presets" && second === "create") return createPreset(parsed.flags);
		if (first === "presets" && second === "get") return getPreset(third, parsed.flags);
		if (first === "presets" && second === "update") return updatePreset(third, parsed.flags);
		if (first === "presets" && second === "delete") return deletePreset(third, parsed.flags);
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
		if (first === "api" && second === "patch") return rawApi("PATCH", third, parsed.flags);
		if (first === "api" && second === "delete") return rawApi("DELETE", third, parsed.flags);
		throw new Error(`Unknown command: ${parsed.command.join(" ")}`);
	} catch (error) {
		printError(error, { json });
		process.exitCode = 1;
	}
}

await main();
