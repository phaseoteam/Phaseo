import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AccountStatus, UsageWindow } from "../shared/workspace";
import type { ImportableHub, UsageHub, UsageHubAccount, UsageHubRequest, UsageHubSnapshot } from "../shared/usageHubs";
import { claudeLimits } from "./claudeLimits";
import { planName } from "./accountStatus";

/** Where management keys live: the app's encrypted credential store. */
export type HubSecrets = { set: (id: string, value: string) => Promise<void>; get: (id: string) => Promise<string>; remove: (id: string) => void };
type Fetch = typeof fetch;

const CODEX_USAGE = "https://chatgpt.com/backend-api/wham/usage";
const CLAUDE_USAGE = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_PROFILE = "https://api.anthropic.com/api/oauth/profile";
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined;

class HubError extends Error {}

/** Codex's wham/usage: used_percent 0–100, reset_at in epoch seconds, limit_window_seconds for the length. */
export function codexHubUsage(value: unknown, fallbackPlan?: string): Pick<AccountStatus, "usage" | "plan"> {
	const body = object(value), limits = object(body.rate_limit);
	const window = (input: unknown, fallbackMinutes: number): UsageWindow | null => {
		const entry = object(input);
		if (typeof entry.used_percent !== "number" || !Number.isFinite(entry.used_percent)) return null;
		return { usedPercent: Math.min(100, Math.max(0, entry.used_percent)), windowDurationMins: typeof entry.limit_window_seconds === "number" && entry.limit_window_seconds > 0 ? Math.round(entry.limit_window_seconds / 60) : fallbackMinutes, resetsAt: typeof entry.reset_at === "number" && entry.reset_at > 0 ? entry.reset_at : null };
	};
	const plan = planName("codex", text(body.plan_type) ?? fallbackPlan);
	return { usage: [{ id: "codex", name: "Codex", primary: window(limits.primary_window, 300), secondary: window(limits.secondary_window, 10080), spendControlReached: null }], ...plan ? { plan } : {} };
}

/** Anthropic's oauth/usage, the same windows Claude Code's /usage shows. */
export function claudeHubUsage(value: unknown): Pick<AccountStatus, "usage" | "extraUsage"> {
	return claudeLimits(object(value) as Parameters<typeof claudeLimits>[0]);
}

/**
 * The plan from Claude's OAuth profile, which usage doesn't report: Team seats by seat tier, Max by its multiplier.
 * Accounts on different plans have different-sized limits, so the rings group by it.
 */
export function claudeProfilePlan(value: unknown): string | undefined {
	const organization = object(object(value).organization);
	const type = text(organization.organization_type), seat = text(organization.seat_tier), multiplier = text(organization.rate_limit_tier)?.match(/max_(\d+x)\b/)?.[1];
	// A premium seat's rate tier says how big it is (max_5x), which is what the tag beside its rings shows.
	if (type === "claude_team") return seat === "team_standard" ? "Team standard" : seat ? `Team premium${multiplier ? ` ${multiplier}` : ""}` : "Claude Team";
	if (type === "claude_max") return multiplier ? `Claude Max ${multiplier}` : "Claude Max";
	if (type === "claude_pro") return "Claude Pro";
	if (type === "claude_enterprise") return "Claude Enterprise";
	return undefined;
}

/** Runs tasks a few at a time, keeping their order. */
async function limited<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length); let next = 0;
	await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) { const index = next++; results[index] = await run(items[index]); } }));
	return results;
}

/**
 * Hubs another desktop app on this computer is set up with: its settings in ~/.t3/userdata name each CLIProxyAPI
 * source, and its secret store keeps the management key in a file named after the source id.
 */
export function importableHubs(userData = path.join(homedir(), ".t3", "userdata")): (ImportableHub & { key: string })[] {
	let settings: Record<string, unknown>;
	try { settings = object(JSON.parse(readFileSync(path.join(userData, "settings.json"), "utf8"))); } catch { return []; }
	return Object.entries(object(settings.usageLimitSources)).flatMap(([id, value]) => {
		const source = object(value);
		if (source.kind !== "cliproxy" || source.enabled === false || typeof source.url !== "string") return [];
		let key: string;
		try { key = readFileSync(path.join(userData, "secrets", `usage-limit-source-${Buffer.from(id).toString("base64url")}.bin`), "utf8").trim(); } catch { return []; }
		if (!key || /[^\x20-\x7e]/.test(key)) return [];
		let url: string;
		try { url = new URL(source.url).origin; } catch { return []; }
		return [{ label: text(source.label) ?? new URL(url).host, url, key }];
	});
}

