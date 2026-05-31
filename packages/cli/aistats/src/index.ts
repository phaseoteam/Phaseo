#!/usr/bin/env node
import { apiFetch, getSessionAccessToken, normalizeApiRoot, pollDeviceToken, startDeviceLogin } from "./api";
import { clearSession, writeSession } from "./session";
import { printError, printJson } from "./output";

type ParsedArgs = {
	command: string[];
	flags: Record<string, string | boolean>;
};

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

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
	process.stdout.write(`AI Stats CLI

Usage:
  aistats login [--api-url <url>] [--json]
  aistats logout [--json]
  aistats whoami [--json]
  aistats keys create --name <name> [--workspace <id-or-slug>] [--show-secret] [--json]

Environment:
  AI_STATS_API_URL  Override API root, defaults to https://api.phaseo.app
`);
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
	if (flagBool(flags, "json")) {
		printJson({ ok: true, logged_in: false });
	} else {
		process.stdout.write("Logged out of AI Stats.\n");
	}
}

async function whoami(flags: Record<string, string | boolean>) {
	const session = await getSessionAccessToken();
	const body = await apiFetch(session.apiUrl, "/me", { accessToken: session.accessToken });
	if (flagBool(flags, "json")) {
		printJson(body);
		return;
	}
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

async function createKey(flags: Record<string, string | boolean>) {
	const name = flagString(flags, "name");
	if (!name) throw new Error("`--name` is required");
	const workspace = flagString(flags, "workspace");
	const session = await getSessionAccessToken();
	const body = await apiFetch(session.apiUrl, "/keys", {
		method: "POST",
		accessToken: session.accessToken,
		body: JSON.stringify({
			name,
			...(workspace ? { workspace_id: workspace } : {}),
		}),
	});
	if (flagBool(flags, "json")) {
		printJson(body);
		return;
	}
	const key = body.data;
	process.stdout.write(`Created API key: ${key.name ?? name}\n`);
	process.stdout.write(`ID: ${key.id}\n`);
	process.stdout.write(`Prefix: ${key.prefix ?? "unknown"}\n`);
	if (flagBool(flags, "show-secret")) {
		process.stdout.write(`Key: ${key.key}\n`);
	} else {
		process.stdout.write("Secret hidden. Re-run with --json or --show-secret if an agent needs to capture it.\n");
	}
}

async function main() {
	const parsed = parseArgs(process.argv.slice(2));
	const json = flagBool(parsed.flags, "json");
	try {
		const [first, second] = parsed.command;
		if (!first || first === "help" || flagBool(parsed.flags, "help")) {
			printHelp();
			return;
		}
		if (first === "login") return login(parsed.flags);
		if (first === "logout") return logout(parsed.flags);
		if (first === "whoami") return whoami(parsed.flags);
		if (first === "keys" && second === "create") return createKey(parsed.flags);
		throw new Error(`Unknown command: ${parsed.command.join(" ")}`);
	} catch (error) {
		printError(error, { json });
		process.exitCode = 1;
	}
}

await main();
