/**
 * What the message box's main button does right now. While a turn runs it stops the turn until there is something to
 * send; then a send queues by default and Ctrl/⌘ (or the alternate send key) sends it into the running turn instead.
 */
export type PrimaryAction = "stop" | "send" | "queue" | "steer" | "update" | "implement" | "refine" | "answer";

export function primaryAction(input: {
	running: boolean;
	hasContent: boolean;
	/** A queued message is open in the box. */
	editing: boolean;
	/** The agent waits on a question, which the box answers. */
	question: boolean;
	/** A proposed plan waits: blank implements it, text asks for changes. */
	plan: boolean;
	canStop: boolean;
	canSteer: boolean;
	/** Ctrl/⌘ held, or the alternate send key. */
	alternate: boolean;
}): PrimaryAction {
	if (input.question) return "answer";
	if (input.editing) return "update";
	if (input.plan) return input.hasContent ? "refine" : "implement";
	if (input.running && !input.hasContent && input.canStop) return "stop";
	if (!input.running) return "send";
	return input.alternate && input.canSteer ? "steer" : "queue";
}

export const primaryLabels: Record<PrimaryAction, string> = {
	stop: "Stop",
	send: "Send",
	queue: "Queue message",
	steer: "Send into the running turn",
	update: "Update queued message",
	implement: "Implement",
	refine: "Refine",
	answer: "Submit answer",
};

/** The label for the answer button: the next question, or the last one's submit. */
export function answerLabel(progress: { step: number; count: number; busy: boolean }) {
	if (progress.busy) return "Sending…";
	if (progress.step < progress.count - 1) return "Next question";
	return progress.count > 1 ? "Submit answers" : "Submit answer";
}
