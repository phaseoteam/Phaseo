export type BrowserViewport = "desktop" | "phone" | "phone-landscape" | "tablet" | "tablet-landscape";
export function browserViewport(value: unknown): BrowserViewport { if (typeof value !== "string" || !["desktop", "phone", "phone-landscape", "tablet", "tablet-landscape"].includes(value)) throw new Error("Invalid browser viewport."); return value as BrowserViewport; }
export const browserViewportSizes = { phone: { width: 390, height: 844 }, "phone-landscape": { width: 844, height: 390 }, tablet: { width: 768, height: 1024 }, "tablet-landscape": { width: 1024, height: 768 } };
export type BrowserOpenTab = { sourceId: string; url: string; background: boolean };
export type BrowserState = { id: string; url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; devToolsOpen: boolean; viewport: BrowserViewport; error?: string };
export type BrowserCommand = { id: string } & (
	| { type: "show"; bounds: { x: number; y: number; width: number; height: number } }
	| { type: "navigate"; url: string }
	| { type: "viewport"; viewport: BrowserViewport }
	| { type: "hide" | "back" | "forward" | "reload" | "stop" | "close" | "devtools" }
);
export function browserUrl(value: string): string {
	if (value.length > 8192) throw new Error("Address is too long.");
	const url = new URL(value);
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS address without embedded credentials.");
	return url.href;
}
