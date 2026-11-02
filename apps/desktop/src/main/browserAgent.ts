import { randomUUID } from "node:crypto";
import type { BrowserWindow, WebContents } from "electron";
import { browserTabLimit } from "../shared/browser";
import { browserAgentDefaults, type BrowserAgentElement, type BrowserAgentPage, type BrowserAgentTab, type BrowserAgentTools } from "../shared/browserAgent";
import { overlayCursorScript } from "./browserOverlay";
import { overlayWorld, type BrowserHost } from "./browserHost";
import { pngPixels } from "./capturePixels";
import { javascriptLiteral } from "./javascriptLiteral";

/** Page scripts run in the overlay's isolated world: the page's own scripts can neither see nor replace them. */
const helpers = `const __visible = element => { const rect = element.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return false; const style = getComputedStyle(element); return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0"; };
const __unique = selector => { try { return document.querySelectorAll(selector).length === 1; } catch { return false; } };
const __selector = element => {
	if (element.id && __unique("#" + CSS.escape(element.id))) return "#" + CSS.escape(element.id);
	const parts = [];
	for (let node = element; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
		if (node !== element && node.id && __unique("#" + CSS.escape(node.id))) { parts.unshift("#" + CSS.escape(node.id)); break; }
		let part = node.tagName.toLowerCase();
		const parent = node.parentElement;
		if (parent) { const same = Array.from(parent.children).filter(child => child.tagName === node.tagName); if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")"; }
		parts.unshift(part);
	}
	return parts.join(" > ");
};
const __settle = () => new Promise(resolve => { let done = false; const finish = () => { if (!done) { done = true; resolve(); } }; requestAnimationFrame(() => requestAnimationFrame(finish)); setTimeout(finish, 120); });
const __find = selector => {
	let matches; try { matches = document.querySelectorAll(selector); } catch { return { error: "That selector is not valid CSS." }; }
	if (!matches.length) return { error: "No element matches that selector. Call browser_snapshot for the page's current elements." };
	if (matches.length > 1) return { error: matches.length + " elements match that selector. Use one that matches only the element you mean; browser_snapshot lists unique selectors." };
	return { element: matches[0] };
};`;

export function snapshotScript(maxCharacters: number, maxElements: number) {
	return `(() => { ${helpers}
	const roles = { A: "link", BUTTON: "button", SELECT: "combobox", TEXTAREA: "textbox", SUMMARY: "button" };
	const inputRoles = { checkbox: "checkbox", radio: "radio", button: "button", submit: "button", reset: "button", range: "slider", search: "searchbox" };
	const roleOf = element => element.getAttribute("role") || (element.tagName === "INPUT" ? inputRoles[element.type] || "textbox" : roles[element.tagName]) || (element.isContentEditable ? "textbox" : "generic");
	const clean = value => String(value || "").trim().replace(/\\s+/g, " ").slice(0, 200);
	const nameOf = element => clean(element.getAttribute("aria-label") || (element.labels && element.labels[0] && element.labels[0].innerText) || element.getAttribute("placeholder") || element.getAttribute("title") || element.getAttribute("alt") || element.innerText || (element.type === "submit" || element.type === "button" ? element.value : ""));
	const query = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=textbox],[role=combobox],[contenteditable=""],[contenteditable=true]';
	const elements = [];
	for (const element of document.querySelectorAll(query)) {
		if (elements.length >= ${maxElements}) break;
		if (!__visible(element)) continue;
		const item = { selector: __selector(element), role: roleOf(element), name: nameOf(element), tag: element.tagName.toLowerCase() };
		// Passwords and hidden values never leave the page.
		if ((element.tagName === "INPUT" && element.type !== "password") || element.tagName === "TEXTAREA" || element.tagName === "SELECT") { if (element.type === "checkbox" || element.type === "radio") item.value = element.checked ? "checked" : "unchecked"; else if (element.value) item.value = clean(element.value); }
		if (element.disabled) item.disabled = true;
		elements.push(item);
	}
	const text = String((document.body || document.documentElement).innerText || "").replace(/[ \\t]+\\n/g, "\\n").replace(/\\n{3,}/g, "\\n\\n").trim();
	return { text: text.slice(0, ${maxCharacters}), truncated: text.length > ${maxCharacters}, elements };
})()`;
}
/** Scrolls the one element a selector matches into view and returns its centre in page CSS pixels. */
export function targetScript(selector: string) {
	return `(async () => { ${helpers}
	const found = __find(${javascriptLiteral(selector)}); if (found.error) return found;
	const element = found.element;
	element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
	await __settle();
	const rect = element.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) return { error: "That element is not visible." };
	if (element.disabled) return { error: "That element is disabled." };
	const editable = element.isContentEditable || element.tagName === "TEXTAREA" || (element.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "reset", "file", "image", "range", "color"].includes(element.type));
	return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), editable };
})()`;
}
/** Focuses the element and selects its contents, so typed text replaces them. */
export const selectContentsScript = (selector: string) => `(() => { ${helpers}
	const found = __find(${javascriptLiteral(selector)}); if (found.error) return false;
	const element = found.element; element.focus();
	if (typeof element.select === "function") element.select();
	else { const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }
	return true;
})()`;
/** Without the DevTools protocol: clicks or types through the DOM. */
const domClickScript = (selector: string) => `(() => { ${helpers} const found = __find(${javascriptLiteral(selector)}); if (found.error) return found.error; found.element.focus(); found.element.click(); return ""; })()`;
const domTypeScript = (selector: string, text: string, clear: boolean) => `(() => { ${helpers}
	const found = __find(${javascriptLiteral(selector)}); if (found.error) return found.error;
	const element = found.element, text = ${javascriptLiteral(text)}; element.focus();
	if (element.isContentEditable) { if (${clear}) element.textContent = ""; document.execCommand("insertText", false, text); return ""; }
	const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
	Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, (${clear} ? "" : element.value) + text);
	element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
	return "";
})()`;

