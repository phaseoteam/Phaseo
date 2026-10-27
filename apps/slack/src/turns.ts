import type { Env } from "./env";

// How a thread's turn is run. The coordinator starts a turn and must not wait for
// it: start() returns as soon as the turn is under way, and the turn reports back
// through ThreadCoordinator.finishTurn. Turns run as AgentTurnWorkflow instances
// (Cloudflare Workflows, billed on CPU; waiting on the model is free).

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
	/** The model the person chose for this message (`with <model>:`), when the installation allows it. */
	model?: string | null;
};

export type TurnOutcome = {
	status: "done" | "failed" | "cancelled";
	/** The bot's reply, kept as working memory for the thread (7 days at most). Defaults to what the run staged. */
	reply?: string;
	/** Short summaries of the tools the turn used. */
	tools?: string[];
};

export type TurnStart = { started: true } | { finished: TurnOutcome };

export interface TurnRunner {
	start(turn: TurnRef): Promise<TurnStart>;
	/** Wakes a turn waiting for the answer to its question n (answered, or the thread was stopped). Runners whose turns never wait leave it out. */
	wake?(turn: TurnRef, question: number): Promise<void>;
}

/** The Workflow event a turn waits for after posting its question n. */
export function answerEventType(question: number): string {
	return `answer-${question}`;
}

/** Workflow instances are kept a day, not the 30-day default: their storage is billed, and they hold ids only. */
export const TURN_RETENTION = { successRetention: "1 day", errorRetention: "1 day" } as const;

/** One instance per Slack event; the id makes a repeated start a no-op. */
export function turnInstanceId(turn: Pick<TurnRef, "eventId">): string {
	return `turn-${turn.eventId}`;
}

/** The gateway session of one answer: every model request it makes, so Logs can show them together. */
export function turnSessionId(turn: Pick<TurnRef, "eventId">): string {
	return `slack-${turn.eventId}`;
}

export function createWorkflowTurnRunner(env: Pick<Env, "AGENT_TURNS">): TurnRunner {
	return {
		async start(turn) {
			try {
				await env.AGENT_TURNS.create({ id: turnInstanceId(turn), params: turn, retention: TURN_RETENTION });
			} catch (error) {
				// Already started (a retried start): the instance reports back itself.
				if (!(error instanceof Error && /already exists/i.test(error.message))) throw error;
			}
			return { started: true };
		},
		async wake(turn, question) {
			// The event says which question, nothing more: the answer stays in the thread's coordinator.
			const instance = await env.AGENT_TURNS.get(turnInstanceId(turn));
			await instance.sendEvent({ type: answerEventType(question), payload: { question } });
		},
	};
}
