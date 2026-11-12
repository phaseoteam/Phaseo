/**
 * Workspace preferences for links, the search engine, the agent's browser tools and browser profiles (Settings → Browser). Saved with the rest in WorkspacePreferences.browser.
 * openLinksIn is where links in chats and terminals open; Ctrl or Cmd held, or the middle button, opens the other one. searchEngine is what the address bar searches with; "custom" uses customSearchUrl.
 * agentTools offers agents the built-in browser's tools; a project's agentBrowserTools overrides it. profiles are the person's own browser profiles beside the built-in Default; defaultProfile is the one new tabs open in.
 */
export type BrowserPreferences = { openLinksIn: BrowserLinkTarget; searchEngine: BrowserSearchEngine; customSearchUrl: string; agentTools: boolean; profiles: BrowserProfile[]; defaultProfile: string };
export type BrowserLinkTarget = "phaseo" | "system";
export const browserSearchEngines = ["duckduckgo", "google", "bing", "brave", "kagi", "ecosia", "custom"] as const;
export type BrowserSearchEngine = typeof browserSearchEngines[number];
/** A named browser profile: its own cookies, storage and logins, in a partition of its own. */
export type BrowserProfile = { id: string; name: string };
/** The built-in profile. It keeps the partition the browser used before profiles existed, so nobody loses their logins. */
export const defaultBrowserProfileId = "default";
export const defaultBrowserProfileName = "Default";
export const browserProfileLimits = { count: 24, name: 48 };
export const customSearchUrlLimit = 2048;
export const defaultBrowserPreferences: BrowserPreferences = { openLinksIn: "phaseo", searchEngine: "duckduckgo", customSearchUrl: "", agentTools: true, profiles: [], defaultProfile: defaultBrowserProfileId };

/** Address bar search templates; %s is where the encoded search terms go. */
export const browserSearchTemplates: Record<Exclude<BrowserSearchEngine, "custom">, string> = {
	duckduckgo: "https://duckduckgo.com/?q=%s",
	google: "https://www.google.com/search?q=%s",
	bing: "https://www.bing.com/search?q=%s",
	brave: "https://search.brave.com/search?q=%s",
	kagi: "https://kagi.com/search?q=%s",
	ecosia: "https://www.ecosia.org/search?q=%s",
};
export const browserSearchEngineLabels: Record<BrowserSearchEngine, string> = { duckduckgo: "DuckDuckGo", google: "Google", bing: "Bing", brave: "Brave Search", kagi: "Kagi", ecosia: "Ecosia", custom: "Custom" };
/** Control characters (newlines, NUL, DEL) never belong in a search URL or a profile name. */
const hasControl = (value: string) => [...value].some(character => { const code = character.charCodeAt(0); return code < 32 || code === 127; });
const fillSearchTemplate = (template: string, query: string) => template.replaceAll("%s", encodeURIComponent(query));

/**
 * Whether a custom search address is an http or https URL with %s where the search terms go. %s in the host or the
 * credentials is refused: the terms would never reach a search page, and terms with spaces would break the host.
 */
export function validSearchUrlTemplate(template: string): boolean {
	if (template.length > customSearchUrlLimit || !template.includes("%s") || hasControl(template)) return false;
	try {
		const one = new URL(fillSearchTemplate(template, "a")), other = new URL(fillSearchTemplate(template, "b"));
		const authority = (url: URL) => `${url.username}:${url.password}@${url.host}`;
		return (one.protocol === "http:" || one.protocol === "https:") && Boolean(one.hostname) && authority(one) === authority(other);
	} catch { return false; }
}
/** The chosen engine's search template; an unusable custom one falls back to DuckDuckGo, so a search always goes somewhere. */
export function browserSearchTemplate(preferences: Pick<BrowserPreferences, "searchEngine" | "customSearchUrl">): string {
	if (preferences.searchEngine !== "custom") return browserSearchTemplates[preferences.searchEngine] ?? browserSearchTemplates.duckduckgo;
	return validSearchUrlTemplate(preferences.customSearchUrl) ? preferences.customSearchUrl : browserSearchTemplates.duckduckgo;
}
/** The address that searches for the terms with a template. */
export const browserSearchUrl = (template: string, query: string) => fillSearchTemplate(template, query);

