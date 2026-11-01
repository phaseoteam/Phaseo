/**
 * Agent HTML (charts, diagrams, mockups) shown inline in a chat. html_render keeps the page on the turn as an activity, and the
 * chat shows it in a sandboxed frame served from its own scheme: a srcdoc or data frame would inherit the app's script policy,
 * so the page's scripts would never run.
 */

export const htmlRenderScheme = "phaseo-html";
export const htmlRenderLimits = { bytes: 256 * 1024, titleLength: 200, minHeight: 80, maxHeight: 2000, minWidth: 240, maxWidth: 1600, columnWidth: 720, consoleMessages: 50 } as const;
export type HtmlAppearance = "dark" | "light";
export type HtmlRenderRequest = { html: string; title: string; height: number };
export type HtmlPreviewRequest = { html: string; width: number; appearance: HtmlAppearance };
export type HtmlPreviewResult = { width: number; contentHeight: number; capturedHeight: number; consoleMessages: { level: "log" | "info" | "warning" | "error"; text: string }[]; image?: { mimeType: "image/png"; data: string } };
/** What an html_render activity carries besides the page itself, which is its text. */
export type HtmlRenderActivity = { title: string; height: number };

export const htmlRenderGuide = `Pages are complete, self-contained HTML documents of at most ${htmlRenderLimits.bytes / 1024} KB: inline <style> and <script>; scripts, styles, fonts and images from https addresses load, and nothing else does (no fetch or XHR). The frame is the reply's width (about ${htmlRenderLimits.columnWidth}px) on the chat's background: leave html and body without a background, border or side padding, use the theme variables --background, --foreground, --muted-foreground, --border, --primary, --chart-1 to --chart-6, --font-sans, --font-mono and --radius instead of fixed colours, give charts fixed pixel heights, and never use vh units or height:100% on html or body.`;

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected HTML tool arguments.");
	return value as Record<string, unknown>;
}
function html(value: unknown) {
	if (typeof value !== "string" || !value.trim()) throw new Error("Pass html, a complete HTML document.");
	if (new TextEncoder().encode(value).length > htmlRenderLimits.bytes) throw new Error(`The page is over ${htmlRenderLimits.bytes / 1024} KB. Make it smaller: inline less data, or draw with fewer elements.`);
	if (/(?:^|[^\w-])(?:height|min-height)\s*:\s*\d*\.?\d+\s*vh\b/i.test(value)) throw new Error("Do not use vh units for heights: the frame fits its content, so a page sized by the frame grows forever. Use fixed pixel heights.");
	return value;
}
const integer = (value: unknown, key: string, minimum: number, maximum: number, fallback?: number) => {
	if (value === undefined && fallback !== undefined) return fallback;
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${key}; use ${minimum} to ${maximum}.`);
	return Math.min(maximum, Math.max(minimum, Math.round(value)));
};

export function validateHtmlRender(value: unknown): HtmlRenderRequest {
	const input = object(value);
	if (typeof input.title !== "string" || !input.title.trim() || input.title.length > htmlRenderLimits.titleLength) throw new Error(`Invalid title; use 1 to ${htmlRenderLimits.titleLength} characters.`);
	return { html: html(input.html), title: input.title.trim(), height: integer(input.height, "height", htmlRenderLimits.minHeight, htmlRenderLimits.maxHeight) };
}
export function validateHtmlPreview(value: unknown): HtmlPreviewRequest {
	const input = object(value);
	if (input.appearance !== undefined && input.appearance !== "dark" && input.appearance !== "light") throw new Error("Invalid appearance; use dark or light.");
	return { html: html(input.html), width: integer(input.width, "width", htmlRenderLimits.minWidth, htmlRenderLimits.maxWidth, htmlRenderLimits.columnWidth), appearance: input.appearance === "light" ? "light" : "dark" };
}

const palettes: Record<HtmlAppearance, Record<string, string>> = {
	dark: { background: "#101112", foreground: "#ececec", "muted-foreground": "#9a9a9e", border: "#2a2b2e", primary: "#6d8cff", "chart-1": "#6d8cff", "chart-2": "#3fbf8f", "chart-3": "#f0a43c", "chart-4": "#e2637a", "chart-5": "#a77cf0", "chart-6": "#47b6d6" },
	light: { background: "#ffffff", foreground: "#18181b", "muted-foreground": "#6b6b73", border: "#e4e4e7", primary: "#3657e0", "chart-1": "#3657e0", "chart-2": "#1f9d6e", "chart-3": "#c97a12", "chart-4": "#cc3d58", "chart-5": "#7c4fd6", "chart-6": "#1c8db0" },
};
/** The theme the page's variables come from, and the frame's 8px gutter so focus rings and shadows are not clipped. */
export function htmlRenderBaseSheet(appearance: HtmlAppearance) {
	const variables = Object.entries(palettes[appearance]).map(([name, value]) => `--${name}:${value}`).join(";");
	return `<style>:root{color-scheme:${appearance};${variables};--radius:6px;--font-sans:system-ui,-apple-system,"Segoe UI",sans-serif;--font-mono:ui-monospace,"Cascadia Code",Consolas,monospace}html{padding:8px;background:transparent;color:var(--foreground);font:14px/1.5 var(--font-sans)}body{margin:0}</style>`;
}
/** Reports the page's height to the chat, which fits the frame to it. */
export const htmlRenderHeightScript = `<script>(()=>{const send=()=>parent.postMessage({phaseoHtmlHeight:Math.ceil(document.documentElement.getBoundingClientRect().height)},"*");new ResizeObserver(send).observe(document.documentElement);addEventListener("load",send);})()</script>`;
/** The page as served: the base sheet first, so the page's own styles win, and the height reporter last. */
export function htmlRenderDocument(page: string, appearance: HtmlAppearance) {
	const head = /<head[^>]*>/i.exec(page);
	const withSheet = head ? page.slice(0, head.index + head[0].length) + htmlRenderBaseSheet(appearance) + page.slice(head.index + head[0].length) : htmlRenderBaseSheet(appearance) + page;
	return withSheet + htmlRenderHeightScript;
}
/** No requests leave the page except loading scripts, styles, fonts and images over https; CSP sandbox keeps it off the app's origin even when opened directly. */
export const htmlRenderPolicy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; media-src data: blob: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts";

const toBase64Url = (text: string) => { const bytes = new TextEncoder().encode(text); let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromBase64Url = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0)));
/** The page travels in the address, so serving it needs no store and the frame shows exactly what the chat holds. */
export const htmlRenderUrl = (page: string, appearance: HtmlAppearance) => `${htmlRenderScheme}://page/${appearance}?h=${toBase64Url(page)}`;
export function htmlRenderFromUrl(url: string): { page: string; appearance: HtmlAppearance } | undefined {
	let parsed: URL; try { parsed = new URL(url); } catch { return undefined; }
	const appearance = parsed.pathname.replace(/^\//, ""), encoded = parsed.searchParams.get("h");
	if (parsed.protocol !== `${htmlRenderScheme}:` || (appearance !== "dark" && appearance !== "light") || !encoded || encoded.length > Math.ceil(htmlRenderLimits.bytes * 4 / 3) + 4) return undefined;
	try { return { page: fromBase64Url(encoded), appearance }; } catch { return undefined; }
}
