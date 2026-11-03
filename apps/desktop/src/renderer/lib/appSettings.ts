import { isWorkspaceSetting, workspaceSettings, type SettingSpec } from "../../shared/appSettings";
import { currentSendKey, setSendKey } from "../chat/sendKey";
import { defaultEffortDisplay, effortDisplayKey, effortDisplays } from "./effortDisplay";
import { workingSectionKey } from "../shell/codeThreads";
import { chooseColourTheme, colourThemes } from "./appTheme";
import { readPersistedValue, writePersistedValue } from "./persistedState";
import { publishWorkspacePreferences } from "./workspacePreferences";

type WindowSetting = SettingSpec & { read: () => unknown; write: (value: unknown) => void };
/** A setting kept on this device by usePersistedState; writing it updates every component showing it. */
const persisted = (key: string, fallback: unknown, spec: SettingSpec): WindowSetting => ({ ...spec, read: () => readPersistedValue(key, fallback), write: value => writePersistedValue(key, value) });
const choice = (value: unknown, values: readonly string[], name: string) => { if (typeof value !== "string" || !values.includes(value)) throw new Error(`${name} must be one of ${values.join(", ")}.`); return value; };
const flag = (value: unknown, name: string) => { if (typeof value !== "boolean") throw new Error(`${name} must be true or false.`); return value; };

/** Settings kept on this device rather than in the workspace. Add one here when a new device setting appears in Settings. */
const windowSettings: Record<string, WindowSetting> = {
	theme: persisted("phaseo.desktop.theme", "system", { label: "Light or dark", page: "appearance", description: "light, dark or system. Colours are in config.get with area themes.", type: "enum", values: ["system", "light", "dark"] }),
	colourTheme: { label: "Colour theme", page: "appearance", description: "The colour theme in use, by id; settings.list gives the ids. To change a theme's background or accent colours, use config.set with area themes.", type: "enum", values: [], read: () => colourThemes().activeId, write: value => chooseColourTheme(choice(value, colourThemes().ids, "colourTheme")) },
	effortDisplay: persisted(effortDisplayKey, defaultEffortDisplay, { label: "Show reasoning as", page: "appearance", description: "How the model button shows the reasoning level: word, dots or both.", type: "enum", values: effortDisplays }),
	sendKey: { label: "Send with", page: "general", description: "enter, or mod+enter (Ctrl or ⌘ with Enter).", type: "enum", values: ["enter", "mod+enter"], read: currentSendKey, write: value => setSendKey(choice(value, ["enter", "mod+enter"], "sendKey") as "enter" | "mod+enter") },
	autoOpenPanes: persisted("phaseo.desktop.panes.autoOpen", true, { label: "Open panes automatically", page: "general", description: "Show the diff when a turn changes files, and a linked pull request.", type: "boolean" }),
	workingSection: persisted(workingSectionKey, false, { label: "Show a Working section", page: "general", description: "Fold working chats that need nothing into a Working section.", type: "boolean" }),
	diffLayout: persisted("phaseo.desktop.diffLayout", "unified", { label: "Diff layout", page: "diff", description: "unified or split.", type: "enum", values: ["unified", "split"] }),
	diffWrap: persisted("phaseo.desktop.diffWrap", false, { label: "Wrap long lines in diffs", page: "diff", description: "Wrap long lines in the diff pane.", type: "boolean" }),
	diffIgnoreWhitespace: persisted("phaseo.desktop.diffIgnoreWhitespace", false, { label: "Hide whitespace changes", page: "diff", description: "Hide whitespace-only changes in the diff pane.", type: "boolean" }),
	fileWrap: persisted("phaseo.desktop.fileWrap", false, { label: "Wrap long lines in files", page: "files", description: "Wrap long lines in the file viewer.", type: "boolean" }),
};

/** settings.list: every setting, where it is kept, its type, and its current value. */
export async function listSettings(query?: string) {
	const api = window.phaseoDesktop?.workspace;
	const preferences = api ? (await api.preferences()).preferences : undefined;
	const rows = [
		...Object.entries(windowSettings).map(([key, { read, write, ...spec }]) => ({ key, kept: "device", ...spec, ...key === "colourTheme" ? { values: colourThemes().ids } : {}, value: read() })),
		...preferences ? Object.entries(workspaceSettings).map(([key, spec]) => ({ key, kept: "workspace", ...spec, value: preferences[key as keyof typeof preferences] })) : [],
	];
	const words = query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
	return { settings: rows.filter(row => words.every(word => `${row.key} ${row.label} ${row.page} ${row.description}`.toLowerCase().includes(word))) };
}

/** settings.set: saves it the way the Settings page does. */
export async function setSetting(key: unknown, value: unknown) {
	if (typeof key !== "string") throw new Error("key must be a setting key from settings.list.");
	const device = Object.hasOwn(windowSettings, key) ? windowSettings[key] : undefined;
	const spec = device ?? (isWorkspaceSetting(key) ? workspaceSettings[key] : undefined);
	if (!spec) throw new Error("Unknown setting; settings.list lists them.");
	if (device) {
		if (device.type === "boolean") flag(value, key); else if (device.type === "enum" && device.values.length) choice(value, device.values, key);
		device.write(value);
		return { key, value: device.read() };
	}
	const api = window.phaseoDesktop?.workspace;
	if (!api) throw new Error("Open the desktop application to change workspace settings.");
	// The main process validates the whole set, exactly as for the Settings page.
	const saved = await api.savePreferences({ ...(await api.preferences()).preferences, [key]: value });
	publishWorkspacePreferences(saved);
	return { key, value: saved[key as keyof typeof saved] };
}
