import { describe, expect, it, vi } from "vitest";
import type { AgentQuestion, Message } from "../shared/workspace";
import { answerQuestions, autopilotBrief, autopilotModel, judgeTurn, replyObject, reviewPlan, type AutopilotCall } from "./autopilot";

const message = (role: Message["role"], text: string, extra: Partial<Message> = {}): Message => ({ id: `${role}:${text}`, role, text, createdAt: "", ...extra });
const replying = (...replies: string[]) => vi.fn<AutopilotCall>(async () => replies.shift());
const brief = autopilotBrief({ title: "Fix login", messages: [message("user", "Fix the login redirect")] });

describe("Autopilot", () => {
	it("asks the parent's model first, then the chat's own Phaseo model, then the settings", () => {
		const preferences = { autopilotModel: "openai/gpt-6-mini", titleModel: "google/gemini-flash" };
		expect(autopilotModel({ harness: "codex", model: "gpt-6" }, { harness: "phaseo", model: "anthropic/claude-opus-5.5" }, preferences)).toBe("anthropic/claude-opus-5.5");
		expect(autopilotModel({ harness: "phaseo", model: "openai/gpt-6" }, undefined, preferences)).toBe("openai/gpt-6");
		expect(autopilotModel({ harness: "claude", model: "opus" }, { harness: "codex", model: "gpt-6" }, preferences)).toBe("openai/gpt-6-mini");
		expect(autopilotModel({ harness: "phaseo", model: "default" }, undefined, { autopilotModel: null, titleModel: "google/gemini-flash" })).toBe("google/gemini-flash");
		expect(autopilotModel({ harness: "claude", model: "opus" }, undefined, { autopilotModel: null, titleModel: null })).toBeUndefined();
	});

	it("tells the model the person's task, not its own follow-ups, and the latest messages", () => {
		const messages = [message("user", "Add dark mode"), message("assistant", "Started"), message("user", "Keep going: theme the sidebar", { autopilot: true }), ...Array.from({ length: 10 }, (_, index) => message("assistant", `Step ${index}`))];
		const value = autopilotBrief({ title: "Dark mode", messages }, { title: "Redesign", messages: [message("user", "Redesign the app")] });
		expect(value.goal).toBe("Add dark mode");
		expect(value.recent).toHaveLength(8);
		expect(value.recent.at(-1)).toEqual({ role: "agent", text: "Step 9" });
		expect(value.parent).toMatchObject({ title: "Redesign", goal: "Redesign the app" });
		expect(autopilotBrief({ title: "x", messages: [message("user", "Keep going", { autopilot: true }), message("user", "Real task")] }).recent.map(turn => turn.role)).toEqual(["autopilot", "person"]);
	});

	it("reads one JSON object from a reply, around code fences and prose", () => {
		expect(replyObject('Sure.\n```json\n{"decision":"accept","reason":"Fine"}\n```')).toEqual({ decision: "accept", reason: "Fine" });
		expect(replyObject("no json here")).toBeUndefined();
		expect(replyObject("[1, 2]")).toBeUndefined();
		expect(replyObject(undefined)).toBeUndefined();
	});

	it("answers questions with option values, and never answers for a secret", async () => {
		const questions: AgentQuestion[] = [{ id: "colour", header: "Colour", question: "Which colour?", options: [{ label: "Blue", value: "blue" }, { label: "Red", value: "red" }] }, { id: "name", header: "Name", question: "What name?", isOther: true }];
		const call = replying('{"decision":"answer","answers":{"colour":["Blue"],"name":"Ada"},"reason":"The task says blue."}');
		expect(await answerQuestions(call, brief, questions)).toEqual({ decision: "answer", answers: { colour: ["blue"], name: ["Ada"] }, reason: "The task says blue." });
		const secret = replying();
		expect(await answerQuestions(secret, brief, [{ id: "key", header: "Key", question: "API key?", isSecret: true }])).toMatchObject({ decision: "escalate" });
		expect(secret).not.toHaveBeenCalled();
		expect(await answerQuestions(replying("I think blue"), brief, questions)).toEqual({ decision: "escalate", reason: "Autopilot could not read the model's reply." });
		expect(await answerQuestions(replying('{"decision":"escalate","reason":"Only they know"}'), brief, questions)).toEqual({ decision: "escalate", reason: "Only they know" });
	});

	it("sends a plan back only with feedback to act on", async () => {
		expect(await reviewPlan(replying('{"decision":"revise","feedback":"Add a test","reason":"Untested"}'), brief, "Plan")).toEqual({ decision: "revise", feedback: "Add a test", reason: "Untested" });
		expect(await reviewPlan(replying('{"decision":"revise","reason":"Untested"}'), brief, "Plan")).toMatchObject({ decision: "escalate" });
		expect(await reviewPlan(replying('{"decision":"accept"}'), brief, "Plan")).toEqual({ decision: "accept", reason: "No reason given." });
	});

	it("judges a turn done, worth another instruction, or blocked on the person", async () => {
		const turn = { answer: "Fixed and tested.", usedTools: true, followUps: 0 };
		expect(await judgeTurn(replying('{"status":"done","summary":"Login redirects home."}'), brief, turn)).toEqual({ status: "done", summary: "Login redirects home." });
		expect(await judgeTurn(replying('{"status":"continue","message":"Run the tests","reason":"Not run yet"}'), brief, turn)).toEqual({ status: "continue", message: "Run the tests", reason: "Not run yet" });
		expect(await judgeTurn(replying('{"status":"blocked","summary":"Needs the staging URL"}'), brief, turn)).toEqual({ status: "blocked", summary: "Needs the staging URL" });
		// A follow-up with no instruction, or a reply that is not a verdict, goes back to the person.
		expect(await judgeTurn(replying('{"status":"continue"}'), brief, turn)).toMatchObject({ status: "blocked" });
		expect(await judgeTurn(replying("Looks good to me"), brief, turn)).toMatchObject({ status: "blocked" });
		const call = replying('{"status":"done"}');
		await judgeTurn(call, brief, { answer: "", usedTools: false, followUps: 3 });
		expect(call.mock.calls[0][0].user).toContain("without using any tools");
		expect(call.mock.calls[0][0].user).toContain("3 follow-ups");
	});
});
