import type { FactorySettings } from "./factory/types";

/**
 * The structured parts of the app's configuration, beyond the single settings in appSettings.ts. Agents read an
 * area with config.get and change it with config.set; each area saves through the same checked path its Settings
 * page uses, so an agent can change nothing the person could not. Secrets (API keys, MCP header values) can be
 * written but are never read back.
 */
export const configAreas = {
	projects: { page: "project", get: "Every project with its name, folder and settings (scripts, icon, auto-settle, merge method).", set: "{ id, name?, settings? }: rename a project or replace its settings; settings is the whole object config.get shows." },
	instructions: { page: "general", get: "The global instructions every chat gets, with their hash.", set: "{ content, expectedHash? }: replace the global instructions. Pass the hash from config.get so a newer edit is not overwritten." },
	mcp: { page: "mcp", get: "MCP servers: name, transport, command or URL, project, enabled, archived, and header names (never values).", set: "{ connection, headers? }: add (omit connection.id) or change a server. headers sets secret header values for names in connection.secretHeaders. Archive with archived: true." },
	agents: { page: "agents", get: "Custom agents (Agent Client Protocol): name, executable, arguments, archived.", set: "{ id?, name, executable, arguments, archived? }: add (omit id) or change an agent. Archive with archived: true." },
	accounts: { page: "accounts", get: "Accounts: id, name, harness, kind (native sign-in or API key), endpoint, configured, archived. Keys are never shown.", set: "{ id?, name?, harness?, kind?, endpoint?, apiKey?, archived? }: add an account (omit id; harness and kind needed) or rename, re-key or archive one. A native account still needs the person to sign in." },
	keybindings: { page: "keyboard", get: "The person's own keybindings (keybindings.json entries) and every command that can be bound, with its default keys.", set: "entries: the whole list of { key, command, when? } entries; a command with an entry uses it instead of its defaults, and an empty key unassigns it." },
	defaultModel: { page: "general", get: "The model new chats start with, and recently used models.", set: "{ harness, model, accountId?, reasoningEffort?, serviceTier?, options? } or null to go back to the last one used." },
	factory: { page: "factory-repositories", get: "Factory settings: repositories, the repository shown, playbooks, independent review, check interval, activity passing, review bots, stall limits and agent efforts.", set: "A patch of Factory settings (any of showRepo, independentReview, pollMinutes, passOnActivity, trustedBots, stallMinutes, stallGraceMinutes, agentEfforts, playbooks). Add repositories with addRepo: { repo, path }." },
} as const;
export type ConfigArea = keyof typeof configAreas;
export const configAreaIds = Object.keys(configAreas) as ConfigArea[];

const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const minutes = (value: unknown, name: string, minimum: number) => { if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > 1440) throw new Error(`${name} must be a whole number of minutes from ${minimum} to 1440.`); return value as number; };
const flag = (value: unknown, name: string) => { if (typeof value !== "boolean") throw new Error(`${name} must be true or false.`); return value; };
const text = (value: unknown, name: string, max: number) => { if (typeof value !== "string" || value.length > max) throw new Error(`${name} must be text of up to ${max.toLocaleString("en-US")} characters.`); return value; };
const texts = (value: unknown, name: string) => { if (!Array.isArray(value) || value.length > 100) throw new Error(`${name} must be a list.`); return value.map(item => text(item, name, 200)); };

/**
 * A Factory settings patch from an agent. The Settings page builds well-formed patches itself; this checks an agent's
 * the same way the page's controls bound them. Repositories are added through addRepo, which reads them from GitHub.
 */
export function validateFactoryPatch(value: unknown, repos: readonly string[]): Partial<FactorySettings> {
	if (!plain(value)) throw new Error("Pass an object of Factory settings to change.");
	const patch: Partial<FactorySettings> = {};
	for (const [key, input] of Object.entries(value)) {
		if (key === "showRepo") { if (input !== "" && !repos.includes(text(input, key, 200))) throw new Error("showRepo must be \"\" (all) or one of Factory's repositories."); patch.showRepo = input as string; }
		else if (key === "independentReview") patch.independentReview = flag(input, key);
		else if (key === "passOnActivity") patch.passOnActivity = flag(input, key);
		else if (key === "pollMinutes") patch.pollMinutes = minutes(input, key, 1);
		else if (key === "stallMinutes") patch.stallMinutes = minutes(input, key, 0);
		else if (key === "stallGraceMinutes") patch.stallGraceMinutes = minutes(input, key, 1);
		else if (key === "trustedBots") patch.trustedBots = texts(input, key).map(bot => bot.trim()).filter(Boolean);
		else if (key === "agentEfforts") { if (!plain(input)) throw new Error("agentEfforts maps agent ids to an effort."); patch.agentEfforts = Object.fromEntries(Object.entries(input).map(([id, effort]) => [text(id, "An agent id", 200), text(effort, "An effort", 100)])); }
		else if (key === "playbooks") {
			if (!plain(input) || Object.keys(input).some(kind => kind !== "issue" && kind !== "pull")) throw new Error("playbooks has issue and pull playbooks.");
			for (const playbook of Object.values(input)) {
				if (!plain(playbook)) throw new Error("Each playbook is an object, as config.get shows it.");
				if (playbook.instructions !== undefined) text(playbook.instructions, "instructions", 20000);
				if (playbook.rules !== undefined && (!Array.isArray(playbook.rules) || playbook.rules.length > 50 || playbook.rules.some(rule => !plain(rule) || typeof rule.id !== "string"))) throw new Error("rules must be a list of rules with ids.");
				for (const flagKey of ["requireProof", "openPullRequest", "postReports", "askReporter"]) if (playbook[flagKey] !== undefined) flag(playbook[flagKey], flagKey);
			}
			patch.playbooks = input as FactorySettings["playbooks"];
		} else throw new Error(`${key} is not a Factory setting an agent can change here.`);
	}
	return patch;
}