const page = (tabId: string, contents: WebContents): BrowserAgentPage => ({ tabId, url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading() });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Waits for a page to stop loading, up to the timeout; it may keep loading after. */
async function settle(contents: WebContents, timeoutMs: number, startWithin = 0) {
	if (startWithin && !contents.isLoading()) {
		const started = await new Promise<boolean>(resolve => { const timer = setTimeout(() => { contents.off("did-start-loading", start); resolve(false); }, startWithin); const start = () => { clearTimeout(timer); resolve(true); }; contents.once("did-start-loading", start); });
		if (!started) return;
	}
	if (!contents.isLoading() || timeoutMs <= 0) return;
	await new Promise<void>(resolve => {
		const done = () => { clearTimeout(timer); contents.off("did-stop-loading", done); contents.off("destroyed", done); resolve(); };
		const timer = setTimeout(done, timeoutMs);
		contents.once("did-stop-loading", done); contents.once("destroyed", done);
	});
}

/**
 * T3 Code's browser tools for agents, confined to one chat: they open, read and drive only the chat's own browser tabs
 * (ids that are the chat id, or start with it and a colon) in the person's window, and only HTTP and HTTPS pages.
 */
export class BrowserAgent {
	private lastTab = new Map<string, string>();
	constructor(private readonly host: BrowserHost, private readonly window: () => BrowserWindow | undefined) {}
	forChat(chatId: string): BrowserAgentTools {
		return {
			tabs: async () => this.tabs(chatId),
			open: async request => {
				const owner = this.owner();
				const tabId = request.tabId ?? (request.newTab ? undefined : this.current(owner, chatId)) ?? `${chatId}:${randomUUID()}`;
				const pages = this.host.chatPages(owner, chatId);
				if (!pages.some(item => item.id === tabId) && pages.length >= browserTabLimit) throw new Error("This chat has too many browser tabs open. Reuse one with tabId, or ask the user to close some.");
				const contents = this.host.chatPage(owner, chatId, tabId, true)!;
				this.lastTab.set(chatId, tabId);
				return this.host.agentAction(owner, tabId, async () => {
					this.host.command(owner, { id: tabId, type: "navigate", url: request.url });
					this.host.announce(owner, chatId, tabId, request.url);
					await settle(contents, request.timeoutMs, 1000);
					return page(tabId, contents);
				});
			},
			snapshot: async request => {
				const { tabId, contents } = this.target(chatId, request.tabId);
				const result = await contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: snapshotScript(request.maxCharacters, browserAgentDefaults.snapshotElements) }]) as { text: string; truncated: boolean; elements: BrowserAgentElement[] };
				return { ...page(tabId, contents), text: String(result.text ?? ""), truncated: Boolean(result.truncated), elements: Array.isArray(result.elements) ? result.elements : [] };
			},
			click: async request => {
				const { owner, tabId, contents } = this.target(chatId, request.tabId);
				return this.host.agentAction(owner, tabId, async () => {
					const point = await this.point(contents, request.selector);
					await this.cursor(owner, tabId, contents, point, "move");
					await sleep(120);
					if (!await this.mouseClick(contents, point)) { const error = await contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: domClickScript(request.selector) }], true) as string; if (error) throw new Error(error); }
					await this.cursor(owner, tabId, contents, point, "click");
					await settle(contents, request.timeoutMs, 300);
					return page(tabId, contents);
				});
			},
			type: async request => {
				const { owner, tabId, contents } = this.target(chatId, request.tabId);
				return this.host.agentAction(owner, tabId, async () => {
					const point = await this.point(contents, request.selector);
					if (!point.editable) throw new Error("That element does not take text. Use browser_click for buttons, links, checkboxes and menus.");
					await this.cursor(owner, tabId, contents, point, "move");
					await sleep(120);
					const trusted = await this.mouseClick(contents, point);
					await this.cursor(owner, tabId, contents, point, "click");
					if (trusted) {
						if (request.clear) await contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: selectContentsScript(request.selector) }]);
						if (request.text) await contents.debugger.sendCommand("Input.insertText", { text: request.text });
					} else {
						const error = await contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: domTypeScript(request.selector, request.text, request.clear) }], true) as string;
						if (error) throw new Error(error);
					}
					if (request.submit) await this.pressEnter(contents);
					await settle(contents, request.timeoutMs, request.submit ? 500 : 0);
					return page(tabId, contents);
				});
			},
			screenshot: async request => {
				const { tabId, contents } = this.target(chatId, request.tabId);
				const image = await contents.capturePage();
				if (image.isEmpty()) throw new Error("The page has nothing to capture yet. Show its browser tab and try again.");
				let png = image.toPNG();
				// From Electron 46 resize() takes DIPs and keeps the capture’s scale, so both use it to cap the PNG at 1280 pixels on HiDPI screens.
				const scale = image.getScaleFactors()[0] ?? 1;
				if (pngPixels(png).width > 1280) png = image.resize({ width: Math.floor(1280 / scale), quality: "good" }).toPNG({ scaleFactor: scale });
				const size = pngPixels(png);
				return { ...page(tabId, contents), width: size.width, height: size.height, image: { mimeType: "image/png", data: png.toString("base64") } };
			},
		};
	}
	private owner() {
		const owner = this.window();
		if (!owner || owner.isDestroyed()) throw new Error("Open the Phaseo window to use the browser.");
		return owner;
	}
	private tabs(chatId: string): BrowserAgentTab[] {
		const owner = this.owner();
		return this.host.chatPages(owner, chatId).map(({ id, contents, visible }) => ({ ...page(id, contents), visible }));
	}
	/** The tab this agent used last, else the one the person is looking at, else the chat's first open page. */
	private current(owner: BrowserWindow, chatId: string) {
		const pages = this.host.chatPages(owner, chatId), last = this.lastTab.get(chatId);
		return pages.find(item => item.id === last)?.id ?? pages.find(item => item.visible)?.id ?? pages.find(item => item.contents.getURL())?.id;
	}
	private target(chatId: string, requested?: string) {
		const owner = this.owner();
		const tabId = requested ?? this.current(owner, chatId);
		if (!tabId) throw new Error("This chat has no open page. Open one with browser_open first.");
		const contents = this.host.chatPage(owner, chatId, tabId, false);
		if (!contents?.getURL()) throw new Error("That browser tab has no page open. Open one with browser_open first.");
		this.lastTab.set(chatId, tabId);
		return { owner, tabId, contents };
	}
	private async point(contents: WebContents, selector: string) {
		const result = await contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: targetScript(selector) }]) as { error?: string; x?: number; y?: number; editable?: boolean } | null;
		if (!result || result.error) throw new Error(result?.error ?? "The page did not answer.");
		return { x: Number(result.x) || 0, y: Number(result.y) || 0, editable: Boolean(result.editable) };
	}
	private async cursor(owner: BrowserWindow, tabId: string, contents: WebContents, point: { x: number; y: number }, phase: "move" | "click") {
		await contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: overlayCursorScript(point.x, point.y, phase, this.host.chatZoom(owner, tabId)) }]).catch(() => undefined);
	}
	/** A trusted click through the DevTools protocol, in CSS pixels; false when the protocol is unavailable. */
	private async mouseClick(contents: WebContents, point: { x: number; y: number }) {
		const debug = contents.debugger;
		try {
			if (!debug.isAttached()) debug.attach("1.3");
			await debug.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
			await debug.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
			await debug.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
			return true;
		} catch { return false; }
	}
	private async pressEnter(contents: WebContents) {
		const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
		try {
			if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
			await contents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", ...key });
			await contents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", ...key });
		} catch { contents.sendInputEvent({ type: "keyDown", keyCode: "Enter" }); contents.sendInputEvent({ type: "char", keyCode: "\r" }); contents.sendInputEvent({ type: "keyUp", keyCode: "Enter" }); }
	}
}