/** Whether a click opens a link in Phaseo's browser or the system browser: the setting, or the other one with Ctrl or Cmd held or the middle button. Only web links can open in Phaseo. */
export function browserLinkTarget(setting: BrowserLinkTarget, url: string, event?: { ctrlKey?: boolean; metaKey?: boolean; button?: number }): BrowserLinkTarget {
	let web = false;
	try { const parsed = new URL(url); web = (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password; } catch { /* Not a web address. */ }
	if (!web) return "system";
	const flipped = Boolean(event?.ctrlKey || event?.metaKey || event?.button === 1);
	return flipped ? (setting === "phaseo" ? "system" : "phaseo") : setting;
}

/** Whether agents in a project get the built-in browser's tools: the project's own choice, else the workspace setting. */
export const agentBrowserToolsEnabled = (preferences: Pick<BrowserPreferences, "agentTools">, project?: { agentBrowserTools?: boolean }) => project?.agentBrowserTools ?? preferences.agentTools;

/** Profile ids name partitions, so they are plain lowercase words. */
export const validBrowserProfileId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
/** The session partition a profile's cookies, storage and logins live in; the built-in Default keeps the one used before profiles. */
export function browserProfilePartition(profile: string): string {
	if (profile === defaultBrowserProfileId) return "persist:phaseo-browser";
	if (!validBrowserProfileId(profile)) throw new Error("Invalid browser profile.");
	return `persist:phaseo-browser-${profile}`;
}
/** The built-in Default first, then the person's own profiles. */
export const browserProfiles = (preferences: Pick<BrowserPreferences, "profiles">): BrowserProfile[] => [{ id: defaultBrowserProfileId, name: defaultBrowserProfileName }, ...preferences.profiles];
/** A profile that still exists, else the built-in Default: a tab whose profile was removed opens in Default. */
export const knownBrowserProfile = (preferences: Pick<BrowserPreferences, "profiles">, profile: string | undefined) => profile && preferences.profiles.some(item => item.id === profile) ? profile : defaultBrowserProfileId;
/** A new profile's name: the base name, numbered when it is taken. */
export function newBrowserProfileName(preferences: Pick<BrowserPreferences, "profiles">, base = "New profile") {
	const taken = new Set(browserProfiles(preferences).map(profile => profile.name.toLowerCase()));
	let name = base;
	for (let index = 2; taken.has(name.toLowerCase()); index++) name = `${base} ${index}`;
	return name;
}

function validateProfiles(value: unknown): BrowserProfile[] {
	if (!Array.isArray(value) || value.length > browserProfileLimits.count) throw new Error(`You can have up to ${browserProfileLimits.count} browser profiles.`);
	const profiles = value.map((item): BrowserProfile => {
		if (!item || typeof item !== "object" || !validBrowserProfileId((item as BrowserProfile).id) || (item as BrowserProfile).id === defaultBrowserProfileId) throw new Error("Invalid browser profile.");
		const name = typeof (item as BrowserProfile).name === "string" ? (item as BrowserProfile).name.trim() : "";
		if (!name || name.length > browserProfileLimits.name || hasControl(name)) throw new Error(`Give each browser profile a name of up to ${browserProfileLimits.name} characters.`);
		return { id: (item as BrowserProfile).id, name };
	});
	if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) throw new Error("Invalid browser profile.");
	return profiles;
}

/** Preferences saved before a field existed omit it, so missing fields take their defaults; a present but invalid value throws. */
export function validateBrowserPreferences(value: unknown): BrowserPreferences {
	if (value === undefined) return { ...defaultBrowserPreferences, profiles: [] };
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid browser preferences.");
	const input = value as Record<string, unknown>;
	const openLinksIn = input.openLinksIn ?? defaultBrowserPreferences.openLinksIn;
	if (openLinksIn !== "phaseo" && openLinksIn !== "system") throw new Error("Choose where links open.");
	const searchEngine = input.searchEngine ?? defaultBrowserPreferences.searchEngine;
	if (!(browserSearchEngines as readonly unknown[]).includes(searchEngine)) throw new Error("Choose a search engine.");
	const customSearchUrl = input.customSearchUrl ?? "";
	if (typeof customSearchUrl !== "string") throw new Error("Invalid custom search URL.");
	const custom = customSearchUrl.trim();
	if ((custom || searchEngine === "custom") && !validSearchUrlTemplate(custom)) throw new Error("Enter an http or https search URL with %s where the search terms go.");
	const agentTools = input.agentTools ?? defaultBrowserPreferences.agentTools;
	if (typeof agentTools !== "boolean") throw new Error("Invalid agent browser setting.");
	const profiles = input.profiles === undefined ? [] : validateProfiles(input.profiles);
	const defaultProfile = input.defaultProfile ?? defaultBrowserProfileId;
	if (defaultProfile !== defaultBrowserProfileId && !profiles.some(profile => profile.id === defaultProfile)) throw new Error("Choose a default browser profile that exists.");
	return { openLinksIn, searchEngine: searchEngine as BrowserSearchEngine, customSearchUrl: custom, agentTools, profiles, defaultProfile: defaultProfile as string };
}
