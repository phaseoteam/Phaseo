import { AgentGatewayError } from "@phaseo/agent-sdk";
import { describe, expect, it } from "vitest";
import type { AgentRunner, AskRequest } from "../src/agent";
import { compareAnswers, comparedModels, comparisonInstructions, comparisonText, COMPARE_MAX_OUTPUT_TOKENS, type ComparedAnswer } from "../src/compare";
import { MAX_MARKDOWN_CHARS } from "../src/reply-stream";

const LUNA = "openai/gpt-6-luna";
const OPUS = "anthropic/claude-opus-5-5";
const AUTO = "phaseo/auto";

const REQUEST = {
	gatewayKey: "phaseo_v1_sk_testkid00000_testsecret",
	endUser: "slack:T0TEST0001:U0PERSON01",
	sessionId: "slack-Ev0TEST0001",
	labels: { slackTeam: "T0TEST0001", slackChannel: "C0CHANNEL1" },
	signal: new AbortController().signal,
};

function agentAnswering(answer: (request: AskRequest) => Promise<{ text: string; costUsd: number }>) {
	const asks: AskRequest[] = [];
	const agent: AgentRunner = {
		run: async () => { throw new Error("unexpected run"); },
		ask: async (request) => {
			asks.push(request);
			return answer(request);
		},
	};
	return { agent, asks };
}

