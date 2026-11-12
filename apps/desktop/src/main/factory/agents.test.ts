import { describe, expect, it } from "vitest";
import type { Account, ModelOption } from "../../shared/workspace";
import type { AgentProfile } from "../../shared/factory/types";
import { agentFor, agentId, discoverAgents, effortSettings, legacyAgent, parseAgentId } from "./agents";

const account = (id: string, harness: Account["harness"], extra: Partial<Account> = {}): Account => ({ id, name: `${harness} ${id}`, harness, kind: harness === "phaseo" ? "api" : "native", configured: true, ...extra });
const codexModel: ModelOption = { id: "gpt-6.1", name: "GPT-6.1", reasoningEfforts: [{ id: "low", description: "" }, { id: "high", description: "" }], defaultReasoningEffort: "low", default: true };
const claudeModel: ModelOption = { id: "claude-opus-5-5", name: "Claude Opus 5.5", options: [{ id: "effort", label: "Reasoning", type: "select", options: [{ id: "medium", label: "Medium", isDefault: true }, { id: "max", label: "Max" }] }, { id: "fastMode", label: "Fast", type: "boolean" }] };

describe("Factory agents", () => {
	it("names an agent by harness, account and model, and reads the name back", () => {
		expect(agentId("phaseo", "acc-1", "anthropic/claude-opus-5-5")).toBe("phaseo:acc-1:anthropic/claude-opus-5-5");
		expect(parseAgentId("phaseo:acc-1:anthropic/claude:opus")).toEqual({ harness: "phaseo", accountId: "acc-1", model: "anthropic/claude:opus" });
		expect(parseAgentId("codex:default:gpt-6.1")).toEqual({ harness: "codex", model: "gpt-6.1" });
		expect(parseAgentId("claude-opus")).toBeNull();
	});

	it("maps an item's effort to the setting the composer uses for each harness", () => {
		const codex = agentFor("codex", undefined, codexModel), claude = agentFor("claude", account("work", "claude"), claudeModel);
		expect(codex).toMatchObject({ id: "codex:default:gpt-6.1", efforts: ["low", "high"], defaultEffort: "low", effortSetting: "reasoningEffort", billing: "subscription", isDefault: true });
		expect(claude).toMatchObject({ id: "claude:work:claude-opus-5-5", accountName: "claude work", efforts: ["medium", "max"], defaultEffort: "medium", effortSetting: "effort" });
		expect(effortSettings({ ...codex, effort: "high" })).toEqual({ reasoningEffort: "high" });
		expect(effortSettings({ ...claude, effort: "max" })).toEqual({ modelOptions: { effort: "max" } });
		// A level the model doesn't take, or none, leaves the harness on its own.
		expect(effortSettings({ ...claude, effort: "xhigh" })).toEqual({});
		expect(effortSettings(codex)).toEqual({});
		expect(agentFor("phaseo", account("p", "phaseo"), { id: "openai/gpt-6.1", name: "GPT-6.1" }).billing).toBe("api");
	});

	it("offers every usable account's models, Phaseo only on an account, and skips harnesses that aren't installed", async () => {
		const asked: string[] = [];
		const agents = await discoverAgents({
			accounts: () => [account("p1", "phaseo"), account("old", "phaseo", { archived: true }), account("expired", "phaseo", { oauthExpiresAt: "2000-01-01T00:00:00Z" })],
			discoverInstallations: async () => [{ harness: "pi", installed: false }],
			discoverModels: async (harness, accountId) => {
				asked.push(`${harness}:${accountId ?? "default"}`);
				if (harness === "codex") return [codexModel, { id: "gpt-old", name: "Old", legacy: true }, { id: "default", name: "Default" }];
				if (harness === "phaseo") return [{ id: "openai/gpt-6.1", name: "GPT-6.1" }];
				if (harness === "grok") throw new Error("Not signed in");
				return [];
			},
		});
		expect(asked.toSorted()).toEqual(["claude:default", "codex:default", "cursor:default", "grok:default", "opencode:default", "phaseo:p1"].filter(value => value !== "cursor:default").toSorted());
		expect(agents.map(agent => agent.id)).toEqual(["codex:default:gpt-6.1", "phaseo:p1:openai/gpt-6.1"]);
	});

	it("matches the old app's agent ids by harness and model, else leaves them unassigned", () => {
		const agents: AgentProfile[] = [
			agentFor("claude", account("work", "claude"), claudeModel),
			agentFor("claude", undefined, claudeModel),
			agentFor("claude", undefined, { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" }),
			agentFor("codex", undefined, codexModel),
			agentFor("codex", undefined, { id: "gpt-6.1-codex", name: "GPT-6.1 Codex" }),
		];
		expect(legacyAgent("claude-opus", agents)).toBe("claude:default:claude-opus-5-5");
		expect(legacyAgent("claude-sonnet-5-5", agents)).toBe("claude:default:claude-sonnet-5-5");
		expect(legacyAgent("hub-sonnet-5-5", agents)).toBe("claude:default:claude-sonnet-5-5");
		expect(legacyAgent("codex-default", agents)).toBe("codex:default:gpt-6.1");
		expect(legacyAgent("codex-gpt-6.1-codex", agents)).toBe("codex:default:gpt-6.1-codex");
		expect(legacyAgent("hub-codex-gpt-6.1", agents)).toBe("codex:default:gpt-6.1");
		expect(legacyAgent("claude-haiku", agents)).toBeUndefined();
		expect(legacyAgent("phaseo-auto", agents)).toBeUndefined();
		expect(legacyAgent("codex:default:gpt-6.1", agents)).toBe("codex:default:gpt-6.1");
	});
});
