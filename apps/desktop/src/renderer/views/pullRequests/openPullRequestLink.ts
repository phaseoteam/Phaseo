import type { MouseEvent } from "react";
import { parsePullRequestReference } from "../../../shared/pullRequestView";
import { openPullRequest } from "./events";

let preference: { at: number; value: Promise<boolean> } | undefined;
/** Settings → "Open pull requests in Phaseo" (on by default), read at most every few seconds. */
export function openPullRequestsInApp(): Promise<boolean> {
	const api = window.phaseoDesktop?.workspace;
	if (!api) return Promise.resolve(false);
	if (!preference || Date.now() - preference.at > 5000) preference = { at: Date.now(), value: api.preferences().then(value => value.preferences.openPullRequestsInApp !== false, () => true) };
	return preference.value;
}

/** Whether a click asks for the browser rather than the app: Ctrl or Cmd held, or the middle button. */
export const wantsBrowser = (event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "button">) => event.ctrlKey || event.metaKey || event.button === 1;

/**
 * A pull request link: a pull request in the chat's own repository opens in the pane when "Open pull requests in
 * Phaseo" is on, and a modified or middle click, a pull request elsewhere, or the setting off goes to the browser.
 * `repository` is the chat project's owner/repo, or a pull request number already known to belong to it.
 */
export function openPullRequestLink(event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "button" | "preventDefault">, url: string, repository: string | number | null | undefined) {
	event.preventDefault();
	const reference = parsePullRequestReference(url);
	const number = typeof repository === "number" ? repository : reference?.repository && repository && reference.repository.toLowerCase() === repository.toLowerCase() ? reference.number : undefined;
	const browser = () => { void window.phaseoDesktop?.workspace.openLink(url); };
	if (number === undefined || wantsBrowser(event)) { browser(); return; }
	void openPullRequestsInApp().then(inApp => { if (inApp) openPullRequest({ number }); else browser(); });
}
