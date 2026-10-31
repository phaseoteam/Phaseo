import { randomUUID } from "node:crypto";
import type { BrowserWindow, WebContents } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { browserTabLimit, type BrowserRecording } from "../shared/browser";
import { browserAgentDefaults, type BrowserAgentDialog, type BrowserAgentElement, type BrowserAgentPage, type BrowserAgentTab, type BrowserAgentTools } from "../shared/browserAgent";
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

/** Sets a native <select>'s options by value or visible label, as a person choosing them would. */
export const selectScript = (selector: string, values: string[]) => `(() => { ${helpers}
	const found = __find(${javascriptLiteral(selector)}); if (found.error) return found;
	const element = found.element, wanted = ${javascriptLiteral(values)};
	if (element.tagName !== "SELECT") return { error: "That element is not a native <select>. Click a custom dropdown open, then click its option." };
	if (!element.multiple && wanted.length !== 1) return { error: "This <select> takes exactly one value." };
	const options = Array.from(element.options), chosen = [];
	for (const value of wanted) { const option = options.find(item => item.value === value) || options.find(item => item.label.trim() === value.trim()); if (!option) return { error: "No option has the value or label " + JSON.stringify(value) + "." }; chosen.push(option); }
	for (const option of options) option.selected = chosen.includes(option);
	element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
	return { selected: chosen.map(option => option.value) };
})()`;
/** Whether the page shows (or no longer shows) an element, and contains some text. */
export const waitScript = (selector: string | undefined, state: "visible" | "hidden", text: string | undefined) => `(() => { ${helpers}
	const selector = ${javascriptLiteral(selector ?? null)}, text = ${javascriptLiteral(text ?? null)};
	if (selector !== null) { let shown = false; try { shown = Array.from(document.querySelectorAll(selector)).some(__visible); } catch { return { error: "That selector is not valid CSS." }; } if (shown !== (${javascriptLiteral(state)} === "visible")) return { selector: false }; }
	if (text !== null && !String((document.body || document.documentElement).innerText || "").includes(text)) return { text: false };
	return { done: true };
})()`;
const focusScript = (selector: string) => `(() => { ${helpers} const found = __find(${javascriptLiteral(selector)}); if (found.error) return found.error; found.element.focus(); return ""; })()`;
const viewportCentreScript = "({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) })";
const scrollScript = (selector: string | undefined, deltaX: number, deltaY: number) => `(() => { ${helpers}
	const selector = ${javascriptLiteral(selector ?? null)}; let target = document.scrollingElement || document.documentElement;
	if (selector !== null) { const found = __find(selector); if (found.error) return found.error; target = found.element; }
	target.scrollBy(${deltaX}, ${deltaY}); return "";
})()`;

/** DevTools key names and Windows key codes for the named keys browser_act presses. */
const namedKeys: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
	Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" }, Tab: { key: "Tab", code: "Tab", keyCode: 9 }, Escape: { key: "Escape", code: "Escape", keyCode: 27 },
	Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 }, Delete: { key: "Delete", code: "Delete", keyCode: 46 }, Insert: { key: "Insert", code: "Insert", keyCode: 45 },
	ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 }, ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 }, ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 }, ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
	Home: { key: "Home", code: "Home", keyCode: 36 }, End: { key: "End", code: "End", keyCode: 35 }, PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 }, PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
	Space: { key: " ", code: "Space", keyCode: 32, text: " " },
	...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`F${index + 1}`, { key: `F${index + 1}`, code: `F${index + 1}`, keyCode: 112 + index }])),
};
const modifierBits: Record<string, number> = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
/** The DevTools key events for one key press: a named key, or one character typed (or used as a shortcut with Control, Alt or Meta). */
export function keyPress(key: string, modifiers: string[] = []) {
	const bits = modifiers.reduce((sum, modifier) => sum | (modifierBits[modifier] ?? 0), 0), shortcut = (bits & 7) !== 0;
	const named = namedKeys[key], upper = key.toUpperCase();
	const base = named ?? { key, code: /^[a-z]$/i.test(key) ? `Key${upper}` : /^\d$/.test(key) ? `Digit${key}` : "", keyCode: /^[a-z\d]$/i.test(key) ? upper.charCodeAt(0) : 0, text: key };
	const event = { key: base.key, code: base.code, windowsVirtualKeyCode: base.keyCode, nativeVirtualKeyCode: base.keyCode, modifiers: bits };
	return [{ type: base.text && !shortcut ? "keyDown" : "rawKeyDown", ...event, ...(base.text && !shortcut ? { text: base.text, unmodifiedText: base.text } : {}) }, { type: "keyUp", ...event }];
}
/** A value from the page as JSON of at most `limit` bytes; anything longer comes back as truncated JSON text. */
export function boundedValue(value: unknown, limit: number): { value: unknown; truncated?: true } {
	const json = JSON.stringify(value === undefined ? null : value) ?? "null";
	if (Buffer.byteLength(json) <= limit) return { value: value === undefined ? null : value };
	return { value: Buffer.from(json).subarray(0, limit).toString("utf8").replace(/�$/, ""), truncated: true };
}

