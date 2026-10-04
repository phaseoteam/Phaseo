export type BrowserState = { id: string; url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error?: string };
export type BrowserCommand = { id: string } & (
	| { type: "show"; bounds: { x: number; y: number; width: number; height: number } }
	| { type: "navigate"; url: string }
	| { type: "hide" | "back" | "forward" | "reload" | "stop" | "close" }
);
export function browserUrl(value: string): string {
	if (value.length > 8192) throw new Error("Address is too long.");
	const url = new URL(value);
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS address without embedded credentials.");
	return url.href;
}