export class UsageHubs {
	private hubs: UsageHub[];
	/** Imported hubs that were removed here, by address, so they aren't connected again on their own. */
	private declined: string[];
	private importedConnected?: Promise<void>;
	/** Plans rarely change, so each account's profile is read once per launch. */
	private readonly plans = new Map<string, string | null>();
	constructor(private readonly file: string, private readonly secrets: HubSecrets, private readonly fetcher: Fetch = fetch, private readonly found: () => ReturnType<typeof importableHubs> = () => importableHubs()) {
		// The file was a bare list of hubs before it remembered removed ones.
		let stored: unknown;
		try { stored = JSON.parse(readFileSync(file, "utf8")) as unknown; } catch { stored = []; }
		const hubs = Array.isArray(stored) ? stored : object(stored).hubs, declined = object(stored).declined;
		this.hubs = Array.isArray(hubs) ? hubs.filter((hub): hub is UsageHub => typeof hub?.id === "string" && typeof hub?.url === "string" && typeof hub?.label === "string") : [];
		this.declined = Array.isArray(declined) ? declined.filter((url): url is string => typeof url === "string") : [];
	}
	private save() { writeFileSync(`${this.file}.tmp`, JSON.stringify({ hubs: this.hubs, declined: this.declined }, null, 2)); renameSync(`${this.file}.tmp`, this.file); }

	/**
	 * Importable hubs are connected on their own, once a launch: they're on this computer under keys the other app
	 * already keeps, and when it runs Claude Code through one, that hub is the only place its subscriptions' limits are.
	 * A hub removed here stays removed; one that refuses is left for Settings to offer, with the reason.
	 */
	private connectImportable() {
		return this.importedConnected ??= (async () => {
			for (const hub of this.found().filter(hub => !this.hubs.some(existing => existing.url === hub.url) && !this.declined.includes(hub.url))) {
				try { await this.request({ type: "add", url: hub.url, key: hub.key, label: hub.label }); } catch { /* Offered in Settings instead. */ }
			}
		})();
	}

	async request(request: UsageHubRequest): Promise<UsageHub[] | UsageHubSnapshot | ImportableHub[]> {
		if (request.type === "list") { await this.connectImportable(); return this.hubs; }
		const missing = () => this.found().filter(hub => !this.hubs.some(existing => existing.url === hub.url));
		if (request.type === "importable-hubs") return missing().map(({ label, url }) => ({ label, url }));
		if (request.type === "import-hubs") {
			for (const hub of missing()) await this.request({ type: "add", url: hub.url, key: hub.key, label: hub.label });
			return this.hubs;
		}
		if (request.type === "remove") {
			const removed = this.hubs.find(hub => hub.id === request.id);
			this.secrets.remove(request.id); this.hubs = this.hubs.filter(hub => hub.id !== request.id);
			if (removed && !this.declined.includes(removed.url)) this.declined = [...this.declined, removed.url];
			this.save(); return this.hubs;
		}
		if (request.type === "check") {
			const hub = this.hubs.find(value => value.id === request.id);
			if (!hub) throw new Error("This hub is no longer set up.");
			return this.check(hub, await this.secrets.get(hub.id));
		}
		let url: URL;
		try { url = new URL(request.url.includes("://") ? request.url : `http://${request.url}`); } catch { throw new Error("Enter the hub's address, such as http://127.0.0.1:8317."); }
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an http or https address without a username or password.");
		const hub: UsageHub = { id: `hub-${randomUUID()}`, label: request.label ?? url.host, url: url.origin, createdAt: new Date().toISOString() };
		// Listing accounts once proves the address and key before anything is saved.
		await this.accounts(hub, request.key);
		await this.secrets.set(hub.id, request.key);
		this.hubs = [...this.hubs, hub]; this.declined = this.declined.filter(value => value !== hub.url); this.save();
		return this.hubs;
	}