const dialogs = new WeakMap<WebContents, BrowserAgentDialog>();
const page = (tabId: string, contents: WebContents): BrowserAgentPage => { const dialog = dialogs.get(contents); return { tabId, url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(), ...(dialog ? { dialog } : {}) }; };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const listening = new WeakSet<WebContents>(), pageEvents = new WeakSet<WebContents>();
/** The page's DevTools protocol, with its dialogs tracked so a page paused on alert() can be seen and answered. */
async function devtools(contents: WebContents) {
	const debug = contents.debugger;
	if (!debug.isAttached()) debug.attach("1.3");
	if (!listening.has(contents)) {
		listening.add(contents);
		debug.on("message", (_event, method, params: { type?: string; message?: string; defaultPrompt?: string }) => {
			if (method === "Page.javascriptDialogOpening") dialogs.set(contents, { type: String(params.type ?? "alert"), message: String(params.message ?? "").slice(0, 2000), ...(params.type === "prompt" ? { defaultPrompt: String(params.defaultPrompt ?? "").slice(0, 2000) } : {}) });
			if (method === "Page.javascriptDialogClosed") dialogs.delete(contents);
		});
		debug.on("detach", () => { pageEvents.delete(contents); });
	}
	if (!pageEvents.has(contents)) { await debug.sendCommand("Page.enable"); pageEvents.add(contents); }
	return debug;
}
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

/** Starts or stops recording a tab through the person's window; stopping returns the saved file. */
export type BrowserAgentRecorder = (owner: BrowserWindow, request: { action: "start" | "stop"; tabId: string; url: string }) => Promise<BrowserRecording | undefined>;

/**
 * Browser tools for agents, confined to one chat: they open, read and drive only the chat's own browser tabs
 * (ids that are the chat id, or start with it and a colon) in the person's window, and only HTTP and HTTPS pages.
 */
