import { slackErrorKey, type SlackAgentSettings, type SlackErrorKey, type SlackPageAccess } from "./slackAgentForm";

// The Slack agent's shared pages, as Settings → Slack shows them: the HTML pages
// it published, how long new ones are kept and who may view them. The Slack
// Worker keeps the pages; web-api asks it for them.

export const SLACK_PAGE_EXPIRY_DAYS: readonly number[] = [7, 30, 90];
export const SLACK_PAGE_ACCESS: readonly SlackPageAccess[] = ["link", "workspace"];

export type SlackAgentPage = {
	id: string;
	/** The page's link; opening it follows the page's access (a workspace page needs a Slack sign-in). */
	url: string;
	title: string;
	access: SlackPageAccess;
	/** The Slack user id of the person whose answer published it. */
	created_by: string;
	created_at: string;
	expires_at: string;
	views: number;
};

export type SlackAgentPages = {
	/** Pages are served where this is set up (production). */
	available: boolean;
	/** People can sign in with Slack to view pages shared with the Slack workspace. */
	sign_in: boolean;
	pages: SlackAgentPage[];
	limit: number;
};

/** The page settings, with the database's defaults for an API that predates them. */
export type SlackPageSettings = { enabled: boolean; expiryDays: number; defaultAccess: SlackPageAccess; linkAccess: boolean };

export function pageSettings(settings: Pick<SlackAgentSettings, "pages_enabled" | "page_expiry_days" | "page_default_access" | "page_link_access">): SlackPageSettings {
	return {
		enabled: settings.pages_enabled !== false,
		expiryDays: settings.page_expiry_days && SLACK_PAGE_EXPIRY_DAYS.includes(settings.page_expiry_days) ? settings.page_expiry_days : 30,
		defaultAccess: settings.page_default_access === "workspace" ? "workspace" : "link",
		linkAccess: settings.page_link_access !== false,
	};
}

/**
 * Who new pages can be shared with, as the agent decides it: anyone with the link
 * while that is allowed, and the Slack workspace where people can sign in. No
 * effective default: the agent can't publish a page.
 */
export function pageSharing(settings: SlackPageSettings, signIn: boolean): { modes: SlackPageAccess[]; effectiveDefault: SlackPageAccess | null } {
	const modes = SLACK_PAGE_ACCESS.filter((mode) => (mode === "link" ? settings.linkAccess : signIn));
	return { modes, effectiveDefault: modes.includes(settings.defaultAccess) ? settings.defaultAccess : modes[0] ?? null };
}

/** The page settings change for a switch of link sharing: off moves a link default to the workspace, as web-api does. */
export function linkAccessPatch(next: boolean, current: SlackPageSettings): Record<string, unknown> {
	return !next && current.defaultAccess === "link" ? { page_link_access: false, page_default_access: "workspace" } : { page_link_access: next };
}

/** SettingsUI.slack.pages.errors keys, for the pages routes' own codes. */
export type SlackPagesErrorKey = "pageNotFound";

export type SlackPagesError =
	| { scope: "pages"; key: SlackPagesErrorKey }
	| { scope: "slack"; key: SlackErrorKey; message?: string | null };

export function slackPagesError(code: string | null | undefined, status: number | null | undefined, message?: string | null): SlackPagesError {
	if (code === "page_not_found") return { scope: "pages", key: "pageNotFound" };
	return { scope: "slack", key: slackErrorKey(code, status), message };
}
