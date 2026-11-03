import { browserUrl } from "../../shared/browser";

/** A page opened in the browser; project is "" for personal chats. */
export type BrowserRecent = { url: string; title: string; at: number; project?: string; favicon?: string };
const validFavicon = (value: unknown): value is string => typeof value === "string" && ((value.startsWith("https://") && value.length <= 2048) || (value.startsWith("data:image/") && value.length <= 8192));
export const browserHistoryLimit = 50;
const searchUrl = "https://duckduckgo.com/?q=";
const addressHost = /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:.]+\])$/i;
const loopbackHost = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\])$/i;
const bareHostPort = /^[^/?#:@]+:\d+(?:[/?#]|$)/;

/**
 * What was typed in the address bar as the address to open: a scheme is kept; text without spaces whose
 * host has a dot, a port, or is localhost or an IP address gets http:// for loopback hosts and https:// otherwise;
 * anything else is a DuckDuckGo search.
 */
export function browserNavigationAddress(value: string): string {
	const input = value.trim();
	if (!input || input.length > 8192) throw Error("Enter a URL or search.");
	if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) return browserUrl(input);
	if (!/\s/.test(input)) {
		const scheme = /^([a-z][a-z\d+.-]*):/i.exec(input)?.[1];
		if (scheme && !bareHostPort.test(input)) return browserUrl(input);
		const authority = input.split(/[/?#]/, 1)[0].replace(/^[^@]*@/, "");
		const host = authority.replace(/:\d+$/, "");
		if (host.length < authority.length || addressHost.test(host) || /^[^.]+(?:\.[^.]+)+\.?$/.test(host)) {
			try { return browserUrl((loopbackHost.test(host) ? "http://" : "https://") + input); } catch { /* Not an address after all: search for it. */ }
		}
	}
	return searchUrl + encodeURIComponent(input);
}

/** Stored recents, validated; at most fifty per project. */
export function browserRecents(value: unknown): BrowserRecent[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>(), counts = new Map<string, number>();
	return value.slice(0, 1000).flatMap(item => {
		if (!item || typeof item !== "object" || typeof item.url !== "string" || typeof item.title !== "string" || !Number.isFinite(item.at)) return [];
		const project = typeof item.project === "string" ? item.project.slice(0, 200) : "";
		let url: string; try { url = browserUrl(item.url); } catch { return []; }
		const key = project + "\n" + url, count = counts.get(project) ?? 0;
		if (seen.has(key) || count >= browserHistoryLimit) return [];
		seen.add(key); counts.set(project, count + 1);
		return [{ url, title: item.title.slice(0, 160), at: item.at, ...(project ? { project } : {}), ...(validFavicon(item.favicon) ? { favicon: item.favicon } : {}) }];
	});
}

/** The project's recents with this visit first. */
export function recordBrowserVisit(values: unknown, visit: BrowserRecent): BrowserRecent[] {
	const project = visit.project ?? "";
	return browserRecents([{ ...visit, ...(project ? { project } : {}) }, ...browserRecents(values).filter(item => !((item.project ?? "") === project && item.url === visit.url))]);
}

export const projectRecents = (values: BrowserRecent[], project: string) => values.filter(item => (item.project ?? "") === project);
