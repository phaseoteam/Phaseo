import { browserUrl } from "../../shared/browser";
export type BrowserRecent = { url: string; title: string; at: number };
export function browserNavigationAddress(value: string): string {
	const input = value.trim();
	if (!input || input.length > 8192) throw Error("Enter a URL or search.");
	if (/^https?:\/\//i.test(input)) return browserUrl(input);
	const host = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(input);
	if (host) return browserUrl("http://" + input);
	if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^[^\s/:]+:\d+(?:[/?#]|$)/.test(input)) return browserUrl(input);
	if (!/\s/.test(input) && /^(?:[^/:]+\.[^/:]+|[^/:]+:\d+)(?:[/?#]|$)/.test(input)) return browserUrl("https://" + input);
	return "https://www.google.com/search?q=" + encodeURIComponent(input);
}
export function browserRecents(value: unknown): BrowserRecent[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	return value.slice(0, 100).flatMap(item => {
		if (!item || typeof item !== "object" || typeof item.url !== "string" || typeof item.title !== "string" || !Number.isFinite(item.at)) return [];
		let url: string; try { url = browserUrl(item.url); } catch { return []; }
		if (seen.has(url)) return []; seen.add(url);
		return [{ url, title: item.title.slice(0, 160), at: item.at }];
	});
}
