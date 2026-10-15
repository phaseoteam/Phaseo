/** Device presets in Chrome DevTools' default order, as in T3 Code; sizes are CSS pixels. */
export const browserViewportPresets = [
	{ id: "iphone-se", label: "iPhone SE", width: 375, height: 667 },
	{ id: "iphone-xr", label: "iPhone XR", width: 414, height: 896 },
	{ id: "iphone-12-pro", label: "iPhone 12 Pro", width: 390, height: 844 },
	{ id: "iphone-14-pro-max", label: "iPhone 14 Pro Max", width: 430, height: 932 },
	{ id: "pixel-7", label: "Pixel 7", width: 412, height: 915 },
	{ id: "samsung-galaxy-s8-plus", label: "Samsung Galaxy S8+", width: 360, height: 740 },
	{ id: "samsung-galaxy-s20-ultra", label: "Samsung Galaxy S20 Ultra", width: 412, height: 915 },
	{ id: "ipad-mini", label: "iPad Mini", width: 768, height: 1024 },
	{ id: "ipad-air", label: "iPad Air", width: 820, height: 1180 },
	{ id: "ipad-pro", label: "iPad Pro", width: 1024, height: 1366 },
	{ id: "surface-pro-7", label: "Surface Pro 7", width: 912, height: 1368 },
	{ id: "surface-duo", label: "Surface Duo", width: 540, height: 720 },
	{ id: "galaxy-z-fold-5", label: "Galaxy Z Fold 5", width: 344, height: 882 },
	{ id: "asus-zenbook-fold", label: "Asus Zenbook Fold", width: 853, height: 1280 },
	{ id: "samsung-galaxy-a51-71", label: "Samsung Galaxy A51/71", width: 412, height: 914 },
	{ id: "nest-hub", label: "Nest Hub", width: 1024, height: 600 },
	{ id: "nest-hub-max", label: "Nest Hub Max", width: 1280, height: 800 },
] as const;
export type BrowserViewportPresetId = typeof browserViewportPresets[number]["id"];
export const browserViewportLimits = { min: 240, max: 3840, area: 3840 * 2160 };

/** The page fills the panel, or shows at a fixed CSS size that is scaled down to fit. */
export type BrowserViewport = { mode: "fill" } | { mode: "device"; width: number; height: number; preset?: BrowserViewportPresetId };
const legacyViewports: Record<string, BrowserViewport> = {
	desktop: { mode: "fill" },
	phone: { mode: "device", width: 390, height: 844, preset: "iphone-12-pro" },
	"phone-landscape": { mode: "device", width: 844, height: 390, preset: "iphone-12-pro" },
	tablet: { mode: "device", width: 768, height: 1024, preset: "ipad-mini" },
	"tablet-landscape": { mode: "device", width: 1024, height: 768, preset: "ipad-mini" },
};
export const validBrowserDimension = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= browserViewportLimits.min && (value as number) <= browserViewportLimits.max;
/** Accepts a viewport, or one of the earlier Desktop/Phone/Tablet names saved before device presets. */
export function browserViewport(value: unknown): BrowserViewport {
	if (typeof value === "string" && value in legacyViewports) return legacyViewports[value];
	if (!value || typeof value !== "object") throw new Error("Invalid browser viewport.");
	const input = value as Record<string, unknown>;
	if (input.mode === "fill") return { mode: "fill" };
	if (input.mode !== "device" || !validBrowserDimension(input.width) || !validBrowserDimension(input.height) || input.width * input.height > browserViewportLimits.area) throw new Error("Invalid browser viewport.");
	const preset = browserViewportPresets.find(item => item.id === input.preset);
	if (input.preset !== undefined && !preset) throw new Error("Invalid browser viewport.");
	return { mode: "device", width: input.width, height: input.height, ...(preset ? { preset: preset.id } : {}) };
}

