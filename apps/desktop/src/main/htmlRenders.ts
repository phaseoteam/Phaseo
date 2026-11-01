import { BrowserWindow, protocol, session } from "electron";
import { htmlRenderDocument, htmlRenderFromUrl, htmlRenderLimits, htmlRenderPolicy, htmlRenderScheme, type HtmlPreviewRequest, type HtmlPreviewResult } from "../shared/htmlRender";
import { pngPixels } from "./capturePixels";

/** Before the app is ready: the scheme is standard and secure, so frames of it get an origin and https subresources load. */
export function registerHtmlRenderScheme() {
	protocol.registerSchemesAsPrivileged([{ scheme: htmlRenderScheme, privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false } }]);
}

const previewPartition = "phaseo-html-preview";
/** Serves agent pages to the chat's frames and to html_preview's hidden window, each with the page's own policy. */
export function serveHtmlRenders() {
	const handler = (request: Request) => {
		const page = htmlRenderFromUrl(request.url);
		if (!page) return new Response("Not found", { status: 404 });
		return new Response(htmlRenderDocument(page.page, page.appearance), { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": htmlRenderPolicy, "x-content-type-options": "nosniff", "cache-control": "no-store" } });
	};
	protocol.handle(htmlRenderScheme, handler);
	session.fromPartition(previewPartition).protocol.handle(htmlRenderScheme, handler);
}

const levels = ["log", "info", "warning", "error"] as const;
const levelOf = (value: unknown) => typeof value === "number" ? levels[Math.min(3, Math.max(0, value))] : levels.includes(value as typeof levels[number]) ? value as typeof levels[number] : value === "warn" ? "warning" : "log";

/**
 * Renders a page in a hidden window the size of the chat column and returns how tall it is, a screenshot and what it logged.
 * The window has its own in-memory session, no preload and no Node, and is destroyed afterwards.
 */
export async function htmlPreview(request: HtmlPreviewRequest, url: string, timeoutMs = 15_000): Promise<HtmlPreviewResult> {
	const window = new BrowserWindow({ show: false, width: request.width, height: 600, useContentSize: true, paintWhenInitiallyHidden: true, webPreferences: { offscreen: true, partition: previewPartition, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true, spellcheck: false } });
	const consoleMessages: HtmlPreviewResult["consoleMessages"] = [];
	try {
		const contents = window.webContents;
		contents.setWindowOpenHandler(() => ({ action: "deny" }));
		contents.on("will-navigate", event => event.preventDefault());
		contents.on("console-message", event => { if (consoleMessages.length < htmlRenderLimits.consoleMessages) consoleMessages.push({ level: levelOf((event as unknown as { level: unknown }).level), text: String((event as unknown as { message: unknown }).message ?? "").slice(0, 1000) }); });
		const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`The page did not finish loading within ${timeoutMs / 1000} seconds.`)), timeoutMs));
		await Promise.race([contents.loadURL(url), timeout]);
		// Fonts, images and a chart's first animation frame.
		await Promise.race([contents.executeJavaScript("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 300))))"), timeout]);
		const measure = () => contents.executeJavaScript("Math.ceil(document.documentElement.getBoundingClientRect().height)") as Promise<number>;
		const contentHeight = Math.max(1, Number(await measure()) || 1), capturedHeight = Math.min(contentHeight, htmlRenderLimits.maxHeight * 2);
		window.setContentSize(request.width, capturedHeight);
		await new Promise(resolve => setTimeout(resolve, 150));
		const png = (await contents.capturePage()).toPNG();
		const size = png.length ? pngPixels(png) : { width: request.width, height: capturedHeight };
		return { width: request.width, contentHeight, capturedHeight: size.height, consoleMessages, ...(png.length ? { image: { mimeType: "image/png" as const, data: png.toString("base64") } } : {}) };
	} finally { window.destroy(); }
}
