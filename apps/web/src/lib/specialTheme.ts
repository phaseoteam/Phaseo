// Time-boxed site colour themes for launch events. The only one so far is "vice":
// neon sunset colours for the GTA VI release window (18–20 Nov 2026).
//
// SPECIAL_THEME_INITIALIZATION_SCRIPT runs before the first paint and sets two
// attributes on <html>:
//   data-special-theme-available  the theme is offered (in its window, or previewed),
//                                 so theme pickers show it as an extra option
//   data-special-theme            the theme is on; styles/special-theme-vice.css keys off it
// Inside its window it is only offered, never switched on for the visitor: picking it in
// a theme picker stores "on", and picking light, dark or system stores "off"
// (localStorage, SPECIAL_THEME_CHOICE_KEY).
//
// Testing outside the window (per browser tab):
//   ?special-theme=vice   offer it and switch it on (unless the picker says "off")
//   ?special-theme=off    force it off
//   ?special-theme=reset  back to the calendar

import { serializeJsonLd } from "@/components/seo/JsonLdScript";

export type SpecialThemeId = "vice";

export type SpecialThemeWindow = {
	id: SpecialThemeId;
	/** First moment the theme shows (inclusive). */
	startsAt: string;
	/** Moment the theme stops showing (exclusive). */
	endsAt: string;
};

export const VICE_THEME: SpecialThemeWindow = {
	id: "vice",
	// 18 Nov 00:00 UTC until 20 Nov has ended in US Pacific time (21 Nov 08:00 UTC).
	startsAt: "2026-11-18T00:00:00.000Z",
	endsAt: "2026-11-21T08:00:00.000Z",
};

export const SPECIAL_THEMES: SpecialThemeWindow[] = [VICE_THEME];

export const SPECIAL_THEME_ATTRIBUTE = "data-special-theme";
export const SPECIAL_THEME_AVAILABLE_ATTRIBUTE = "data-special-theme-available";
/** localStorage: "off" or "on", the visitor's choice in a theme picker. */
export const SPECIAL_THEME_CHOICE_KEY = "phaseo-special-theme-v1";
/** sessionStorage: a per-tab override set from the ?special-theme= query parameter. */
export const SPECIAL_THEME_PREVIEW_KEY = "phaseo-special-theme-preview";
export const SPECIAL_THEME_QUERY_PARAM = "special-theme";

export function isWithinWindow(theme: SpecialThemeWindow, now: number): boolean {
	const start = Date.parse(theme.startsAt);
	const end = Date.parse(theme.endsAt);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
	return now >= start && now < end;
}

export type SpecialThemeState = {
	/** Offered as an option in the theme pickers. */
	available: SpecialThemeId | null;
	/** Currently applied. */
	active: SpecialThemeId | null;
};

/**
 * A tab preview decides availability first, then the calendar. Inside the
 * calendar window the theme is opt-in: on only once the visitor picks it ("on").
 * A tab preview switches it on straight away unless the visitor picked another theme ("off").
 */
export function resolveSpecialTheme({
	now,
	preview,
	choice,
	themes = SPECIAL_THEMES,
}: {
	now: number;
	preview: string | null;
	choice: string | null;
	themes?: SpecialThemeWindow[];
}): SpecialThemeState {
	if (preview === "off") return { available: null, active: null };
	const previewed = themes.find((theme) => theme.id === preview)?.id ?? null;
	if (previewed) return { available: previewed, active: choice !== "off" ? previewed : null };
	const available = themes.find((theme) => isWithinWindow(theme, now))?.id ?? null;
	return { available, active: available && choice === "on" ? available : null };
}

// Values go into an inline <script>, so they are escaped for HTML as well as JS.
const literal = serializeJsonLd;
const windowsJson = literal(SPECIAL_THEMES.map(({ id, startsAt, endsAt }) => [id, Date.parse(startsAt), Date.parse(endsAt)]));

/**
 * Runs in <head> before the body paints. Mirrors resolveSpecialTheme and also
 * applies the ?special-theme= query parameter to the tab override.
 */
export const SPECIAL_THEME_INITIALIZATION_SCRIPT = `(()=>{try{const W=${windowsJson},A=${literal(SPECIAL_THEME_ATTRIBUTE)},V=${literal(SPECIAL_THEME_AVAILABLE_ATTRIBUTE)},S=${literal(SPECIAL_THEME_PREVIEW_KEY)},C=${literal(SPECIAL_THEME_CHOICE_KEY)},q=new URLSearchParams(location.search).get(${literal(SPECIAL_THEME_QUERY_PARAM)});let s=null,c=null;try{if(q==="reset"){sessionStorage.removeItem(S);localStorage.removeItem(C)}else if(q==="off"||W.some(w=>w[0]===q))sessionStorage.setItem(S,q);s=sessionStorage.getItem(S);c=localStorage.getItem(C)}catch{s=q}const n=Date.now();let v=null,p=false;if(s!=="off"){const f=W.find(w=>w[0]===s);if(f){v=f[0];p=true}else{const w=W.find(w=>n>=w[1]&&n<w[2]);if(w)v=w[0]}}const d=document.documentElement;if(v)d.setAttribute(V,v);else d.removeAttribute(V);if(v&&(p?c!=="off":c==="on"))d.setAttribute(A,v);else d.removeAttribute(A)}catch{}})();`;

/** Turns the offered special theme on or off and remembers the choice. */
export function setSpecialThemeActive(active: boolean) {
	if (typeof document === "undefined") return;
	try {
		localStorage.setItem(SPECIAL_THEME_CHOICE_KEY, active ? "on" : "off");
	} catch {
		// Storage can be unavailable (private mode); the choice still applies to this page.
	}
	const root = document.documentElement;
	const available = root.getAttribute(SPECIAL_THEME_AVAILABLE_ATTRIBUTE);
	if (active && available) root.setAttribute(SPECIAL_THEME_ATTRIBUTE, available);
	else root.removeAttribute(SPECIAL_THEME_ATTRIBUTE);
}