export const browserZoomLevels = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;
export function browserZoom(value: unknown): number { if (!browserZoomLevels.includes(value as typeof browserZoomLevels[number])) throw new Error("Invalid browser zoom."); return value as number; }
/** The next zoom step from the current factor; a factor between steps moves to the nearest step in that direction. */
export function stepBrowserZoom(current: number, direction: 1 | -1): number {
	if (direction > 0) return browserZoomLevels.find(level => level > current + 0.001) ?? browserZoomLevels[browserZoomLevels.length - 1];
	return [...browserZoomLevels].reverse().find(level => level < current - 0.001) ?? browserZoomLevels[0];
}

export type BrowserColorScheme = "system" | "light" | "dark";
export function browserColorScheme(value: unknown): BrowserColorScheme { if (value !== "system" && value !== "light" && value !== "dark") throw new Error("Invalid colour scheme."); return value; }

export type BrowserOpenTab = { sourceId: string; url: string; background: boolean };
/** A main-frame load that failed, for the "This site can't be reached" page. */
export type BrowserFailure = { url: string; code: number; description: string };
export type BrowserState = { id: string; url: string; title: string; favicon?: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; devToolsOpen: boolean; viewport: BrowserViewport; zoom: number; colorScheme: BrowserColorScheme; audible: boolean; muted: boolean; configured: boolean; failure?: BrowserFailure; crashed?: boolean; error?: string };
export type BrowserBounds = { x: number; y: number; width: number; height: number };
export type BrowserCommand = { id: string } & (
	| { type: "show"; bounds: BrowserBounds }
	| { type: "navigate"; url: string }
	| { type: "viewport"; viewport: BrowserViewport }
	| { type: "zoom"; zoom: number }
	| { type: "colorScheme"; colorScheme: BrowserColorScheme }
	| { type: "mute"; muted: boolean }
	| { type: "clearData"; data: "cookies" | "cache" }
	| { type: "hide" | "back" | "forward" | "reload" | "hardReload" | "stop" | "close" | "devtools" | "focus" }
);
const simpleCommands = ["hide", "back", "forward", "reload", "hardReload", "stop", "close", "devtools", "focus"];
/** Checks a renderer request before the browser host acts on it. */
export function browserCommand(value: unknown): BrowserCommand {
	if (!value || typeof value !== "object") throw new Error("Invalid browser request.");
	const input = value as Record<string, unknown>;
	if (typeof input.id !== "string" || !input.id || input.id.length > 200) throw new Error("Invalid browser context.");
	const id = input.id;
	switch (input.type) {
		case "show": {
			const bounds = input.bounds as Record<string, unknown> | undefined;
			if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || (bounds.width as number) < 0 || (bounds.height as number) < 0) throw new Error("Invalid browser bounds.");
			return { id, type: "show", bounds: { x: bounds.x as number, y: bounds.y as number, width: bounds.width as number, height: bounds.height as number } };
		}
		case "navigate": if (typeof input.url !== "string") throw new Error("Invalid browser address."); return { id, type: "navigate", url: browserUrl(input.url) };
		case "viewport": return { id, type: "viewport", viewport: browserViewport(input.viewport) };
		case "zoom": return { id, type: "zoom", zoom: browserZoom(input.zoom) };
		case "colorScheme": return { id, type: "colorScheme", colorScheme: browserColorScheme(input.colorScheme) };
		case "mute": if (typeof input.muted !== "boolean") throw new Error("Invalid browser action."); return { id, type: "mute", muted: input.muted };
		case "clearData": if (input.data !== "cookies" && input.data !== "cache") throw new Error("Invalid browser action."); return { id, type: "clearData", data: input.data };
		default: if (typeof input.type !== "string" || !simpleCommands.includes(input.type)) throw new Error("Invalid browser action."); return { id, type: input.type as "hide" };
	}
}
export function browserId(value: unknown): string { if (typeof value !== "string" || !value || value.length > 200) throw new Error("Invalid browser context."); return value; }

/** A shortcut pressed while a page had focus, handed to the app's keybindings. */
export type BrowserKey = { id: string; key: string; ctrl: boolean; meta: boolean; alt: boolean; shift: boolean };
/** A screenshot of the page or of a picked element, as PNG base64. */
export type BrowserCapture = { png: string; width: number; height: number; url: string; title: string };
export type BrowserPick = BrowserCapture & { selector: string; text: string; tag: string };
/** A local web server listening on this computer. */
export type BrowserLocalServer = { url: string; host: string; port: number; process?: string };

