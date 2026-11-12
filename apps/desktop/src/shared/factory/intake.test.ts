import { describe, expect, it } from "vitest";
import { DEMO_SETTINGS } from "./demo";
import { agentForStage, defaultPlaybooks, emptyRule, matchingRule, stageAgentIsFixed, withPlaybookDefaults } from "./intake";
import { emptyStages, stagePrompt } from "./stages";
import type { Playbook, WorkItem } from "./types";

const now = Date.UTC(2026, 9, 21, 18);
const HOUR = 3_600_000;

function item(number: number, patch: Partial<WorkItem> = {}): WorkItem {
	return {
		id: `acme/app#${number}`, source: "github", repo: "acme/app", number, kind: "issue", state: "open", title: `Item ${number}`, body: "",
		author: { login: "maya" }, labels: ["bug"], url: "", createdAt: now - HOUR, updatedAt: now - HOUR, comments: 0,
		priority: "normal", stages: emptyStages(), ...patch,
	};
}

const playbook = (rest: Partial<Playbook> = {}): Playbook => ({ ...defaultPlaybooks().issue, ...rest });

describe("playbooks", () => {
	it("fills in playbooks missing from an older settings file, and drops automatic pickup", () => {
		const playbooks = withPlaybookDefaults({ playbooks: { issue: { instructions: "Be brief.", intake: { enabled: true, agentId: "old" }, fixRounds: 2, rules: [{ id: "a", name: "A", skip: true, stopAfter: "fix" }] } } } as never);
		expect(playbooks.issue.instructions).toBe("Be brief.");
		expect(playbooks.issue.agentId).toBe("old");
		expect(playbooks.issue).not.toHaveProperty("intake");
		expect(playbooks.issue).not.toHaveProperty("fixRounds");
		expect(playbooks.issue.rules[0].match.labels).toEqual([]);
		expect(playbooks.issue.rules[0]).not.toHaveProperty("skip");
		expect(playbooks.pull.stageAgents).toEqual({});
	});
});

describe("rules", () => {
	const docs = { ...emptyRule("docs"), name: "Docs", match: { labels: ["docs"], priorities: [], authors: [] }, agentId: "cheap" };
	const urgent = { ...emptyRule("urgent"), name: "Urgent", match: { labels: [], priorities: ["urgent" as const], authors: [] }, agentId: "best", stageAgents: { review: "reviewer" } };
	const large = { ...emptyRule("large"), name: "Large", match: { labels: [], priorities: [], authors: [], minLines: 500 } };
	const book = playbook({ agentId: "default", rules: [docs, urgent, large], stageAgents: { verify: "checker" } });

	it("uses the first rule that matches", () => {
		expect(matchingRule(item(1, { labels: ["docs"], priority: "urgent" }), book)?.id).toBe("docs");
		expect(matchingRule(item(1, { priority: "urgent" }), book)?.id).toBe("urgent");
		expect(matchingRule(item(1, { kind: "pull", diff: { files: 3, additions: 400, deletions: 200 } }), book)?.id).toBe("large");
		expect(matchingRule(item(1, { kind: "pull", diff: { files: 3, additions: 40, deletions: 20 } }), book)).toBeUndefined();
	});

	it("chooses each stage's agent from the most specific setting", () => {
		const urgentItem = item(1, { priority: "urgent" });
		expect(agentForStage(urgentItem, "review", book)).toBe("reviewer");
		expect(agentForStage(urgentItem, "verify", book)).toBe("checker");
		expect(agentForStage(urgentItem, "fix", book)).toBe("best");
		expect(agentForStage({ ...urgentItem, assigneeId: "mine" }, "fix", book)).toBe("mine");
		expect(agentForStage(item(2), "fix", book)).toBe("default");
		expect(stageAgentIsFixed(urgentItem, "review", book)).toBe(true);
		expect(stageAgentIsFixed(item(2), "review", book)).toBe(false);
	});


	it("puts the playbook's and the rule's instructions into the prompt", () => {
		const pull = DEMO_SETTINGS.playbooks.pull;
		const prompt = stagePrompt(item(9, { kind: "pull", labels: ["dependencies"] }), "review", pull);
		expect(prompt.startsWith("Instructions for every pull request")).toBe(true);
		expect(prompt).toContain("Correctness first");
		expect(prompt).toContain("Read the changelog");
		expect(prompt).toContain(pull.briefs.review);
		expect(stagePrompt(item(9, { kind: "pull" }), "verify", pull)).not.toContain("Read the changelog");
	});
});
