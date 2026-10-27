import { CHANNEL_PATTERN, coordinatorFor, threadKey, TS_PATTERN, type Deps } from "./events";
import { findInstallation, type SlackAppContext } from "./installations";

// Button clicks (block_actions). Cancel stops the thread's running turn and drops
// its queued follow-ups. Connect account is a link button: Slack still reports the
// click, which needs nothing more. Feedback buttons are acknowledged for now.

export const CANCEL_ACTION_ID = "cancel_turn";
export const CONNECT_ACTION_ID = "connect_account";
export const FEEDBACK_ACTION_PREFIX = "feedback";

export type InteractionPayload = {
	type?: string;
	api_app_id?: string;
	is_enterprise_install?: boolean;
	team?: { id?: string } | null;
	enterprise?: { id?: string } | null;
	user?: { id?: string; team_id?: string };
	channel?: { id?: string };
	container?: { channel_id?: string; message_ts?: string; thread_ts?: string };
	message?: { ts?: string; thread_ts?: string };
	actions?: Array<{ action_id?: string; value?: string }>;
};

export type InteractionOutcome = "ignored" | "acknowledged" | "cancelled" | "no_installation" | "error";

/** The Cancel button for a thread. Its value is the thread's root ts; the channel comes from the click. */
export function cancelButton(threadTs: string) {
	return { type: "button", action_id: CANCEL_ACTION_ID, value: threadTs, text: { type: "plain_text", text: "Cancel" } };
}

export async function handleInteraction(deps: Deps, app: SlackAppContext, payload: InteractionPayload): Promise<InteractionOutcome> {
	try {
		if (payload.type !== "block_actions") return "ignored";
		const action = payload.actions?.[0];
		const actionId = action?.action_id ?? "";
		if (actionId === CONNECT_ACTION_ID || actionId.startsWith(FEEDBACK_ACTION_PREFIX)) return "acknowledged";
		if (actionId !== CANCEL_ACTION_ID) return "ignored";

		const channel = payload.channel?.id ?? payload.container?.channel_id ?? "";
		const threadTs = action?.value ?? "";
		if (!CHANNEL_PATTERN.test(channel) || !TS_PATTERN.test(threadTs)) return "ignored";
		const installation = await findInstallation(deps.db, app, {
			teamId: payload.team?.id ?? payload.user?.team_id ?? null,
			enterpriseId: payload.enterprise?.id ?? null,
			isEnterpriseInstall: payload.is_enterprise_install === true,
		});
		if (!installation) return "no_installation";
		const result = await coordinatorFor(deps.env, threadKey(installation.id, channel, threadTs)).cancel(deps.now());
		console.log("[slack-agent] cancel clicked", { installationId: installation.id, turnId: result.turnId, dropped: result.dropped });
		return "cancelled";
	} catch (error) {
		console.error("[slack-agent] interaction failed", { error: error instanceof Error ? error.message : "unknown" });
		return "error";
	}
}
