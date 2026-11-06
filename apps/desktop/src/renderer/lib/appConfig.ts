import { configAreas, configAreaIds, validateFactoryPatch, type ConfigArea } from "../../shared/appConfig";
import { keybindingCommands } from "../../shared/keybindings";
import type { McpConnection } from "../../shared/mcp";
import type { WorkspaceCommand } from "../../shared/workspace";
import { allColourThemes, saveColourTheme } from "./appTheme";
import { parseTheme, validColour } from "./themes";
import { readModelPreferences, setDefaultModel, type ModelSelection } from "./modelPreferences";

/** The theme editor's starting colours for a half a theme leaves to the stylesheet. */
const fallbackHalf = { light: { canvas: "#ffffff", accent: "#0069a8" }, dark: { canvas: "#1c1c1c", accent: "#3b9fe0" } };
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const desktop = () => { const api = window.phaseoDesktop; if (!api) throw new Error("Open the desktop application to change its configuration."); return api; };
const area = (value: unknown): ConfigArea => { if (typeof value !== "string" || !configAreaIds.includes(value as ConfigArea)) throw new Error(`area must be one of ${configAreaIds.join(", ")}.`); return value as ConfigArea; };

/** config.get: one area as its Settings page shows it, or with no area the list of areas. */
export async function getConfig(name: unknown) {
	if (name === undefined) return { areas: configAreaIds.map(id => ({ area: id, ...configAreas[id] })) };
	const api = desktop(), id = area(name);
	switch (id) {
		case "projects": return { projects: (await api.workspace.overview()).projects.filter(project => !project.worktree?.removedAt).map(({ id, name, directory, worktree, settings }) => ({ id, name, directory, ...worktree ? { worktreeOf: worktree.sourceProjectId } : {}, settings: settings ?? {} })) };
		case "instructions": return await api.workspace.globalInstructions();
		case "mcp": return { servers: (await api.workspace.overview()).mcpConnections.filter(connection => !connection.orchestration) };
		case "agents": return { agents: (await api.workspace.overview()).agents };
		case "accounts": return { accounts: (await api.workspace.overview()).accounts.map(({ id, name, harness, kind, endpoint, configured, archived, profile }) => ({ id, name, harness, kind, ...endpoint ? { endpoint } : {}, configured, ...archived ? { archived } : {}, ...profile?.name ? { signedInAs: profile.name } : {} })) };
		case "keybindings": { const { entries, error } = await api.keybindings.get(); return { entries, ...error ? { error } : {}, commands: keybindingCommands.map(({ command, label, keys, ...rest }) => ({ command, label, keys, ..."when" in rest ? { when: rest.when } : {} })) }; }
		case "themes": return allColourThemes();
		case "defaultModel": { const { defaultSelection, recent } = readModelPreferences(); return { defaultModel: defaultSelection ?? null, recent: recent.slice(0, 10) }; }
		case "factory": { const { settings } = await api.factory.snapshot(); return { settings }; }
	}
}

