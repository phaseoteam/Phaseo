import { describe, expect, it } from "vitest";
import type { Connection } from "../shared/types";
import { agentsFor } from "./connections";
import { claudeModels, claudeSignIn, codexModels, codexWindows } from "./models";
import { claudeOptions } from "./claude";
import { commandFor } from "./runner";

// Trimmed from what Claude Code 2.1 and Codex 0.163 answered on this computer.
const CLAUDE = [
	{ value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", description: "Use the default model (currently Opus 5.5) · $4/$20 per Mtok", supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
	{ value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus", description: "Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok", supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
	{ value: "fable", resolvedModel: "claude-fable-5-1", displayName: "Fable", description: "Fable 5.1 · Most capable for your hardest and longest-running tasks · $10/$50 per Mtok", supportedEffortLevels: ["low", "high"] },
	{ value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet", description: "Sonnet 5.5 · Efficient for routine tasks · $2/$10 per Mtok", supportedEffortLevels: ["low", "medium", "high"] },
];
const CODEX = [
	{ id: "gpt-6.1-sol", model: "gpt-6.1-sol", displayName: "GPT-6.1-Sol", description: "Latest workhorse model for coding and everyday work.", hidden: false, isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }, { reasoningEffort: "ultra" }], defaultReasoningEffort: "low" },
	{ id: "gpt-6-astra", model: "gpt-6-astra", displayName: "GPT-6-Astra", description: "Frontier intelligence for the most demanding work.", hidden: false, isDefault: false, supportedReasoningEfforts: [{ reasoningEffort: "medium" }], defaultReasoningEffort: "medium" },
	{ id: "internal", model: "internal", displayName: "Internal", hidden: true },
];
const ready = (id: string, kind: Connection["kind"]): Connection => ({ id, kind, label: id, status: "ready", detail: "", slots: 3 });

describe("model catalog", () => {
	it("names Claude models the way Claude Code describes them, and marks the default once", () => {
		expect(claudeModels(CLAUDE)).toEqual([
			{ id: "opus", label: "Opus 5.5", description: "Best for everyday, complex tasks · $4/$20 per Mtok", efforts: ["low", "medium", "high", "xhigh", "max"], isDefault: true },
			{ id: "fable", label: "Fable 5.1", description: "Most capable for your hardest and longest-running tasks · $10/$50 per Mtok", efforts: ["low", "high"], isDefault: undefined },
			{ id: "sonnet", label: "Sonnet 5.5", description: "Efficient for routine tasks · $2/$10 per Mtok", efforts: ["low", "medium", "high"], isDefault: undefined },
		]);
		// Claude Code on a Team plan: the name is displayName, and pinned versions come by their full id.
		expect(claudeModels([
			{ value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", description: "Opus 5.5 · Best for everyday, complex tasks" },
			{ value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "For complex work and everyday tasks" },
			{ value: "claude-opus-4-8", resolvedModel: "claude-opus-4-8", displayName: "Opus 4.8", description: "Best for everyday, complex tasks" },
		]).map(({ id, label, description }) => ({ id, label, description }))).toEqual([
			{ id: "opus", label: "Opus 5.5", description: "For complex work and everyday tasks" },
			{ id: "claude-opus-4-8", label: "Opus 4.8", description: "Best for everyday, complex tasks" },
		]);
		const agents = agentsFor([ready("claude-cli", "claude-cli")], { claude: [{ id: "claude-opus-4-8", label: "Opus 4.8", efforts: [] }] }, { agentEfforts: {} });
		expect(agents.map((agent) => agent.id)).toEqual(["claude-opus-4-8"]);
	});

	it("keeps Codex's visible models, their effort levels and its default", () => {
		const models = codexModels(CODEX);
		expect(models.map((model) => model.id)).toEqual(["gpt-6.1-sol", "gpt-6-astra"]);
		expect(models[0]).toMatchObject({ label: "GPT-6.1-Sol", efforts: ["low", "high", "ultra"], defaultEffort: "low", isDefault: true });
	});

	it("reads Codex's usage windows", () => {
		expect(codexWindows({ primary: { usedPercent: 3, windowDurationMins: 10_080, resetsAt: 1_793_382_135 }, secondary: { usedPercent: 40, windowDurationMins: 300 } })).toEqual([
			{ label: "Weekly", used: 0.03, resetsAt: 1_793_382_135_000 },
			{ label: "5-hour window", used: 0.4, resetsAt: undefined },
		]);
		expect(codexWindows(undefined)).toEqual([]);
	});

	it("offers one agent per model, keeps the old ids, and applies the chosen effort", () => {
		const agents = agentsFor([ready("claude-cli", "claude-cli"), ready("codex-cli", "codex-cli")], { claude: claudeModels(CLAUDE), codex: codexModels(CODEX) }, { agentEfforts: { "claude-sonnet": "high", "codex-gpt-6-astra": "ultra" } });
		expect(agents.map((agent) => `${agent.id}=${agent.label}`)).toEqual(["claude-opus=Opus 5.5", "claude-fable=Fable 5.1", "claude-sonnet=Sonnet 5.5", "codex-default=GPT-6.1-Sol", "codex-gpt-6-astra=GPT-6-Astra"]);
		expect(agents.find((agent) => agent.id === "claude-sonnet")?.effort).toBe("high");
		// An effort the model doesn't offer is ignored rather than sent.
		expect(agents.find((agent) => agent.id === "codex-gpt-6-astra")?.effort).toBeUndefined();
		expect(agents.find((agent) => agent.id === "codex-default")).toMatchObject({ model: "", efforts: ["low", "high", "ultra"] });
	});

	it("falls back to Opus and Sonnet when Claude Code doesn't say", () => {
		expect(agentsFor([ready("claude-cli", "claude-cli")]).map((agent) => agent.id)).toEqual(["claude-opus", "claude-sonnet"]);
	});

	it("says when Claude isn't running on the plan it's signed in with", () => {
		expect(claudeSignIn({ email: "dan@example.com", subscriptionType: "max", tokenSource: "claude.ai", apiProvider: "firstParty" })).toBe("Uses your Claude Max plan, signed in as dan@example.com");
		expect(claudeSignIn({ tokenSource: "ANTHROPIC_AUTH_TOKEN", apiProvider: "firstParty" })).toBe("Uses ANTHROPIC_AUTH_TOKEN from the environment, not your Claude plan");
		expect(claudeSignIn({ email: "dan@phaseo.app", subscriptionType: "Claude Team", apiProvider: "firstParty" })).toBe("Uses your Claude Team plan, signed in as dan@phaseo.app");
		expect(claudeSignIn({ apiKeySource: "ANTHROPIC_API_KEY" })).toBe("Uses an API key from ANTHROPIC_API_KEY, not a Claude plan");
	});

	it("passes the effort to each tool", () => {
		const [sonnet, , astra] = [
			{ id: "claude-sonnet", harness: "claude" as const, label: "Sonnet 5.5", model: "sonnet", billing: "subscription" as const, connectionId: "claude-cli", effort: "high" },
			null,
			{ id: "codex-gpt-6-astra", harness: "codex" as const, label: "GPT-6-Astra", model: "gpt-6-astra", billing: "subscription" as const, connectionId: "codex-cli", effort: "xhigh" },
		];
		expect(claudeOptions(sonnet, "fix")).toMatchObject({ model: "sonnet", effort: "high" });
		expect(commandFor(astra!, "fix").args.join(" ")).toContain("--model gpt-6-astra -c model_reasoning_effort=xhigh");
		expect(() => claudeOptions({ ...sonnet, effort: "high; rm -rf /" }, "fix")).toThrow(/Unsupported effort/);
		expect(() => commandFor({ ...astra!, effort: "high; rm -rf /" }, "fix")).toThrow(/Unsupported effort/);
	});
});
