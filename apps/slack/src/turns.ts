import type { Env } from "./env";

// How a thread's turn is run. The coordinator starts a turn and must not wait for
// it: start() returns as soon as the turn is under way, and the turn reports back
// through ThreadCoordinator.finishTurn. The agent run (a Cloudflare Workflow)
// replaces the stub below in the next change; tests use their own runner.

export type TurnRef = {
	turnId: number;
	/** The coordinator's name (installation:channel:thread_ts), for callbacks. */
	threadKey: string;
	eventId: string;
	installationId: string;
	teamId: string | null;
	channel: string;
	threadTs: string;
	messageTs: string;
	slackUserId: string;
	kind: "mention" | "dm";
};

export type TurnOutcome = {
	status: "done" | "failed" | "cancelled";
	/** The bot's reply, kept as working memory for the thread (7 days at most). */
	reply?: string;
	/** Short summaries of the tools the turn used. */
	tools?: string[];
};

export type TurnStart = { started: true } | { finished: TurnOutcome };

export interface TurnRunner {
	start(turn: TurnRef): Promise<TurnStart>;
}

/**
 * Until the agent run lands, a turn is acknowledged and finished at once. No
 * answer was given, so the meter's pending answer is released, not counted.
 */
export function createStubTurnRunner(env: Pick<Env, "METERS">): TurnRunner {
	return {
		async start(turn) {
			await env.METERS.get(env.METERS.idFromName(turn.installationId)).release({ eventId: turn.eventId });
			console.log("[slack-agent] turn acknowledged", { turnId: turn.turnId, installationId: turn.installationId, channel: turn.channel, kind: turn.kind });
			return { finished: { status: "done" } };
		},
	};
}
