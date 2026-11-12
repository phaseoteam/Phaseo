import { describe, expect, it } from "vitest";
import { browserCommand } from "./browser";
import { agentBrowserToolsEnabled, browserLinkTarget, browserProfilePartition, browserSearchTemplate, browserSearchUrl, defaultBrowserPreferences, knownBrowserProfile, newBrowserProfileName, validateBrowserPreferences, validSearchUrlTemplate } from "./browserPreferences";

describe("browser preferences", () => {
	it("defaults to today's browser: links in Phaseo, DuckDuckGo, agent tools on, only the Default profile", () => {
		expect(validateBrowserPreferences(undefined)).toEqual({ openLinksIn: "phaseo", searchEngine: "duckduckgo", customSearchUrl: "", agentTools: true, profiles: [], defaultProfile: "default" });
		expect(validateBrowserPreferences({})).toEqual(defaultBrowserPreferences);
	});
	it("keeps saved choices and fills fields saved before they existed", () => {
		expect(validateBrowserPreferences({ openLinksIn: "system", searchEngine: "custom", customSearchUrl: " https://search.example/?q=%s ", profiles: [{ id: "profile-work", name: " Work " }], defaultProfile: "profile-work" }))
			.toEqual({ openLinksIn: "system", searchEngine: "custom", customSearchUrl: "https://search.example/?q=%s", agentTools: true, profiles: [{ id: "profile-work", name: "Work" }], defaultProfile: "profile-work" });
	});
	it.each([
		[null, "Invalid browser preferences"], [[], "Invalid browser preferences"],
		[{ openLinksIn: "tab" }, "Choose where links open"], [{ searchEngine: "yahoo" }, "Choose a search engine"],
		[{ searchEngine: "custom" }, "search URL"], [{ searchEngine: "custom", customSearchUrl: "https://example.com/search" }, "search URL"],
		[{ customSearchUrl: "ftp://example.com/?q=%s" }, "search URL"], [{ customSearchUrl: "javascript:alert('%s')" }, "search URL"], [{ customSearchUrl: 42 }, "Invalid custom search URL"],
		[{ agentTools: "yes" }, "Invalid agent browser setting"],
		[{ profiles: {} }, "browser profiles"], [{ profiles: [{ id: "default", name: "Mine" }] }, "Invalid browser profile"], [{ profiles: [{ id: "Bad Id", name: "Work" }] }, "Invalid browser profile"],
		[{ profiles: [{ id: "a", name: "One" }, { id: "a", name: "Two" }] }, "Invalid browser profile"], [{ profiles: [{ id: "a", name: "  " }] }, "name"], [{ profiles: [{ id: "a", name: "x".repeat(49) }] }, "name"],
		[{ profiles: Array.from({ length: 25 }, (_, index) => ({ id: `p${index}`, name: `P${index}` })) }, "up to 24"],
		[{ defaultProfile: "gone" }, "default browser profile"],
	])("rejects %j", (value, message) => expect(() => validateBrowserPreferences(value)).toThrow(message));
});

describe("address bar search", () => {
	it.each([["duckduckgo", "https://duckduckgo.com/?q=cats%20%26%20dogs"], ["google", "https://www.google.com/search?q=cats%20%26%20dogs"], ["bing", "https://www.bing.com/search?q=cats%20%26%20dogs"], ["brave", "https://search.brave.com/search?q=cats%20%26%20dogs"], ["kagi", "https://kagi.com/search?q=cats%20%26%20dogs"], ["ecosia", "https://www.ecosia.org/search?q=cats%20%26%20dogs"]] as const)("searches %s", (engine, url) => {
		expect(browserSearchUrl(browserSearchTemplate({ searchEngine: engine, customSearchUrl: "" }), "cats & dogs")).toBe(url);
	});
	it("fills every %s of a custom URL, and falls back to DuckDuckGo when it is unusable", () => {
		expect(browserSearchUrl(browserSearchTemplate({ searchEngine: "custom", customSearchUrl: "https://example.com/s?q=%s&again=%s" }), "a b")).toBe("https://example.com/s?q=a%20b&again=a%20b");
		expect(browserSearchTemplate({ searchEngine: "custom", customSearchUrl: "" })).toBe("https://duckduckgo.com/?q=%s");
	});
	it.each(["https://example.com/?q=%s", "http://localhost:8080/search/%s", "https://example.com/#q=%s"])("accepts custom search URL %s", value => expect(validSearchUrlTemplate(value)).toBe(true));
	it.each(["", "https://example.com/?q=", "example.com/?q=%s", "ftp://example.com/?q=%s", "https://%s.example.com/", "https://%s@example.com/", "https://example.com/?q=%s\n", `https://example.com/?q=%s${"x".repeat(2048)}`])("refuses custom search URL %j", value => expect(validSearchUrlTemplate(value)).toBe(false));
});

