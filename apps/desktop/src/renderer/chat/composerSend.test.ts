import { describe, expect, it } from "vitest";
import { answerLabel, primaryAction } from "./composerSend";

const idle = { running: false, hasContent: false, editing: false, question: false, plan: false, canStop: true, canSteer: true, alternate: false };

describe("primaryAction", () => {
	it("sends when no turn runs", () => {
		expect(primaryAction({ ...idle, hasContent: true })).toBe("send");
		expect(primaryAction(idle)).toBe("send");
	});

	it("stops a running turn until there is something to send", () => {
		expect(primaryAction({ ...idle, running: true })).toBe("stop");
		expect(primaryAction({ ...idle, running: true, hasContent: true })).toBe("queue");
	});

	it("queues by default and steers with the modifier, only where the agent takes messages mid-turn", () => {
		expect(primaryAction({ ...idle, running: true, hasContent: true, alternate: true })).toBe("steer");
		expect(primaryAction({ ...idle, running: true, hasContent: true, alternate: true, canSteer: false })).toBe("queue");
	});

	it("keeps a send button while a turn runs when it cannot be stopped from here", () => {
		expect(primaryAction({ ...idle, running: true, canStop: false })).toBe("queue");
	});

	it("updates a queued message being edited, even while a turn runs", () => {
		expect(primaryAction({ ...idle, running: true, editing: true })).toBe("update");
	});

	it("implements a waiting plan when blank and refines it with text", () => {
		expect(primaryAction({ ...idle, running: true, plan: true })).toBe("implement");
		expect(primaryAction({ ...idle, running: true, plan: true, hasContent: true })).toBe("refine");
	});

	it("answers an open question before anything else", () => {
		expect(primaryAction({ ...idle, running: true, plan: true, editing: true, question: true })).toBe("answer");
	});
});

describe("answerLabel", () => {
	it("moves through the questions, then submits", () => {
		expect(answerLabel({ step: 0, count: 3, busy: false })).toBe("Next question");
		expect(answerLabel({ step: 2, count: 3, busy: false })).toBe("Submit answers");
		expect(answerLabel({ step: 0, count: 1, busy: false })).toBe("Submit answer");
		expect(answerLabel({ step: 0, count: 1, busy: true })).toBe("Sending…");
	});
});
