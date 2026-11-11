import type { MouseEvent } from "react";
import { parsePullRequestReference } from "../../../shared/pullRequestView";
import { openPullRequest } from "./events";
import { openWebLink } from "../../lib/openLink";

let preference: { at: number; value: Promise<boolean> } | undefined;
/** Settings → "Open pull requests in Phaseo" (on by default), read at most every few seconds. */
export function openPullRequestsInApp(): Promise<boolean> {
	const api = window.phaseoDesktop?.workspace;
	if (!api) return Promise.resolve(false);
	if (!preference || Date.now() - preference.at > 5000) preference = { at: Date.now(), value: api.preferences().then(value => value.preferences.openPullRequestsInApp !== false, () => true) };
	return preference.value;
}

/** Whether a click asks for the web page rather than the pane: Ctrl or Cmd held, or the middle button. */
export const wantsBrowser = (event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "button">) => event.ctrlKey || event.metaKey || event.button === 1;

/**
 * A pull request link. One in the chat's own repository opens in the pane when "Open pull requests in Phaseo" is on;
 * otherwise, and with Ctrl or Cmd held or the middle button, it is its GitHub page, which opens like any web link:
 * where Settings → Browser → Open links in says. A pull request in another repository has no pane, so it is a plain
 * web link and Ctrl flips where it opens, as it does for links in messages.
 * `repository` is the chat project's owner/repo, or a pull request number already known to belong to it.
 */
export function openPullRequestLink(event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "button" | "preventDefault">, url: string, repository: string | number | null | undefined) {
	event.preventDefault();
	const reference = parsePullRequestReference(url);
	const number = typeof repository === "number" ? repository : reference?.repository && repository && reference.repository.toLowerCase() === repository.toLowerCase() ? reference.number : undefined;
	if (number === undefined) { void openWebLink(url, event).catch(() => undefined); return; }
	const web = () => void openWebLink(url).catch(() => undefined);
	if (wantsBrowser(event)) { web(); return; }
	void openPullRequestsInApp().then(inApp => { if (inApp) openPullRequest({ number }); else web(); });
}
