import { describe, expect, it } from "vitest";
import {
	SPECIAL_THEME_ATTRIBUTE,
	SPECIAL_THEME_AVAILABLE_ATTRIBUTE,
	SPECIAL_THEME_CHOICE_KEY,
	SPECIAL_THEME_INITIALIZATION_SCRIPT,
	SPECIAL_THEME_PREVIEW_KEY,
	VICE_THEME,
	resolveSpecialTheme,
} from "./specialTheme";

const before = Date.parse("2026-11-17T23:59:59.000Z");
const opening = Date.parse(VICE_THEME.startsAt);
const releaseDay = Date.parse("2026-11-19T12:00:00.000Z");
const lastMoment = Date.parse(VICE_THEME.endsAt) - 1;
const after = Date.parse(VICE_THEME.endsAt);
const on = { available: "vice", active: "vice" };
const offered = { available: "vice", active: null };
const none = { available: null, active: null };

describe("resolveSpecialTheme", () => {
	it("offers the Vice theme only inside 18–20 November, without switching it on", () => {
		const at = (now: number) => resolveSpecialTheme({ now, preview: null, choice: null });
		expect(at(before)).toEqual(none);
		expect(at(opening)).toEqual(offered);
		expect(at(releaseDay)).toEqual(offered);
		expect(at(lastMoment)).toEqual(offered);
		expect(at(after)).toEqual(none);
	});

	it("applies it once picked, and keeps offering it after switching back", () => {
		expect(resolveSpecialTheme({ now: releaseDay, preview: null, choice: "on" })).toEqual(on);
		expect(resolveSpecialTheme({ now: releaseDay, preview: null, choice: "off" })).toEqual(offered);
		expect(resolveSpecialTheme({ now: after, preview: null, choice: "on" })).toEqual(none);
	});

	it("lets a tab preview override the calendar", () => {
		expect(resolveSpecialTheme({ now: before, preview: "vice", choice: null })).toEqual(on);
		expect(resolveSpecialTheme({ now: before, preview: "vice", choice: "off" })).toEqual(offered);
		expect(resolveSpecialTheme({ now: releaseDay, preview: "off", choice: null })).toEqual(none);
		expect(resolveSpecialTheme({ now: before, preview: "nonsense", choice: null })).toEqual(none);
	});
});

function store(initial: Record<string, string>) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key),
	};
}

function runScript({ now, search = "", session = {}, local = {} }: {
	now: number;
	search?: string;
	session?: Record<string, string>;
	local?: Record<string, string>;
}) {
	const sessionStorage = store(session);
	const localStorage = store(local);
	const attributes = new Map<string, string>();
	const document = {
		documentElement: {
			setAttribute: (name: string, value: string) => void attributes.set(name, value),
			removeAttribute: (name: string) => void attributes.delete(name),
		},
	};
	new Function("document", "location", "sessionStorage", "localStorage", "Date", SPECIAL_THEME_INITIALIZATION_SCRIPT)(
		document,
		{ search },
		sessionStorage,
		localStorage,
		{ now: () => now },
	);
	return {
		state: {
			available: attributes.get(SPECIAL_THEME_AVAILABLE_ATTRIBUTE) ?? null,
			active: attributes.get(SPECIAL_THEME_ATTRIBUTE) ?? null,
		},
		session: sessionStorage.data,
		local: localStorage.data,
	};
}

describe("SPECIAL_THEME_INITIALIZATION_SCRIPT", () => {
	it("matches resolveSpecialTheme", () => {
		for (const now of [before, releaseDay, after]) {
			for (const choice of [null, "off", "on"]) {
				for (const preview of [null, "vice", "off"]) {
					const local: Record<string, string> = choice ? { [SPECIAL_THEME_CHOICE_KEY]: choice } : {};
					const session: Record<string, string> = preview ? { [SPECIAL_THEME_PREVIEW_KEY]: preview } : {};
					expect(runScript({ now, local, session }).state).toEqual(resolveSpecialTheme({ now, preview, choice }));
				}
			}
		}
	});

	it("turns the preview on and off from the query string and remembers it for the tab", () => {
		const preview = runScript({ now: before, search: "?special-theme=vice" });
		expect(preview.state).toEqual(on);
		expect(preview.session.get(SPECIAL_THEME_PREVIEW_KEY)).toBe("vice");
		expect(runScript({ now: before, session: { [SPECIAL_THEME_PREVIEW_KEY]: "vice" } }).state).toEqual(on);
		expect(runScript({ now: releaseDay, search: "?special-theme=off" }).state).toEqual(none);
	});

	it("resets the tab preview and the picker choice", () => {
		const reset = runScript({
			now: releaseDay,
			search: "?special-theme=reset",
			session: { [SPECIAL_THEME_PREVIEW_KEY]: "off" },
			local: { [SPECIAL_THEME_CHOICE_KEY]: "off" },
		});
		expect(reset.state).toEqual(offered);
		expect(reset.session.size).toBe(0);
		expect(reset.local.size).toBe(0);
	});

	it("is safe to inline in a <script> tag", () => {
		// Nothing in it may close the tag or open an HTML comment.
		expect(SPECIAL_THEME_INITIALIZATION_SCRIPT).not.toContain("</");
		expect(SPECIAL_THEME_INITIALIZATION_SCRIPT).not.toContain("<!--");
	});
});
