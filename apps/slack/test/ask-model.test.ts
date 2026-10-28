import { AgentGatewayError } from "@phaseo/agent-sdk";
import { describe, expect, it } from "vitest";
import type { AskOutput } from "../src/agent";
import { askModelTool, askModelTools, CONSULT_MAX_OUTPUT_TOKENS, MAX_CONSULTS, type AskModelOptions, type Consult } from "../src/ask-model";
import { FakeDb } from "./fakes";

const LUNA = { id: "openai/gpt-6-luna", name: "GPT-6 Luna" };
const OPUS = { id: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5" };

type Asked = Parameters<AskModelOptions["ask"]>[0];

function setup(overrides: Partial<AskModelOptions> = {}, answer: (request: Asked) => Promise<AskOutput> = async () => ({ text: "Looks right.", costUsd: 0.02 })) {
	const asked: Asked[] = [];
	const consults: Consult[] = [];
	const notes: string[] = [];
	let spent = 0;
	const tool = askModelTool({
		models: [LUNA, OPUS],
		ask: async (request) => {
			asked.push(request);
			return answer(request);
		},
		budgetLeftUsd: () => 0.5 - spent - consults.reduce((sum, consult) => sum + consult.costUsd, 0),
		consults,
		notes,
		...overrides,
	});
	const call = (input: Record<string, unknown>, signal?: AbortSignal) => (tool.execute as (input: unknown, context: unknown) => Promise<Record<string, unknown>>)(input, { signal });
	return { tool, asked, consults, notes, call, spend: (usd: number) => { spent = usd; } };
}

describe("ask_model", () => {
	it("lists the models it can ask, by id, and tells the agent what the other model sees", () => {
		const { tool } = setup();
		expect(tool.id).toBe("ask_model");
		expect(tool.onError).toBe("return-to-model");
		expect(tool.parameters).toMatchObject({ properties: { model: { enum: [LUNA.id, OPUS.id] } }, required: ["model", "prompt"] });
		expect(tool.description).toContain("The model sees only your prompt");
		expect(tool.description).toContain("Models you can ask: GPT-6 Luna (openai/gpt-6-luna), Claude Opus 5.5 (anthropic/claude-opus-5-5).");
	});

	it("asks with only the prompt, and returns the answer, its cost and what is left", async () => {
		const { asked, consults, notes, call } = setup();
		await expect(call({ model: OPUS.id, prompt: "  Is 2 + 2 = 4?  " })).resolves.toEqual({
			model: OPUS.id, name: "Claude Opus 5.5", answer: "Looks right.", cost_usd: 0.02, asks_left: 2, budget_left_usd: 0.48,
		});
		expect(asked).toEqual([{ model: OPUS.id, instructions: expect.stringContaining("Phaseo agent in Slack"), prompt: "Is 2 + 2 = 4?", maxOutputTokens: CONSULT_MAX_OUTPUT_TOKENS, signal: undefined }]);
		expect(consults).toEqual([{ model: OPUS.id, costUsd: 0.02, answered: true }]);
		// Working memory gets the model id, never the prompt or the answer.
		expect(notes).toEqual(["ask_model anthropic/claude-opus-5-5"]);
		// A model named by its catalogue name works too.
		await expect(call({ model: "gpt-6 luna", prompt: "hi" })).resolves.toMatchObject({ model: LUNA.id });
	});

	it("asks at most three times an answer, counting failures", async () => {
		const { asked, call } = setup({}, async (request) => {
			if (request.model === LUNA.id) throw new AgentGatewayError({ status: 404, statusText: "Not Found", body: { error: { code: "model_not_found" } } });
			return { text: "ok", costUsd: 0.01 };
		});
		await expect(call({ model: LUNA.id, prompt: "a" })).rejects.toThrow();
		await call({ model: OPUS.id, prompt: "b" });
		await call({ model: OPUS.id, prompt: "c" });
		await expect(call({ model: OPUS.id, prompt: "d" })).rejects.toThrow(`You have already asked other models ${MAX_CONSULTS} times for this answer`);
		expect(asked).toHaveLength(3);
	});

	it("stops asking when too little of the answer's limit is left for the agent to finish", async () => {
		const { asked, call, spend } = setup();
		spend(0.41);
		await expect(call({ model: OPUS.id, prompt: "a" })).rejects.toThrow("Only $0.09 of this answer's $0.50 limit is left, too little to ask another model. Answer with what you have.");
		expect(asked).toEqual([]);
		spend(0.3);
		await call({ model: OPUS.id, prompt: "a" });
		expect(asked).toHaveLength(1);
	});

	it("asks one model at a time, so each sees what the one before cost", async () => {
		let release!: () => void;
		const first = new Promise<void>((resolve) => { release = resolve; });
		const { asked, call, spend } = setup({}, async (request) => {
			if (request.prompt === "first") await first;
			return { text: "ok", costUsd: 0.25 };
		});
		spend(0.1);
		const one = call({ model: OPUS.id, prompt: "first" });
		const two = call({ model: LUNA.id, prompt: "second" });
		await Promise.resolve();
		expect(asked.map((request) => request.prompt)).toEqual(["first"]);
		release();
		await expect(one).resolves.toMatchObject({ cost_usd: 0.25 });
		// $0.50 − $0.10 − $0.25 leaves $0.15: still enough.
		await expect(two).resolves.toMatchObject({ budget_left_usd: 0 });
		expect(asked.map((request) => request.prompt)).toEqual(["first", "second"]);
	});

	it("turns gateway refusals into errors the agent can explain", async () => {
		const failing = (status: number, body: Record<string, unknown>) => setup({}, async () => { throw new AgentGatewayError({ status, statusText: "Error", body }); });
		await expect(failing(403, { error: { code: "guardrail_blocked" }, error_operational_kind: "data_handling_policy_no_routes" }).call({ model: OPUS.id, prompt: "a" }))
			.rejects.toThrow("Claude Opus 5.5 isn't available to the Slack agent: no provider of it meets the agent's data rules, or a workspace policy blocks it.");
		await expect(failing(402, { error: { code: "insufficient_funds" } }).call({ model: OPUS.id, prompt: "a" })).rejects.toThrow("This Phaseo workspace is out of credits, so no model can be asked.");
		await expect(failing(404, { error: { code: "model_not_found" } }).call({ model: OPUS.id, prompt: "a" })).rejects.toThrow("Claude Opus 5.5 isn't available right now.");
		await expect(failing(500, { error: "boom" }).call({ model: OPUS.id, prompt: "a" })).rejects.toThrow("Asking Claude Opus 5.5 failed.");
		// A failed consult is recorded with no cost.
		const failed = failing(500, { error: "boom" });
		await failed.call({ model: OPUS.id, prompt: "a" }).catch(() => undefined);
		expect(failed.consults).toEqual([{ model: OPUS.id, costUsd: 0, answered: false }]);
	});

	it("rejects models it can't ask and empty prompts without asking", async () => {
		const { asked, call } = setup();
		await expect(call({ model: "google/gemini-3-pro", prompt: "a" })).rejects.toThrow("model must be one of: openai/gpt-6-luna, anthropic/claude-opus-5-5");
		await expect(call({ model: OPUS.id, prompt: "  " })).rejects.toThrow("prompt must not be empty");
		await expect(call({ model: OPUS.id, prompt: "x".repeat(20_001) })).rejects.toThrow("prompt must be at most 20,000 characters");
		expect(asked).toEqual([]);
	});

	it("is offered only with model choice on and another allowed model than the one answering", async () => {
		const db = new FakeDb();
		db.tables.v2_models.push({ model_slug: OPUS.id, name: OPUS.name }, { model_slug: LUNA.id, name: LUNA.name });
		const options = { ask: async () => ({ text: "", costUsd: 0 }), budgetLeftUsd: () => 0.5, consults: [], notes: [] };
		const ids = async (installation: { model_choice_enabled: boolean; allowed_models: string[] }, model: string) =>
			(await askModelTools(db, installation, model, options)).map((tool) => (tool.parameters as { properties: { model: { enum: string[] } } }).properties.model.enum);
		await expect(ids({ model_choice_enabled: true, allowed_models: [LUNA.id, OPUS.id] }, LUNA.id)).resolves.toEqual([[OPUS.id]]);
		await expect(ids({ model_choice_enabled: true, allowed_models: [LUNA.id, OPUS.id] }, "phaseo/auto")).resolves.toEqual([[LUNA.id, OPUS.id]]);
		await expect(ids({ model_choice_enabled: true, allowed_models: [LUNA.id] }, LUNA.id)).resolves.toEqual([]);
		await expect(ids({ model_choice_enabled: false, allowed_models: [LUNA.id, OPUS.id] }, LUNA.id)).resolves.toEqual([]);
	});
});
