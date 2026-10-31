import type { ThreadCoordinator } from "./coordinator";
import type { WorkspaceMeter } from "./meter";
import type { PageStore } from "./pages";
import type { TurnRef } from "./turns";

// Bindings, vars and secrets of the Slack agent Worker (wrangler.jsonc). Secrets
// are listed in README.md; none of them is ever logged or returned.
export interface Env {
	/** One ThreadCoordinator per Slack thread: dedupe, one turn at a time, cancel, 7-day working memory. */
	THREADS: DurableObjectNamespace<ThreadCoordinator>;
	/** One WorkspaceMeter per installation: who may get an answer this month, and the counts billed for it. */
	METERS: DurableObjectNamespace<WorkspaceMeter>;
	/** Agent turns (AgentTurnWorkflow), one instance per Slack event. */
	AGENT_TURNS: Workflow<TurnRef>;
	/** One PageStore per installation: the agent's shared pages, deleted at expiry and on uninstall. */
	PAGES: DurableObjectNamespace<PageStore>;
	ENV?: string;
	/** This Worker's public origin (https://slack.phaseo.app): shared page links and their Slack sign-in. Unset: no shared pages. */
	PUBLIC_ORIGIN?: string;
	/** The gateway's base URL (default https://api.phaseo.app/v1), which agent turns call. */
	PHASEO_API_BASE_URL?: string;
	/** Where the account linking page lives (default https://phaseo.app). */
	PHASEO_WEB_ORIGIN?: string;

	/** The hosted Phaseo Slack app's signing secret. Company apps keep theirs in slack_apps. */
	SLACK_SIGNING_SECRET?: string;
	/** The hosted app's id (A...). When set, events for any other app are refused at /events. */
	SLACK_APP_ID?: string;
	/** The hosted app's client credentials: refreshing rotating bot tokens, and Sign in with Slack for shared pages. */
	SLACK_CLIENT_ID?: string;
	SLACK_CLIENT_SECRET?: string;

	/** Decrypts installation and company app secrets (the same key as web-api). */
	SLACK_SECRETS_ENCRYPTION_KEY?: string;
	SLACK_SECRETS_ENCRYPTION_KEY_VERSION?: string;
	/** Signs account link tokens (the same secret as web-api, which verifies them). */
	SLACK_STATE_SECRET?: string;

	SUPABASE_URL?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;

	/** Phaseo's internal Discord webhook (the same as web-api's) for an alert when the app is removed inside Slack. Optional: unset turns the alert off. */
	DISCORD_SIGNUP_WEBHOOK_URL?: string;
}
