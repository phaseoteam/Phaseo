import { browserUrl, isLoopbackUrl, openableLocalUrl, previewPrinted } from "../../shared/browser";
import { createBrowserTab, listBrowserTabs, revealBrowserTab } from "./browserTabs";
import { terminalOutput, terminalSession } from "./terminalSessions";

/**
 * Opens an address in a chat's browser and shows it in the pane: a tab already on the same site is reused and
 * reloaded, as re-running a dev server should refresh its page rather than pile up tabs.
 */
export function openInChatBrowser(taskId: string, address: string) {
	const url = browserUrl(isLoopbackUrl(address) ? openableLocalUrl(address) : address);
	const origin = new URL(url).origin;
	const existing = listBrowserTabs(taskId).find(tab => { try { return Boolean(tab.url) && new URL(tab.url).origin === origin; } catch { return false; } });
	if (existing) {
		revealBrowserTab(taskId, existing.id);
		void window.phaseoDesktop?.browser({ type: "reload", id: existing.id }).catch(() => undefined);
		return existing.id;
	}
	const id = createBrowserTab(taskId, { url });
	revealBrowserTab(taskId, id);
	return id;
}

type Waiting = { cancelled: boolean };
const waiting = new Map<string, Waiting>();
export const previewWait = { interval: 1000, timeout: 120_000 };

/**
 * The auto-open preview, made to wait for the server: once the action's terminal prints a local address on the
 * preview URL's port, or the address answers, the page opens in the chat's browser. A preview URL that is not on
 * this computer opens straight away. If the terminal exits first nothing opens; after two
 * minutes the page opens anyway and shows whatever the address says.
 */
export function openPreviewWhenReady(input: { taskId: string; sessionId: string; url: string; command: string }, report: (error: string) => void = () => undefined) {
	const open = () => { try { openInChatBrowser(input.taskId, input.url); } catch (reason) { report(reason instanceof Error ? reason.message : String(reason)); } };
	if (!isLoopbackUrl(input.url)) { open(); return () => undefined; }
	// One wait per chat and address: running the action again replaces the earlier wait.
	const key = `${input.taskId}\n${input.url}`;
	const previous = waiting.get(key); if (previous) previous.cancelled = true;
	const state: Waiting = { cancelled: false };
	waiting.set(key, state);
	const started = Date.now();
	const finish = () => { state.cancelled = true; if (waiting.get(key) === state) waiting.delete(key); };
	const check = async () => {
		if (state.cancelled) return;
		const session = terminalSession(input.sessionId);
		if (session && session.status !== "running") { finish(); return; }
		let ready = previewPrinted(terminalOutput(input.sessionId), input.url, input.command);
		if (!ready) ready = await window.phaseoDesktop?.browserProbe(input.url).catch(() => false) ?? false;
		if (state.cancelled) return;
		if (ready || Date.now() - started >= previewWait.timeout) { finish(); open(); return; }
		window.setTimeout(() => void check(), previewWait.interval);
	};
	window.setTimeout(() => void check(), Math.min(previewWait.interval, 500));
	return finish;
}
