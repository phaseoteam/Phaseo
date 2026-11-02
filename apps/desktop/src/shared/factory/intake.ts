import type { FactorySettings, Playbook, PlaybookRule, RuleMatch, StageId, WorkItem, WorkKind } from "./types";

/** Factory's own fix branches. Pull requests from them already belong to an issue's pipeline. */
export const FACTORY_BRANCH_PREFIX = "factory/";

/** Proof is required, fixes become draft pull requests, and nothing else is posted to GitHub without asking. */
const HANDLING = { requireProof: true, openPullRequest: true, postReports: false, askReporter: true } satisfies Partial<Playbook>;

export function defaultPlaybooks(): Record<WorkKind, Playbook> {
	return {
		issue: { instructions: "", briefs: {}, stageAgents: {}, rules: [], ...HANDLING },
		pull: { instructions: "", briefs: {}, stageAgents: {}, rules: [], ...HANDLING },
	};
}

export function emptyRule(id: string): PlaybookRule {
	return { id, name: "New rule", match: { labels: [], priorities: [], authors: [] }, stageAgents: {}, instructions: "" };
}

/** Fills in anything an older settings file doesn't have yet, and drops what Factory no longer does on its own. */
export function withPlaybookDefaults(settings: Partial<FactorySettings>): Record<WorkKind, Playbook> {
	const defaults = defaultPlaybooks();
	const saved = settings.playbooks as Partial<Record<WorkKind, Partial<Playbook> & { intake?: { agentId?: string }; fixRounds?: number }>> | undefined;
	const merge = (kind: WorkKind): Playbook => {
		const { intake, ...playbook } = saved?.[kind] ?? {};
		delete playbook.fixRounds;
		return {
			...defaults[kind],
			// The agent automatic pickup used becomes the playbook's own.
			agentId: intake?.agentId,
			...playbook,
			rules: (playbook.rules ?? []).map((rule) => {
				const kept: PlaybookRule & { skip?: boolean; stopAfter?: StageId } = { ...emptyRule(rule.id), ...rule, match: { ...emptyRule(rule.id).match, ...rule.match } };
				delete kept.skip;
				delete kept.stopAfter;
				return kept;
			}),
		};
	};
	return { issue: merge("issue"), pull: merge("pull") };
}

const lower = (values: string[]) => values.map((value) => value.trim().toLowerCase()).filter(Boolean);

export function ruleMatches(item: WorkItem, match: RuleMatch): boolean {
	const labels = lower(item.labels);
	const wanted = lower(match.labels);
	if (wanted.length && !wanted.some((label) => labels.includes(label))) return false;
	if (match.priorities.length && !match.priorities.includes(item.priority)) return false;
	if (match.authors.length && !lower(match.authors).includes(item.author.login.toLowerCase())) return false;
	const lines = item.diff ? item.diff.additions + item.diff.deletions : undefined;
	if (match.minLines !== undefined && (lines === undefined || lines < match.minLines)) return false;
	if (match.maxLines !== undefined && (lines === undefined || lines > match.maxLines)) return false;
	return true;
}

/** The first rule in the playbook that matches the item. */
export function matchingRule(item: WorkItem, playbook: Playbook): PlaybookRule | undefined {
	return playbook.rules.find((rule) => ruleMatches(item, rule.match));
}

/**
 * Who runs a stage, most specific first: the matching rule's stage agent, the playbook's stage agent,
 * the item's own agent, then the rule's and the playbook's default.
 */
export function agentForStage(item: WorkItem, stage: StageId, playbook: Playbook): string | undefined {
	const rule = matchingRule(item, playbook);
	return rule?.stageAgents[stage] ?? playbook.stageAgents[stage] ?? item.assigneeId ?? rule?.agentId ?? playbook.agentId;
}

/** Whether the playbook or a rule names the agent for this stage, so independent review shouldn't swap it. */
export function stageAgentIsFixed(item: WorkItem, stage: StageId, playbook: Playbook): boolean {
	return Boolean(matchingRule(item, playbook)?.stageAgents[stage] ?? playbook.stageAgents[stage]);
}

export function instructionsFor(item: WorkItem, playbook: Playbook): string {
	return [playbook.instructions.trim(), matchingRule(item, playbook)?.instructions.trim()].filter(Boolean).join("\n\n");
}