	private async management(hub: UsageHub, key: string, endpoint: string, body?: unknown): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetcher(new URL(`/v0/management/${endpoint}`, hub.url), { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${key}`, ...body === undefined ? {} : { "Content-Type": "application/json" } }, ...body === undefined ? {} : { body: JSON.stringify(body) }, signal: AbortSignal.timeout(15_000) });
		} catch { throw new HubError(`Couldn't reach the hub at ${hub.url}.`); }
		if (response.status === 401) throw new HubError("The hub rejected the management key. CLIProxyAPI blocks an address for 30 minutes after five wrong keys, so check it before trying again.");
		if (response.status === 403) throw new HubError("The hub refused management access. If it runs on another computer, turn on remote management (allow-remote) in its config.");
		if (response.status === 404) throw new HubError("This hub has no management API. Set a management secret key in its config.");
		if (!response.ok) throw new HubError(`The hub answered HTTP ${response.status}.`);
		try { return await response.json(); } catch { throw new HubError("The hub sent a reply Phaseo couldn't read."); }
	}

	private async accounts(hub: UsageHub, key: string) {
		const files = object(await this.management(hub, key, "auth-files")).files;
		if (!Array.isArray(files)) throw new HubError("The hub sent an account list Phaseo couldn't read.");
		return files.map(object).filter(file => typeof file.auth_index === "string" && !file.disabled);
	}

	/** The hub calls the provider with the account's own token, substituted for $TOKEN$. */
	private async upstream(hub: UsageHub, key: string, authIndex: string, url: string, header: Record<string, string>) {
		const result = object(await this.management(hub, key, "api-call", { auth_index: authIndex, method: "GET", url, header }));
		const status = typeof result.status_code === "number" ? result.status_code : 0;
		if (status < 200 || status > 299) throw new HubError(`The provider refused the hub's request (HTTP ${status}).`);
		try { return JSON.parse(typeof result.body === "string" ? result.body : "null") as unknown; } catch { throw new HubError("The provider sent usage Phaseo couldn't read."); }
	}

	/** Best effort: without a plan the account is still shown, just not grouped by tier. */
	private async claudePlan(hub: UsageHub, key: string, file: Record<string, unknown>) {
		const id = `${hub.id}:${String(file.id ?? file.auth_index)}`;
		if (this.plans.has(id)) return this.plans.get(id) ?? undefined;
		try { const plan = claudeProfilePlan(await this.upstream(hub, key, file.auth_index as string, CLAUDE_PROFILE, { Authorization: "Bearer $TOKEN$", "anthropic-beta": "oauth-2025-04-20" })); this.plans.set(id, plan ?? null); return plan; }
		catch { return undefined; }
	}

	async check(hub: UsageHub, key: string): Promise<UsageHubSnapshot> {
		const checkedAt = new Date().toISOString();
		let files: Record<string, unknown>[];
		try { files = await this.accounts(hub, key); }
		catch (error) { return { hubId: hub.id, checkedAt, accounts: [], skipped: 0, error: error instanceof HubError ? error.message : "The hub could not list its accounts." }; }
		const readable = files.filter(file => file.provider === "codex" || file.provider === "claude");
		const accounts = await limited(readable, 4, async (file): Promise<UsageHubAccount> => {
			const provider = file.provider as "codex" | "claude", token = object(file.id_token), email = text(file.email);
			const base: AccountStatus = { checkedAt: new Date().toISOString(), authenticated: true, ...email ? { identity: email } : {} };
			try {
				if (provider === "codex") {
					const account = text(token.chatgpt_account_id);
					const body = await this.upstream(hub, key, file.auth_index as string, CODEX_USAGE, { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "OpenAI-Beta": "codex-1", Originator: "Codex Desktop", ...account ? { "Chatgpt-Account-Id": account } : {} });
					// CLIProxyAPI names the plan plan_type in the token summary.
					Object.assign(base, codexHubUsage(body, text(token.plan_type) ?? text(token.chatgpt_plan_type)));
				} else {
					const [usage, plan] = await Promise.all([this.upstream(hub, key, file.auth_index as string, CLAUDE_USAGE, { Authorization: "Bearer $TOKEN$", "anthropic-beta": "oauth-2025-04-20" }), this.claudePlan(hub, key, file)]);
					Object.assign(base, claudeHubUsage(usage), plan ? { plan } : {});
				}
			} catch (error) { base.usageError = error instanceof HubError ? error.message : "Phaseo couldn't read this account's usage."; }
			return { id: text(file.id) ?? (file.auth_index as string), provider, ...email ? { email } : {}, status: base };
		});
		return { hubId: hub.id, checkedAt, accounts, skipped: files.length - readable.length };
	}
}

export const usageHubFile = (directory: string) => path.join(directory, "usage-hubs.json");
