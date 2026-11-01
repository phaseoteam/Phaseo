import { browserColorScheme, browserUrl, browserViewport, browserViewportPresets, type BrowserColorScheme, type BrowserRecording, type BrowserViewport } from "./browser";

/** A chat's browser tab as its agent sees it. */
export type BrowserAgentTab = { tabId: string; url: string; title: string; loading: boolean; visible: boolean };
/** An alert, confirm, prompt or leave-page question waiting on the page; the page is paused until browser_dialog answers it. */
export type BrowserAgentDialog = { type: string; message: string; defaultPrompt?: string };
export type BrowserAgentPage = { tabId: string; url: string; title: string; loading: boolean; dialog?: BrowserAgentDialog };
/** An element an agent can act on, with a selector that matches only it. */
export type BrowserAgentElement = { selector: string; role: string; name: string; tag: string; value?: string; disabled?: boolean };
export type BrowserAgentSnapshot = BrowserAgentPage & { text: string; truncated: boolean; elements: BrowserAgentElement[] };
export type BrowserAgentScreenshot = BrowserAgentPage & { width: number; height: number; image: { mimeType: "image/png" | "image/jpeg"; data: string } };
export type BrowserAgentOpen = { url: string; tabId?: string; newTab?: boolean; timeoutMs: number };
export type BrowserAgentTarget = { tabId?: string; selector: string; timeoutMs: number };
export type BrowserAgentType = BrowserAgentTarget & { text: string; clear: boolean; submit: boolean };
export const browserAgentActions = ["hover", "select", "press", "scroll", "upload", "drag"] as const;
export const browserAgentModifiers = ["Alt", "Control", "Meta", "Shift"] as const;
export type BrowserAgentAct = { tabId?: string; action: typeof browserAgentActions[number]; selector?: string; target?: string; values?: string[]; key?: string; modifiers?: typeof browserAgentModifiers[number][]; deltaX?: number; deltaY?: number; paths?: string[]; timeoutMs: number };
export type BrowserAgentWait = { tabId?: string; selector?: string; state: "visible" | "hidden"; text?: string; url?: string; timeoutMs: number };
export type BrowserAgentEvaluate = { tabId?: string; expression: string; timeoutMs: number };
export type BrowserAgentDialogAnswer = { tabId?: string; action: "accept" | "dismiss"; promptText?: string };
/** The browser tools of one chat. Every tab id belongs to that chat; the host refuses any other. */
export type BrowserAgentTools = {
	tabs: () => Promise<BrowserAgentTab[]>;
	open: (request: BrowserAgentOpen) => Promise<BrowserAgentPage>;
	snapshot: (request: { tabId?: string; maxCharacters: number }) => Promise<BrowserAgentSnapshot>;
	click: (request: BrowserAgentTarget) => Promise<BrowserAgentPage>;
	type: (request: BrowserAgentType) => Promise<BrowserAgentPage>;
	screenshot: (request: { tabId?: string }) => Promise<BrowserAgentScreenshot>;
	act: (request: BrowserAgentAct) => Promise<BrowserAgentPage & { selected?: string[] }>;
	evaluate: (request: BrowserAgentEvaluate) => Promise<BrowserAgentPage & { value: unknown; truncated?: boolean }>;
	waitFor: (request: BrowserAgentWait) => Promise<BrowserAgentPage>;
	resize: (request: { tabId?: string; viewport: BrowserViewport }) => Promise<BrowserAgentPage & { viewport: BrowserViewport }>;
	appearance: (request: { tabId?: string; colorScheme: BrowserColorScheme }) => Promise<BrowserAgentPage & { colorScheme: BrowserColorScheme }>;
	dialog: (request: BrowserAgentDialogAnswer) => Promise<BrowserAgentPage>;
	recordingStart: (request: { tabId?: string }) => Promise<BrowserAgentPage & { recording: true }>;
	recordingStop: (request: { tabId?: string }) => Promise<BrowserAgentPage & { recording: BrowserRecording }>;
	close: (request: { tabId: string }) => Promise<{ tabId: string; closed: true }>;
};

export const browserAgentDefaults = { timeoutMs: 15_000, maxTimeoutMs: 60_000, snapshotCharacters: 20_000, maxSnapshotCharacters: 100_000, snapshotElements: 300, textLength: 10_000, selectorLength: 1_000, expressionLength: 100_000, evaluateBytes: 64 * 1024, scrollDelta: 100_000, uploadFiles: 20 } as const;
/** Keys browser_act can press besides a single character, as KeyboardEvent.key names them. */
export const browserAgentKeys = ["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Space", "Insert", ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)] as const;