export function browserUrl(value: string): string {
	if (value.length > 8192) throw new Error("Address is too long.");
	const url = new URL(value);
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS address without embedded credentials.");
	return url.href;
}

/** Device toolbar height and resize rail width around the device, as in T3 Code. */
export const browserDeviceToolbarHeight = 38;
export const browserResizeRail = 10;
/** Where a device viewport sits inside the area below the device toolbar: scaled down to fit and centred. Page zoom then changes its CSS width, as browser zoom does on a phone. */
export function browserDeviceFrame(area: BrowserBounds, viewport: Extract<BrowserViewport, { mode: "device" }>): BrowserBounds & { scale: number } {
	const scale = Math.min(1, Math.max(0, area.width) / viewport.width, Math.max(0, area.height) / viewport.height);
	const width = Math.max(0, Math.round(viewport.width * scale)), height = Math.max(0, Math.round(viewport.height * scale));
	return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height, scale };
}

export type BrowserResizeDirection = "east" | "west" | "south" | "southeast" | "southwest";
/** A viewport resized by dragging one of its rails: the device stays centred, so an edge moves twice the pointer distance. */
export function resizeBrowserViewport(start: { width: number; height: number }, delta: { x: number; y: number }, scale: number, direction: BrowserResizeDirection, aspectRatio?: number): { width: number; height: number } {
	const factor = scale > 0 ? scale : 1;
	const horizontal = direction.includes("east") ? delta.x * 2 : direction.includes("west") ? -delta.x * 2 : 0;
	const vertical = direction.includes("south") ? delta.y * 2 : 0;
	const clamp = (value: number) => Math.min(browserViewportLimits.max, Math.max(browserViewportLimits.min, Math.round(value)));
	let width = clamp(start.width + horizontal / factor), height = clamp(start.height + vertical / factor);
	if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
		if (horizontal !== 0 && (vertical === 0 || Math.abs(width - start.width) / start.width >= Math.abs(height - start.height) / start.height)) height = clamp(width / aspectRatio);
		else width = clamp(height * aspectRatio);
	}
	while (width * height > browserViewportLimits.area) { if (width >= height) width--; else height--; }
	return { width, height };
}

/** Chromium network errors in plain words, after T3 Code. */
const errorMessages: Record<string, string> = {
	ERR_NAME_NOT_RESOLVED: "DNS address could not be found",
	ERR_NAME_RESOLUTION_FAILED: "DNS address could not be found",
	ERR_CONNECTION_REFUSED: "Connection refused",
	ERR_CONNECTION_RESET: "Connection was reset",
	ERR_CONNECTION_CLOSED: "Connection was closed",
	ERR_CONNECTION_TIMED_OUT: "Connection timed out",
	ERR_INTERNET_DISCONNECTED: "No internet connection",
	ERR_TIMED_OUT: "Connection timed out",
	ERR_CERT_AUTHORITY_INVALID: "Certificate authority is not trusted",
	ERR_CERT_COMMON_NAME_INVALID: "Certificate hostname mismatch",
	ERR_CERT_DATE_INVALID: "Certificate is expired or not yet valid",
	ERR_TOO_MANY_REDIRECTS: "Too many redirects",
};
export function describeBrowserError(description: string): string { return errorMessages[description] ?? (description || "Network error"); }

const crashWindow = 30_000, crashAttempts = 3, crashDelay = 250;
export type BrowserCrashRecovery = { attempts: number; since: number | null };
/** When to reload a page whose renderer crashed: 250 ms, 500 ms, 1 s, then give up until 30 s have passed. */
export function planBrowserCrashRecovery(state: BrowserCrashRecovery, now: number): { delay: number; state: BrowserCrashRecovery } | undefined {
	const fresh = state.since === null || now - state.since >= crashWindow;
	const attempts = fresh ? 0 : state.attempts;
	if (attempts >= crashAttempts) return;
	return { delay: crashDelay * 2 ** attempts, state: { attempts: attempts + 1, since: fresh ? now : state.since } };
}