describe("Compare", () => {
	it("asks the models the installation still allows, or none when fewer than two are left", () => {
		const installation = { model_choice_enabled: true, allowed_models: [LUNA, OPUS, AUTO] };
		expect(comparedModels(installation, { compare: [OPUS, LUNA] })).toEqual([OPUS, LUNA]);
		expect(comparedModels(installation, { compare: [OPUS, "acme/removed", AUTO] })).toEqual([OPUS, AUTO]);
		expect(comparedModels(installation, { compare: [OPUS, "acme/removed"] })).toBeNull();
		expect(comparedModels({ ...installation, model_choice_enabled: false }, { compare: [OPUS, LUNA] })).toBeNull();
		expect(comparedModels(installation, {})).toBeNull();
	});

	it("asks every model at once with the question, web tools, the answer's key, labels and session, and keeps each cost", async () => {
		const { agent, asks } = agentAnswering(async (request) => ({ text: `${request.model} says hi`, costUsd: request.model === LUNA ? 0.01 : 0.02 }));
		const answers = await compareAnswers(agent, { models: [LUNA, OPUS], question: "Which is faster?", instructions: "Be brief.", request: REQUEST, budgetUsd: 0.5 });
		expect(answers).toEqual([
			{ model: LUNA, text: `${LUNA} says hi`, costUsd: 0.01, error: null },
			{ model: OPUS, text: `${OPUS} says hi`, costUsd: 0.02, error: null },
		]);
		expect(asks).toEqual([LUNA, OPUS].map((model) => ({ ...REQUEST, model, instructions: "Be brief.", prompt: "Which is faster?", webTools: true, maxOutputTokens: COMPARE_MAX_OUTPUT_TOKENS })));
	});

	it("asks in parallel, not one after another", async () => {
		let started = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const { agent } = agentAnswering(async () => {
			started += 1;
			await gate;
			return { text: "ok", costUsd: 0 };
		});
		const pending = compareAnswers(agent, { models: [LUNA, OPUS, AUTO], question: "q", instructions: "", request: REQUEST, budgetUsd: 0.5 });
		await Promise.resolve();
		expect(started).toBe(3);
		release();
		await expect(pending).resolves.toHaveLength(3);
	});

	it("keeps the other answers when one model fails, with its error", async () => {
		const { agent } = agentAnswering(async (request) => {
			if (request.model === OPUS) throw new AgentGatewayError({ status: 403, statusText: "Forbidden", body: { error_operational_kind: "data_handling_policy_no_routes" } });
			if (request.model === AUTO) throw new AgentGatewayError({ status: 400, statusText: "Bad Request", body: { code: "not_supported" } });
			return { text: "Luna's answer", costUsd: 0.01 };
		});
		const answers = await compareAnswers(agent, { models: [LUNA, OPUS, AUTO], question: "q", instructions: "", request: REQUEST, budgetUsd: 0.5 });
		expect(answers.map((answer) => [answer.model, answer.error])).toEqual([[LUNA, null], [OPUS, "model_not_allowed"], [AUTO, "model_not_allowed"]]);
	});

	it("treats an answer with no text as failed, keeping what it cost", async () => {
		// A reasoning model can use its whole output allowance before writing anything.
		const { agent } = agentAnswering(async (request) => ({ text: request.model === LUNA ? "Luna's answer" : "  \n", costUsd: 0.03 }));
		const answers = await compareAnswers(agent, { models: [LUNA, OPUS], question: "q", instructions: "", request: REQUEST, budgetUsd: 0.5 });
		expect(answers).toEqual([
			{ model: LUNA, text: "Luna's answer", costUsd: 0.03, error: null },
			{ model: OPUS, text: "  \n", costUsd: 0.03, error: "empty" },
		]);
	});

	it("splits what is left of the limit evenly, and doesn't ask when a share is too small", async () => {
		const { agent, asks } = agentAnswering(async () => ({ text: "ok", costUsd: 0.01 }));
		// A retry after earlier attempts spent $0.47: $0.015 each.
		const answers = await compareAnswers(agent, { models: [LUNA, OPUS], question: "q", instructions: "", request: REQUEST, budgetUsd: 0.03 });
		expect(answers.map((answer) => answer.error)).toEqual(["skipped", "skipped"]);
		expect(asks).toEqual([]);
		// $0.04 left: $0.02 each, enough to ask.
		await compareAnswers(agent, { models: [LUNA, OPUS], question: "q", instructions: "", request: REQUEST, budgetUsd: 0.04 });
		expect(asks).toHaveLength(2);
	});

	it("writes a section per model: its name linked to its page, its cost and its answer, or its error", () => {
		const names = new Map([
			[LUNA, { name: "GPT-6 Luna", url: "https://phaseo.app/models/openai/gpt-6-luna" }],
			[OPUS, { name: "Claude_Opus [5.5]", url: "https://phaseo.app/models/anthropic/claude-opus-5-5" }],
			[AUTO, { name: "Auto", url: null }],
		]);
		const answers: ComparedAnswer[] = [
			{ model: LUNA, text: "Luna is faster.", costUsd: 0.0123, error: null },
			{ model: OPUS, text: "", costUsd: 0, error: "model_unavailable" },
			{ model: AUTO, text: "", costUsd: 0.001, error: "empty" },
		];
		expect(comparisonText(answers, names)).toBe([
			"**[GPT-6 Luna](https://phaseo.app/models/openai/gpt-6-luna)** · $0.0123",
			"",
			"Luna is faster.",
			"",
			"**[Claude\\_Opus \\[5.5\\]](https://phaseo.app/models/anthropic/claude-opus-5-5)**",
			"",
			"_This model isn't available right now. Please try again in a few minutes._",
			"",
			"**Auto** · $0.0010",
			"",
			"_No answer: this model used its whole output allowance before writing one._",
		].join("\n"));
		// A model the names don't cover keeps its id.
		expect(comparisonText([{ model: "acme/x", text: "hi", costUsd: 0, error: "skipped" }], new Map())).toBe("**acme/x**\n\n_Not asked: this answer's $0.50 limit was already used._");
	});

	it("cuts long answers so every section fits in one Slack message", () => {
		const names = new Map([[LUNA, { name: "GPT-6 Luna", url: null }], [OPUS, { name: "Claude Opus 5.5", url: null }], [AUTO, { name: "Auto", url: null }]]);
		const long = (model: string): ComparedAnswer => ({ model, text: "x".repeat(20_000), costUsd: 0.01, error: null });
		const text = comparisonText([long(LUNA), long(OPUS), long(AUTO)], names);
		expect(text.length).toBeLessThan(MAX_MARKDOWN_CHARS - 500);
		expect(text.match(/\*\*[^*]+\*\* · \$0\.0100/g)).toHaveLength(3);
		expect(text.match(/x…/g)).toHaveLength(3);
	});

	it("tells each model its answer sits next to others, and passes the admins' instructions", () => {
		const instructions = comparisonInstructions({ instructions: "Answer in French." }, Date.UTC(2026, 9, 27));
		expect(instructions).toContain("shown next to other models' answers");
		expect(instructions).toContain("Today is 2026-10-27 (UTC).");
		expect(instructions).toMatch(/Instructions from this workspace's admins:\nAnswer in French\.$/);
	});
});
