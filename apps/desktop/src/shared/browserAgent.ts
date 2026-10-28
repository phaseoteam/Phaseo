import { browserUrl } from "./browser";

/** A chat's browser tab as its agent sees it. */
export type BrowserAgentTab = { tabId: string; url: string; title: string; loading: boolean; visible: boolean };
export type BrowserAgentPage = { tabId: string; url: string; title: string; loading: boolean };
/** An element an agent can act on, with a selector that matches only it. */
export type BrowserAgentElement = { selector: string; role: string; name: string; tag: string; value?: string; disabled?: boolean };
export type BrowserAgentSnapshot = BrowserAgentPage & { text: string; truncated: boolean; elements: BrowserAgentElement[] };
export type BrowserAgentScreenshot = BrowserAgentPage & { width: number; height: number; image: { mimeType: "image/png" | "image/jpeg"; data: string } };
export type BrowserAgentOpen = { url: string; tabId?: string; newTab?: boolean; timeoutMs: number };
export type BrowserAgentTarget = { tabId?: string; selector: string; timeoutMs: number };
export type BrowserAgentType = BrowserAgentTarget & { text: string; clear: boolean; submit: boolean };
/** The browser tools of one chat. Every tab id belongs to that chat; the host refuses any other. */
export type BrowserAgentTools = {
	tabs: () => Promise<BrowserAgentTab[]>;
	open: (request: BrowserAgentOpen) => Promise<BrowserAgentPage>;
	snapshot: (request: { tabId?: string; maxCharacters: number }) => Promise<BrowserAgentSnapshot>;
	click: (request: BrowserAgentTarget) => Promise<BrowserAgentPage>;
	type: (request: BrowserAgentType) => Promise<BrowserAgentPage>;
	screenshot: (request: { tabId?: string }) => Promise<BrowserAgentScreenshot>;
};

export const browserAgentDefaults = { timeoutMs: 15_000, maxTimeoutMs: 60_000, snapshotCharacters: 20_000, maxSnapshotCharacters: 100_000, snapshotElements: 300, textLength: 10_000, selectorLength: 1_000 } as const;

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

/** How long an agent keeps a page after its last action before the page counts as idle again. */
export const browserAgentIdleMs = 10_000;
/** How long a person's input marks a page as theirs, as in T3 Code. */
export const browserHumanInputMs = 750;