describe("where a link opens", () => {
	const url = "https://example.com/page";
	it.each([
		["phaseo", {}, "phaseo"], ["phaseo", { ctrlKey: true }, "system"], ["phaseo", { metaKey: true }, "system"], ["phaseo", { button: 1 }, "system"],
		["system", {}, "system"], ["system", { ctrlKey: true }, "phaseo"], ["system", { metaKey: true }, "phaseo"], ["system", { button: 1 }, "phaseo"],
	] as const)("setting %s with %j opens in %s", (setting, event, target) => expect(browserLinkTarget(setting, url, event)).toBe(target));
	it("opens anything but a plain web address in the system browser", () => {
		for (const link of ["mailto:a@example.com", "file:///C:/secret", "https://user:pass@example.com/", "not a url"]) expect(browserLinkTarget("phaseo", link, { ctrlKey: true })).toBe("system");
		expect(browserLinkTarget("phaseo", url)).toBe("phaseo");
	});
});

describe("agent browser tools", () => {
	it("follows the project's own choice, else the workspace setting", () => {
		expect(agentBrowserToolsEnabled({ agentTools: true })).toBe(true);
		expect(agentBrowserToolsEnabled({ agentTools: false }, {})).toBe(false);
		expect(agentBrowserToolsEnabled({ agentTools: true }, { agentBrowserTools: false })).toBe(false);
		expect(agentBrowserToolsEnabled({ agentTools: false }, { agentBrowserTools: true })).toBe(true);
	});
});

describe("browser profiles", () => {
	it("keeps the built-in Default on the partition used before profiles, and gives each profile its own", () => {
		expect(browserProfilePartition("default")).toBe("persist:phaseo-browser");
		expect(browserProfilePartition("profile-work")).toBe("persist:phaseo-browser-profile-work");
		expect(() => browserProfilePartition("../other")).toThrow("Invalid browser profile");
		expect(() => browserProfilePartition("")).toThrow("Invalid browser profile");
	});
	it("opens a tab whose profile was removed in Default", () => {
		const preferences = { profiles: [{ id: "work", name: "Work" }] };
		expect(knownBrowserProfile(preferences, "work")).toBe("work");
		expect(knownBrowserProfile(preferences, "gone")).toBe("default");
		expect(knownBrowserProfile(preferences, undefined)).toBe("default");
	});
	it("numbers a new profile's name when it is taken", () => {
		expect(newBrowserProfileName({ profiles: [] })).toBe("New profile");
		expect(newBrowserProfileName({ profiles: [{ id: "a", name: "New profile" }, { id: "b", name: "New profile 2" }] })).toBe("New profile 3");
	});
	it("carries a tab's profile on browser commands, checked", () => {
		expect(browserCommand({ id: "chat", type: "reload", profile: "work" })).toEqual({ id: "chat", type: "reload", profile: "work" });
		expect(browserCommand({ id: "chat", type: "profile", profile: "default" })).toEqual({ id: "chat", type: "profile", profile: "default" });
		expect(() => browserCommand({ id: "chat", type: "profile" })).toThrow("Invalid browser profile");
		expect(() => browserCommand({ id: "chat", type: "reload", profile: "../../x" })).toThrow("Invalid browser profile");
	});
});
