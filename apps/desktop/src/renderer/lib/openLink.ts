import { browserLinkTarget } from "../../shared/browserPreferences";
import { fetchWorkspacePreferences } from "./workspacePreferences";

/** The parts of a click that pick where a link opens. */
export type LinkClick = { ctrlKey?: boolean; metaKey?: boolean; button?: number };

/** Opens a web link in the system browser; outside the desktop shell, in a new window. */
export async function openSystemLink(url: string) {
	const api = window.phaseoDesktop?.workspace;
	if (api) await api.openLink(url);
	else window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Opens a link from a chat or a terminal where Settings → Browser → Open links in says: inApp shows it in Phaseo's
 * browser, anything else goes to the system browser. Ctrl or Cmd held, or the middle button, picks the other one.
 * Without inApp (no chat to show it in), or when inApp returns false, the link opens in the system browser.
 */
export async function openLink(url: string, click?: LinkClick, inApp?: () => boolean | void) {
	// The click is read now: the preferences may take a moment to load.
	const event = { ctrlKey: click?.ctrlKey, metaKey: click?.metaKey, button: click?.button };
	const target = inApp ? browserLinkTarget((await fetchWorkspacePreferences()).browser.openLinksIn, url, event) : "system";
	if (target === "phaseo" && inApp && inApp() !== false) return;
	await openSystemLink(url);
}

/** A web link from anywhere in the app: the open chat's browser pane shows it when the setting says Phaseo, else (or with no chat pane open) the system browser. */
export function openWebLink(url: string, click?: LinkClick) {
	return openLink(url, click, () => !window.dispatchEvent(new CustomEvent("phaseo:open-context-link", { detail: url, cancelable: true })));
}
