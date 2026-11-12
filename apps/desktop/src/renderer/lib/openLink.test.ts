import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences } from "../../shared/preferences";

/** A window with the desktop bridge; `pane` says whether a chat's browser pane is listening for links. */
async function setup(openLinksIn: "phaseo" | "system", pane: boolean) {
	vi.resetModules();
	const target = new EventTarget(), opened: string[] = [], shown: string[] = [];
	const preferences = { ...defaultPreferences, browser: { ...defaultPreferences.browser, openLinksIn } };
	if (pane) target.addEventListener("phaseo:open-context-link", event => { event.preventDefault(); shown.push((event as CustomEvent<string>).detail); });
	vi.stubGlobal("window", Object.assign(target, { phaseoDesktop: { workspace: { openLink: async (url: string) => { opened.push(url); }, preferences: async () => ({ preferences }) } } }));
	const { openWebLink } = await import("./openLink");
	return { openWebLink, opened, shown };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("web links from anywhere in the app", () => {
	const url = "https://github.com/phaseoteam/Phaseo/issues/12";
	it("open in the chat's browser pane when the setting says Phaseo", async () => {
		const { openWebLink, opened, shown } = await setup("phaseo", true);
		await openWebLink(url);
		expect(shown).toEqual([url]);
		expect(opened).toEqual([]);
	});
	it("fall back to the system browser when no chat pane is open", async () => {
		const { openWebLink, opened, shown } = await setup("phaseo", false);
		await openWebLink(url);
		expect(shown).toEqual([]);
		expect(opened).toEqual([url]);
	});
	it("follow the system setting, and Ctrl picks the other one", async () => {
		const { openWebLink, opened, shown } = await setup("system", true);
		await openWebLink(url);
		await openWebLink(url, { ctrlKey: true });
		expect(opened).toEqual([url]);
		expect(shown).toEqual([url]);
	});
});