/** config.set: saves through the same call the area's Settings page makes, which checks the value. */
export async function setConfig(name: unknown, value: unknown) {
	const api = desktop(), id = area(name);
	const command = async (input: WorkspaceCommand) => api.workspace.command(input);
	switch (id) {
		case "projects": {
			if (!plain(value) || typeof value.id !== "string") throw new Error("Pass { id, name?, settings? } with a project id from config.get.");
			const project = (await api.workspace.updateProject({ id: value.id, ...value.name !== undefined ? { name: value.name as string } : {}, ...value.settings !== undefined ? { settings: value.settings as never } : {} })).projects.find(item => item.id === value.id);
			return { project: project && { id: project.id, name: project.name, settings: project.settings ?? {} } };
		}
		case "instructions": {
			if (!plain(value) || typeof value.content !== "string") throw new Error("Pass { content, expectedHash? }.");
			const expectedHash = typeof value.expectedHash === "string" ? value.expectedHash : (await api.workspace.globalInstructions()).hash;
			return await api.workspace.saveGlobalInstructions({ content: value.content, expectedHash });
		}
		case "mcp": {
			const input = plain(value) ? value.connection : undefined;
			if (!plain(value) || !plain(input)) throw new Error("Pass { connection, headers? }.");
			const existing = typeof input.id === "string" ? (await api.workspace.overview()).mcpConnections.find(connection => connection.id === input.id) : undefined;
			if (typeof input.id === "string" && !existing) throw new Error("No MCP server has that id; omit id to add one.");
			const connection = { enabled: true, ...existing, ...input, id: existing?.id ?? crypto.randomUUID() } as McpConnection;
			const { applied, workspace } = await api.workspace.mcpWhenIdle({ type: "save", connection, ...plain(value.headers) ? { headers: value.headers as Record<string, string> } : {} });
			// Running chats use the servers they started with, so a change that affects one (this chat, usually) waits for them.
			return applied ? { server: workspace.mcpConnections.find(item => item.id === connection.id) } : { server: { id: connection.id, name: connection.name }, saved: "when this chat and any other running chat it affects finish their turns" };
		}
		case "agents": {
			if (!plain(value)) throw new Error("Pass { id?, name, executable, arguments, archived? }.");
			const before = new Set((await api.workspace.overview()).agents.map(agent => agent.id));
			const { id: agentId, ...fields } = value;
			const overview = typeof agentId === "string" ? await command({ type: "update-agent", id: agentId, ...fields } as WorkspaceCommand) : await command({ type: "add-agent", ...fields } as WorkspaceCommand);
			return { agent: overview.agents.find(agent => typeof agentId === "string" ? agent.id === agentId : !before.has(agent.id)) };
		}
		case "accounts": {
			if (!plain(value)) throw new Error("Pass { id?, name?, harness?, kind?, endpoint?, apiKey?, archived? }.");
			const before = new Set((await api.workspace.overview()).accounts.map(account => account.id));
			const { id: accountId, ...fields } = value;
			const overview = typeof accountId === "string" ? await command({ type: "update-account", id: accountId, ...fields } as WorkspaceCommand) : await command({ type: "add-account", ...fields } as WorkspaceCommand);
			const account = overview.accounts.find(item => typeof accountId === "string" ? item.id === accountId : !before.has(item.id));
			return { account: account && { id: account.id, name: account.name, harness: account.harness, kind: account.kind, configured: account.configured, ...account.archived ? { archived: true } : {} } };
		}
		case "keybindings": {
			const entries = plain(value) ? value.entries : value;
			if (!Array.isArray(entries)) throw new Error("Pass the whole list of keybinding entries.");
			const saved = await api.keybindings.save(entries as never);
			if (saved.error) throw new Error(saved.error);
			return { entries: saved.entries };
		}
		case "themes": {
			if (!plain(value)) throw new Error("Pass { id?, name?, light?, dark? }.");
			for (const mode of ["light", "dark"] as const) {
				const colours = value[mode];
				if (colours === undefined) continue;
				if (!plain(colours) || Object.entries(colours).some(([field, colour]) => !["canvas", "accent"].includes(field) || !validColour(colour))) throw new Error(`${mode} takes canvas and accent as #rrggbb colours.`);
			}
			const { activeId, themes } = allColourThemes();
			const base = themes.find(theme => theme.id === (typeof value.id === "string" ? value.id : activeId));
			if (typeof value.id === "string" && !base) throw new Error("No colour theme has that id; omit id to make a new one.");
			const half = (mode: "light" | "dark") => plain(value[mode]) || base?.[mode] ? { ...fallbackHalf[mode], ...base?.[mode], ...plain(value[mode]) ? value[mode] : {} } : undefined;
			const theme = parseTheme({ name: typeof value.name === "string" ? value.name : base?.builtIn || !base ? `${base?.name ?? "My"} custom` : base.name, light: half("light"), dark: half("dark") });
			const saved = saveColourTheme(base && !base.builtIn ? { ...theme, id: base.id } : theme);
			return { theme: saved, activeId: saved.id };
		}
		case "defaultModel": {
			if (value !== null && !plain(value)) throw new Error("Pass { harness, model, … } or null.");
			if (value) {
				const selection = value as ModelSelection, models = await api.workspace.models(selection.harness, selection.accountId);
				if (!models.some(model => model.id === selection.model)) throw new Error(`${selection.model} is not a ${selection.harness} model here; list_models or the model picker shows the ids.`);
			}
			setDefaultModel(value ? value as ModelSelection : undefined);
			const saved = readModelPreferences().defaultSelection;
			if (value && !saved) throw new Error("That model selection is not valid.");
			return { defaultModel: saved ?? null };
		}
		case "factory": {
			if (!plain(value)) throw new Error("Pass a patch of Factory settings.");
			const { addRepo, ...rest } = value;
			if (addRepo !== undefined) {
				if (!plain(addRepo) || typeof addRepo.repo !== "string" || typeof addRepo.path !== "string") throw new Error("addRepo is { repo: owner/name, path: a local checkout }.");
				await api.factory.addRepo(addRepo.repo, addRepo.path);
			}
			const current = (await api.factory.snapshot()).settings;
			const patch = validateFactoryPatch(rest, current.repos.map(repo => repo.repo));
			// A patch naming one playbook keeps the other.
			if (patch.playbooks) patch.playbooks = { ...current.playbooks, ...patch.playbooks };
			return { settings: Object.keys(patch).length ? (await api.factory.updateSettings(patch)).settings : current };
		}
	}
}