export class BrowserAgent {
	private lastTab = new Map<string, string>();
	constructor(private readonly host: BrowserHost, private readonly window: () => BrowserWindow | undefined, private readonly recorder?: BrowserAgentRecorder) {}
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
				const { tabId, contents } = this.target(chatId, request.tabId, true);
				const image = await contents.capturePage();
				if (image.isEmpty()) throw new Error("The page has nothing to capture yet. Show its browser tab and try again.");
				let png = image.toPNG();
				// From Electron 46 resize() takes DIPs and keeps the capture’s scale, so both use it to cap the PNG at 1280 pixels on HiDPI screens.
				const scale = image.getScaleFactors()[0] ?? 1;
				if (pngPixels(png).width > 1280) png = image.resize({ width: Math.floor(1280 / scale), quality: "good" }).toPNG({ scaleFactor: scale });
				const size = pngPixels(png);
				return { ...page(tabId, contents), width: size.width, height: size.height, image: { mimeType: "image/png", data: png.toString("base64") } };
			},
			act: async request => {
				const { owner, tabId, contents } = this.target(chatId, request.tabId);
				return this.host.agentAction(owner, tabId, async () => {
					let selected: string[] | undefined;
					const debug = await devtools(contents);
					const mouse = (type: string, point: { x: number; y: number }, extra: Record<string, unknown> = {}) => debug.sendCommand("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, ...extra });
					switch (request.action) {
						case "hover": { const point = await this.point(contents, request.selector!); await this.cursor(owner, tabId, contents, point, "move"); await mouse("mouseMoved", point); break; }
						case "select": selected = (await this.element(contents, selectScript(request.selector!, request.values!)) as { selected: string[] }).selected; break;
						case "press": {
							if (request.selector) await this.element(contents, focusScript(request.selector));
							for (const event of keyPress(request.key!, request.modifiers)) await debug.sendCommand("Input.dispatchKeyEvent", event);
							break;
						}
						case "scroll": {
							const point = request.selector ? await this.point(contents, request.selector) : await contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: viewportCentreScript }]) as { x: number; y: number };
							try { await mouse("mouseWheel", point, { deltaX: request.deltaX ?? 0, deltaY: request.deltaY ?? 0 }); }
							catch { await this.element(contents, scrollScript(request.selector, request.deltaX ?? 0, request.deltaY ?? 0)); }
							break;
						}
						case "drag": {
							const from = await this.point(contents, request.selector!), to = await this.point(contents, request.target!);
							await this.cursor(owner, tabId, contents, from, "move");
							await mouse("mouseMoved", from); await mouse("mousePressed", from, { button: "left", buttons: 1, clickCount: 1 });
							for (let step = 1; step <= 10; step++) await mouse("mouseMoved", { x: Math.round(from.x + (to.x - from.x) * step / 10), y: Math.round(from.y + (to.y - from.y) * step / 10) }, { button: "left", buttons: 1 });
							await mouse("mouseReleased", to, { button: "left", buttons: 0, clickCount: 1 });
							await this.cursor(owner, tabId, contents, to, "click");
							break;
						}
						case "upload": {
							const files = await Promise.all(request.paths!.map(async file => { if (!path.isAbsolute(file)) throw new Error(`${file} is not an absolute path.`); const info = await stat(file).catch(() => undefined); if (!info?.isFile()) throw new Error(`${file} is not a file.`); return file; }));
							// The DevTools DOM is used rather than a page script so the page cannot swap the input it is given.
							const { root } = await debug.sendCommand("DOM.getDocument", { depth: 0 }) as { root: { nodeId: number } };
							const { nodeIds } = await debug.sendCommand("DOM.querySelectorAll", { nodeId: root.nodeId, selector: request.selector }) as { nodeIds: number[] };
							if (nodeIds.length !== 1) throw new Error(nodeIds.length ? `${nodeIds.length} elements match that selector. Use one that matches only the file input.` : "No element matches that selector.");
							await debug.sendCommand("DOM.setFileInputFiles", { nodeId: nodeIds[0], files });
							break;
						}
					}
					await settle(contents, request.timeoutMs, request.action === "press" ? 300 : 0);
					return { ...page(tabId, contents), ...(selected ? { selected } : {}) };
				});
			},
			evaluate: async request => {
				const { owner, tabId, contents } = this.target(chatId, request.tabId);
				return this.host.agentAction(owner, tabId, async () => {
					const debug = await devtools(contents);
					// replMode allows statements and top-level await; DevTools evaluation is not subject to the page's script policy.
					const evaluation = debug.sendCommand("Runtime.evaluate", { expression: request.expression, replMode: true, awaitPromise: true, returnByValue: true, userGesture: true, timeout: request.timeoutMs }) as Promise<{ result?: { value?: unknown; description?: string; type?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>;
					const result = await Promise.race([evaluation, sleep(request.timeoutMs + 1000).then(() => { throw new Error(`The expression did not finish within ${request.timeoutMs} ms.`); })]);
					if (result.exceptionDetails) throw new Error(`The page threw: ${(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "an error").slice(0, 2000)}`);
					const value = result.result && "value" in result.result ? result.result.value : result.result?.type === "undefined" ? null : result.result?.description ?? null;
					return { ...page(tabId, contents), ...boundedValue(value, browserAgentDefaults.evaluateBytes) };
				});
			},
			waitFor: async request => {
				const { tabId, contents } = this.target(chatId, request.tabId);
				await this.wait(contents, request);
				return page(tabId, contents);
			},
			resize: async request => {
				const { owner, tabId, contents } = this.target(chatId, request.tabId, true);
				this.host.agentCommand(owner, { id: tabId, type: "viewport", viewport: request.viewport });
				return { ...page(tabId, contents), viewport: request.viewport };
			},
			appearance: async request => {
				const { owner, tabId, contents } = this.target(chatId, request.tabId, true);
				this.host.agentCommand(owner, { id: tabId, type: "colorScheme", colorScheme: request.colorScheme });
				return { ...page(tabId, contents), colorScheme: request.colorScheme };
			},
			dialog: async request => {
				const { tabId, contents } = this.target(chatId, request.tabId, true);
				if (!dialogs.has(contents)) throw new Error("The page is not showing a dialog.");
				await (await devtools(contents)).sendCommand("Page.handleJavaScriptDialog", { accept: request.action === "accept", ...(request.promptText !== undefined ? { promptText: request.promptText } : {}) });
				dialogs.delete(contents);
				return page(tabId, contents);
			},
			recordingStart: async request => {
				const { tabId, contents } = await this.record(this.owner(), chatId, request.tabId, "start");
				return { ...page(tabId, contents), recording: true as const };
			},
			recordingStop: async request => {
				const { tabId, contents, recording } = await this.record(this.owner(), chatId, request.tabId, "stop");
				if (!recording) throw new Error("That tab is not being recorded. Start with browser_recording_start.");
				return { ...page(tabId, contents), recording };
			},
			close: async request => {
				const owner = this.owner();
				if (!this.host.chatPage(owner, chatId, request.tabId, false)) throw new Error("This chat has no browser tab with that id; see browser_tabs.");
				this.host.agentClose(owner, chatId, request.tabId);
				if (this.lastTab.get(chatId) === request.tabId) this.lastTab.delete(chatId);
				return { tabId: request.tabId, closed: true as const };
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
	/** A page waiting on a dialog runs no scripts, so everything but screenshots and browser_dialog waits for the dialog to be answered. */
	private target(chatId: string, requested?: string, allowDialog = false) {
		const owner = this.owner();
		const tabId = requested ?? this.current(owner, chatId);
		if (!tabId) throw new Error("This chat has no open page. Open one with browser_open first.");
		const contents = this.host.chatPage(owner, chatId, tabId, false);
		if (!contents?.getURL()) throw new Error("That browser tab has no page open. Open one with browser_open first.");
		this.lastTab.set(chatId, tabId);
		void devtools(contents).catch(() => undefined);
		const dialog = dialogs.get(contents);
		if (dialog && !allowDialog) throw new Error(`The page is showing a ${dialog.type} dialog ("${dialog.message.slice(0, 200)}"). Answer it with browser_dialog first.`);
		return { owner, tabId, contents };
	}
	private async element(contents: WebContents, script: string) {
		const result = await contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: script }], true) as unknown;
		if (typeof result === "string" && result) throw new Error(result);
		if (result && typeof result === "object" && "error" in result) throw new Error(String((result as { error: unknown }).error));
		return result;
	}
	private async wait(contents: WebContents, request: { selector?: string; state: "visible" | "hidden"; text?: string; url?: string; timeoutMs: number }) {
		const deadline = Date.now() + request.timeoutMs;
		let missing: string;
		for (;;) {
			missing = request.url && !contents.getURL().includes(request.url) ? "url" : "";
			if (!missing && (request.selector || request.text) && !contents.isDestroyed()) {
				const result = await this.element(contents, waitScript(request.selector, request.state, request.text)).catch(error => { if (error instanceof Error && error.message.includes("not valid CSS")) throw error; return { navigating: true }; }) as Record<string, unknown>;
				missing = result.selector === false ? "selector" : result.text === false ? "text" : result.navigating ? "page" : "";
			}
			if (!missing) return;
			if (Date.now() >= deadline || contents.isDestroyed()) break;
			await sleep(100);
		}
		const what = missing === "url" ? `the address to contain ${JSON.stringify(request.url)}` : missing === "selector" ? `${request.selector} to be ${request.state}` : missing === "text" ? `the text ${JSON.stringify(request.text)}` : "the page to load";
		throw new Error(`Timed out after ${request.timeoutMs} ms waiting for ${what}.`);
	}
	private async record(owner: BrowserWindow, chatId: string, requested: string | undefined, action: "start" | "stop") {
		const { tabId, contents } = this.target(chatId, requested, true);
		if (!this.recorder) throw new Error("Recording is unavailable.");
		const recording = await this.recorder(owner, { action, tabId, url: contents.getURL() });
		return { tabId, contents, recording };
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
