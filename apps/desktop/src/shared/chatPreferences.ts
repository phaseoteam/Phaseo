/**
 * Workspace preferences for the message box, follow-ups, quitting and diffs (Settings → Chat and Diffs). Saved with the
 * rest in WorkspacePreferences.chat.
 * followUp: what sending does while a turn runs; the other send key does the other one.
 * richTextComposer: formatted Markdown in the message box as you type.
 * quitConfirmation: how quitting is guarded: hold the shortcut (other ways of quitting ask while chats work), ask only
 * while chats are working, always ask, or never.
 * diffLayout and diffIgnoreWhitespace: how diffs open everywhere (the changes panel, commits and a pull request's Code tab);
 * their toolbar buttons change these too. diffColours: the added and removed line colours; blue and orange read apart for
 * people who confuse red and green.
 * openAtLogin: start Phaseo when the person signs in to the computer (installed builds). keepInTray: closing the last window
 * hides it to the tray (Windows, Linux) so chats, schedules and the operator keep working.
 */
export const followUpBehaviours = ["queue", "steer"] as const;
export type FollowUpBehaviour = (typeof followUpBehaviours)[number];
export const quitConfirmations = ["hold", "working", "always", "direct"] as const;
export type QuitConfirmation = (typeof quitConfirmations)[number];
export const diffColourSchemes = ["red-green", "blue-orange"] as const;
export type DiffColourScheme = (typeof diffColourSchemes)[number];
export type ChatPreferences = { followUp: FollowUpBehaviour; richTextComposer: boolean; quitConfirmation: QuitConfirmation; diffLayout: "unified" | "split"; diffIgnoreWhitespace: boolean; diffColours: DiffColourScheme; openAtLogin: boolean; keepInTray: boolean };
export const defaultChatPreferences: ChatPreferences = { followUp: "queue", richTextComposer: true, quitConfirmation: "hold", diffLayout: "unified", diffIgnoreWhitespace: false, diffColours: "red-green", openAtLogin: false, keepInTray: false };

/** Preferences saved before a field existed omit it, so missing fields take their defaults; a present but invalid value throws. */
export function validateChatPreferences(value: unknown): ChatPreferences {
	if (value === undefined) return { ...defaultChatPreferences };
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid chat preferences.");
	const input = value as Record<string, unknown>;
	const choice = <T extends string>(key: string, options: readonly T[], message: string): T => {
		const entry = input[key] ?? defaultChatPreferences[key as keyof ChatPreferences];
		if (!options.includes(entry as T)) throw new Error(message);
		return entry as T;
	};
	const flag = (key: "richTextComposer" | "diffIgnoreWhitespace" | "openAtLogin" | "keepInTray") => {
		const entry = input[key] ?? defaultChatPreferences[key];
		if (typeof entry !== "boolean") throw new Error("Invalid chat preferences.");
		return entry;
	};
	return {
		followUp: choice("followUp", followUpBehaviours, "Choose whether follow-ups queue or steer."),
		richTextComposer: flag("richTextComposer"),
		quitConfirmation: choice("quitConfirmation", quitConfirmations, "Choose when quitting asks first."),
		diffLayout: choice("diffLayout", ["unified", "split"] as const, "Choose a diff layout."),
		diffIgnoreWhitespace: flag("diffIgnoreWhitespace"),
		diffColours: choice("diffColours", diffColourSchemes, "Choose diff colours."),
		openAtLogin: flag("openAtLogin"),
		keepInTray: flag("keepInTray"),
	};
}
