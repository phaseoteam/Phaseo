// What web-api asks of the Slack agent Worker (apps/slack) through its service
// binding, SLACK_AGENT: the Worker's SlackAgentAdmin entrypoint, which only
// bound Workers can reach. It keeps the agent's shared pages; Settings → Slack
// lists and deletes them, and uninstalling deletes them all. Callers check that
// the person manages the installation first.

export type SlackAgentPageAccess = "link" | "workspace";

/** A shared page as Settings → Slack shows it: never its HTML. Times are ISO strings. */
export type SlackAgentPage = {
	id: string;
	/** The page's link, which owners and admins may open. */
	url: string;
	title: string;
	access: SlackAgentPageAccess;
	/** The Slack user id of the person whose answer published it. */
	created_by: string;
	created_at: string;
	expires_at: string;
	views: number;
};

export type SlackAgentPages = {
	/** The Worker serves pages (it knows its public origin). */
	available: boolean;
	/** People can sign in with Slack to view pages shared with the workspace (the app's client credentials are set). */
	sign_in: boolean;
	pages: SlackAgentPage[];
	/** The most live pages an installation keeps. */
	limit: number;
};

export type SlackAgentAdminBinding = {
	listPages(installationId: string): Promise<SlackAgentPages>;
	deletePage(installationId: string, pageId: string): Promise<boolean>;
	deletePages(installationId: string): Promise<void>;
};

/** A page id as the Worker makes them: 128 random bits, base64url. */
export const SLACK_AGENT_PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