function object(value: unknown): Record<string, unknown> {
	if (value === undefined) return {};
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected browser tool arguments.");
	return value as Record<string, unknown>;
}
function flag(input: Record<string, unknown>, key: string) { if (input[key] !== undefined && typeof input[key] !== "boolean") throw new Error(`Invalid ${key}.`); return input[key] === true; }
function timeout(value: unknown) {
	if (value === undefined) return browserAgentDefaults.timeoutMs;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > browserAgentDefaults.maxTimeoutMs) throw new Error(`Invalid timeoutMs; use 0 to ${browserAgentDefaults.maxTimeoutMs} milliseconds.`);
	return value;
}
/** Control characters (newlines, NUL, DEL) never belong in a tab id or a selector. */
const hasControl = (value: string) => [...value].some(character => { const code = character.charCodeAt(0); return code < 32 || code === 127; });
function tabId(value: unknown) {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !value || value.length > 200 || hasControl(value)) throw new Error("Invalid tabId.");
	return value;
}
/** A CSS selector from an agent: plain text of bounded length. The page parses it; a malformed one fails there. */
export function browserAgentSelector(value: unknown): string {
	if (typeof value !== "string") throw new Error("Invalid selector.");
	const selector = value.trim();
	if (!selector || selector.length > browserAgentDefaults.selectorLength || hasControl(selector)) throw new Error("Invalid selector.");
	return selector;
}
/** An address an agent may open: HTTP or HTTPS only, never files, app pages or embedded credentials. */
export function browserAgentUrl(value: unknown): string {
	if (typeof value !== "string" || !value.trim()) throw new Error("Invalid url.");
	try { return browserUrl(value.trim()); } catch (error) { throw new Error(`Invalid url. ${error instanceof Error ? error.message : ""}`.trim(), { cause: error }); }
}
/** True when a tab id names one of this chat's browser tabs: the chat id itself, or the chat id, a colon and more. */
export const browserTabOfChat = (id: string, chatId: string) => Boolean(chatId) && (id === chatId || id.startsWith(chatId + ":"));

export function validateBrowserOpen(value: unknown): BrowserAgentOpen {
	const input = object(value);
	const id = tabId(input.tabId), newTab = flag(input, "newTab");
	if (id && newTab) throw new Error("Pass tabId or newTab, not both.");
	return { url: browserAgentUrl(input.url), timeoutMs: timeout(input.timeoutMs), ...(id ? { tabId: id } : {}), ...(newTab ? { newTab } : {}) };
}
export function validateBrowserSnapshot(value: unknown): { tabId?: string; maxCharacters: number } {
	const input = object(value), id = tabId(input.tabId);
	const max = input.maxCharacters;
	if (max !== undefined && (typeof max !== "number" || !Number.isInteger(max) || max < 100 || max > browserAgentDefaults.maxSnapshotCharacters)) throw new Error(`Invalid maxCharacters; use 100 to ${browserAgentDefaults.maxSnapshotCharacters}.`);
	return { maxCharacters: (max as number | undefined) ?? browserAgentDefaults.snapshotCharacters, ...(id ? { tabId: id } : {}) };
}
export function validateBrowserTarget(value: unknown): BrowserAgentTarget {
	const input = object(value), id = tabId(input.tabId);
	return { selector: browserAgentSelector(input.selector), timeoutMs: timeout(input.timeoutMs), ...(id ? { tabId: id } : {}) };
}
export function validateBrowserType(value: unknown): BrowserAgentType {
	const input = object(value);
	if (typeof input.text !== "string" || input.text.length > browserAgentDefaults.textLength) throw new Error(`Invalid text; send up to ${browserAgentDefaults.textLength} characters.`);
	return { ...validateBrowserTarget(input), text: input.text, clear: flag(input, "clear"), submit: flag(input, "submit") };
}
export function validateBrowserTab(value: unknown): { tabId?: string } { const id = tabId(object(value).tabId); return id ? { tabId: id } : {}; }
const optionalSelector = (value: unknown) => value === undefined ? undefined : browserAgentSelector(value);
const strings = (value: unknown, key: string, maximum: number, length: number) => {
	if (!Array.isArray(value) || value.length > maximum || value.some(entry => typeof entry !== "string" || !entry || entry.length > length || hasControl(entry))) throw new Error(`Invalid ${key}.`);
	return value as string[];
};
const delta = (value: unknown, key: string) => {
	if (value === undefined) return 0;
	if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > browserAgentDefaults.scrollDelta) throw new Error(`Invalid ${key}.`);
	return Math.round(value);
};
export function validateBrowserAct(value: unknown): BrowserAgentAct {
	const input = object(value), id = tabId(input.tabId), action = input.action as BrowserAgentAct["action"];
	if (!browserAgentActions.includes(action)) throw new Error(`Invalid action; use ${browserAgentActions.join(", ")}.`);
	const selector = optionalSelector(input.selector), base = { action, timeoutMs: timeout(input.timeoutMs), ...(id ? { tabId: id } : {}), ...(selector ? { selector } : {}) };
	switch (action) {
		case "hover": if (!selector) throw new Error("hover needs selector."); return base;
		case "select": if (!selector) throw new Error("select needs selector."); return { ...base, values: strings(input.values, "values", 100, 1000) };
		case "drag": { if (!selector) throw new Error("drag needs selector, the element to drag."); return { ...base, target: browserAgentSelector(input.target) }; }
		case "scroll": { const deltaX = delta(input.deltaX, "deltaX"), deltaY = delta(input.deltaY, "deltaY"); if (!deltaX && !deltaY) throw new Error("scroll needs deltaX or deltaY."); return { ...base, deltaX, deltaY }; }
		case "upload": {
			if (!selector) throw new Error("upload needs selector, an <input type=file>.");
			const paths = strings(input.paths, "paths", browserAgentDefaults.uploadFiles, 4096);
			if (!paths.length) throw new Error("upload needs paths.");
			return { ...base, paths };
		}
		case "press": {
			const key = input.key;
			if (typeof key !== "string" || !(([...browserAgentKeys] as string[]).includes(key) || [...key].length === 1) || hasControl(key)) throw new Error(`Invalid key; use one character or one of ${browserAgentKeys.slice(0, 15).join(", ")}, F1 to F12.`);
			const modifiers = input.modifiers === undefined ? [] : strings(input.modifiers, "modifiers", 4, 10);
			if (modifiers.some(modifier => !(browserAgentModifiers as readonly string[]).includes(modifier))) throw new Error(`Invalid modifiers; use ${browserAgentModifiers.join(", ")}.`);
			return { ...base, key, ...(modifiers.length ? { modifiers: modifiers as BrowserAgentAct["modifiers"] } : {}) };
		}
	}
}
export function validateBrowserWait(value: unknown): BrowserAgentWait {
	const input = object(value), id = tabId(input.tabId), selector = optionalSelector(input.selector);
	if (input.state !== undefined && input.state !== "visible" && input.state !== "hidden") throw new Error("Invalid state; use visible or hidden.");
	const text = input.text === undefined ? undefined : strings([input.text], "text", 1, 1000)[0], url = input.url === undefined ? undefined : strings([input.url], "url", 1, 2048)[0];
	if (!selector && !text && !url) throw new Error("Pass selector, text or url to wait for.");
	return { state: input.state === "hidden" ? "hidden" : "visible", timeoutMs: timeout(input.timeoutMs), ...(id ? { tabId: id } : {}), ...(selector ? { selector } : {}), ...(text ? { text } : {}), ...(url ? { url } : {}) };
}
export function validateBrowserEvaluate(value: unknown): BrowserAgentEvaluate {
	const input = object(value), id = tabId(input.tabId);
	if (typeof input.expression !== "string" || !input.expression.trim() || input.expression.length > browserAgentDefaults.expressionLength) throw new Error(`Invalid expression; send up to ${browserAgentDefaults.expressionLength} characters.`);
	return { expression: input.expression, timeoutMs: timeout(input.timeoutMs), ...(id ? { tabId: id } : {}) };
}
export function validateBrowserResize(value: unknown): { tabId?: string; viewport: BrowserViewport } {
	const input = object(value), id = tabId(input.tabId);
	if (input.mode === "preset") {
		const preset = browserViewportPresets.find(item => item.id === input.preset), landscape = input.orientation === "landscape";
		if (!preset) throw new Error(`Invalid preset; use one of ${browserViewportPresets.map(item => item.id).join(", ")}.`);
		if (input.orientation !== undefined && input.orientation !== "portrait" && !landscape) throw new Error("Invalid orientation; use portrait or landscape.");
		return { viewport: { mode: "device", width: landscape ? preset.height : preset.width, height: landscape ? preset.width : preset.height, preset: preset.id }, ...(id ? { tabId: id } : {}) };
	}
	if (input.mode === "freeform") return { viewport: browserViewport({ mode: "device", width: input.width, height: input.height }), ...(id ? { tabId: id } : {}) };
	if (input.mode === "fill") return { viewport: { mode: "fill" }, ...(id ? { tabId: id } : {}) };
	throw new Error("Invalid mode; use fill, freeform or preset.");
}
export function validateBrowserAppearance(value: unknown): { tabId?: string; colorScheme: BrowserColorScheme } {
	const input = object(value), id = tabId(input.tabId);
	return { colorScheme: browserColorScheme(input.colorScheme), ...(id ? { tabId: id } : {}) };
}
export function validateBrowserDialog(value: unknown): BrowserAgentDialogAnswer {
	const input = object(value), id = tabId(input.tabId);
	if (input.action !== "accept" && input.action !== "dismiss") throw new Error("Invalid action; use accept or dismiss.");
	if (input.promptText !== undefined && (typeof input.promptText !== "string" || input.promptText.length > browserAgentDefaults.textLength)) throw new Error("Invalid promptText.");
	return { action: input.action, ...(id ? { tabId: id } : {}), ...(typeof input.promptText === "string" ? { promptText: input.promptText } : {}) };
}
export function validateBrowserClose(value: unknown): { tabId: string } { const id = tabId(object(value).tabId); if (!id) throw new Error("Pass the tabId to close."); return { tabId: id }; }

/** How long an agent keeps a page after its last action before the page counts as idle again. */
export const browserAgentIdleMs = 10_000;
/** How long a person's input marks a page as theirs, as in T3 Code. */
export const browserHumanInputMs = 750;
