import { emptyStages } from "./stages";
import { proofKind } from "./report";
import type { AgentProfile, Connection, FactorySettings, LogLine, ProofFile, RepoNote, RepoStatus, Run, RunReport, StageId, StageState, WorkItem } from "./types";

/** Fixture data for screenshots and the first run before GitHub is connected. */

const MIN = 60_000;
const HOUR = 60 * MIN;

export const DEMO_AGENTS: AgentProfile[] = [
	{ id: "claude-opus", harness: "claude", label: "Opus 5.5", model: "claude-opus-5-5", billing: "subscription", connectionId: "claude-cli" },
	{ id: "claude-sonnet", harness: "claude", label: "Sonnet 5.5", model: "claude-sonnet-5-5", billing: "subscription", connectionId: "claude-cli" },
	{ id: "codex-gpt", harness: "codex", label: "GPT-5.5 Codex", model: "gpt-5.5-codex", billing: "subscription", connectionId: "codex-cli" },
	{ id: "hub-sonnet", harness: "claude", label: "Sonnet 5.5", model: "claude-sonnet-5-5", billing: "hub", connectionId: "hub" },
	{ id: "phaseo-auto", harness: "phaseo", label: "Phaseo Auto", model: "phaseo/auto", billing: "api", connectionId: "phaseo" },
];

export function demoConnections(now: number): Connection[] {
	return [
		{ id: "claude-cli", kind: "claude-cli", label: "Claude Code", status: "ready", detail: "Signed in with Claude Max", version: "2.4.12", slots: 4, windows: [{ label: "5-hour window", used: 0.62, resetsAt: now + 2 * HOUR + 14 * MIN }, { label: "Weekly", used: 0.31, resetsAt: now + 3 * 24 * HOUR }] },
		{ id: "codex-cli", kind: "codex-cli", label: "Codex", status: "ready", detail: "Signed in with ChatGPT Pro", version: "0.162.1", slots: 4, windows: [{ label: "5-hour window", used: 0.18, resetsAt: now + 4 * HOUR }, { label: "Weekly", used: 0.44, resetsAt: now + 5 * 24 * HOUR }] },
		{ id: "hub", kind: "hub", label: "CLI proxy hub", status: "ready", detail: "3 accounts pooled", baseUrl: "http://127.0.0.1:8317", slots: 8 },
		{ id: "phaseo", kind: "phaseo", label: "Phaseo API", status: "off", detail: "Add a key to run on pay-as-you-go credits", slots: 16 },
	];
}

const DEMO_REPO = "phaseo-app/phaseo";
const SKILLS_REPO = "phaseo-app/skills";

export const DEMO_SETTINGS: FactorySettings = {
	repos: [{ repo: DEMO_REPO, path: "E:/phaseo", addedAt: 0 }, { repo: SKILLS_REPO, path: "E:/skills", addedAt: 0 }],
	showRepo: "",
	hubUrl: "http://127.0.0.1:8317",
	independentReview: true,
	agentEfforts: {},
	pollMinutes: 2,
	playbooks: {
		issue: {
			agentId: "claude-sonnet",
			stageAgents: { triage: "claude-sonnet", review: "codex-gpt", verify: "codex-gpt" },
			rules: [
				{
					id: "billing", name: "Billing", match: { labels: ["billing"], priorities: ["urgent", "high"], authors: [] },
					agentId: "claude-opus", stageAgents: { triage: "claude-opus" },
					instructions: "Money paths: add tests with decimal strings, zero and very large amounts. Never round before summing.",
				},
				{
					id: "docs", name: "Docs", match: { labels: ["docs"], priorities: [], authors: [] },
					agentId: "hub-sonnet", stageAgents: {},
					instructions: "Docs live in apps/docs. Change every locale the page exists in, then run pnpm docs:links.",
				},
			],
			instructions: [
				"Read AGENTS.md first and use its build and test commands.",
				"Keep the fix to the smallest change that closes the issue. No drive-by refactors.",
				"SQL changes ship as a new migration. Never edit one that has already been applied.",
				"Money is shown in US format: $12.50, never US$12.50.",
				"Open a draft pull request that says what changed, why, how, and what you ran.",
			].join("\n"),
			briefs: {},
			requireProof: true,
			openPullRequest: true,
			postReports: false,
			askReporter: true,
		},
		pull: {
			agentId: "codex-gpt",
			stageAgents: { verify: "codex-gpt" },
			rules: [
				{
					id: "deps", name: "Dependency updates", match: { labels: ["dependencies"], priorities: [], authors: [] },
					agentId: "hub-sonnet", stageAgents: {}, instructions: "Read the changelog between the two versions and list anything this repository uses that changed.",
				},
				{
					id: "large", name: "Large changes", match: { labels: [], priorities: [], authors: [], minLines: 800 },
					agentId: "claude-opus", stageAgents: { review: "claude-opus" }, instructions: "Large diff: review file by file and say which files you didn't get to.",
				},
			],
			instructions: [
				"Correctness first: wrong results, lost data and billing errors. Style comes last, if at all.",
				"Check that new logic has tests and that migrations only add.",
				"Say \"No findings\" plainly when there are none.",
			].join("\n"),
			briefs: {
				review: "Review the diff against its base. Report each finding with the file, the line and a concrete input that breaks it, most severe first. Leave out anything you can't show failing. Do not change any files.",
			},
			requireProof: true,
			openPullRequest: true,
			postReports: false,
			askReporter: false,
		},
	},
	theme: "system",
};

type StagePlan = Partial<Record<StageId, StageState>>;

interface ItemSeed {
	/** Defaults to the main demo repository. */
	repo?: string;
	number: number;
	kind: WorkItem["kind"];
	state?: WorkItem["state"];
	title: string;
	labels: string[];
	author: string;
	ageHours: number;
	priority?: WorkItem["priority"];
	assigneeId?: string;
	stages?: StagePlan;
	branch?: string;
	linked?: number;
	comments?: number;
	diff?: WorkItem["diff"];
	checks?: WorkItem["checks"];
	body?: string;
	loggedHere?: boolean;
	attachments?: WorkItem["attachments"];
}

const done = (agentId: string, summary: string, startedAgo: number, minutes: number, now: number): StageState => ({ status: "done", agentId, summary, startedAt: now - startedAgo, finishedAt: now - startedAgo + minutes * MIN });

const ISSUE_BODY = `## What happens

Weekly token totals on the usage page show 0 for every workspace, even though requests are billed and appear in Logs.

## Steps

1. Send a few requests with any key.
2. Open Usage → Tokens and pick "This week".
3. The chart and the total both read 0.

## Expected

The weekly total matches the sum of \`usage.total_tokens\` across the week's requests.

## Notes

\`gateway_usage_total_tokens\` reads usage values as integers, but some providers report them as decimal strings such as \`"1532.0"\`, and the cast fails silently.`;

export function demoItems(now: number): WorkItem[] {
	const seeds: ItemSeed[] = [
		{
			number: 3131, kind: "issue", title: "Weekly token totals read 0 when usage values are decimal strings", labels: ["bug", "billing"], author: "danielbutler", ageHours: 5, priority: "urgent", assigneeId: "claude-opus", comments: 3, branch: "factory/3131-usage-decimals", body: ISSUE_BODY,
			stages: {
				triage: { ...done("claude-sonnet", "Real bug: the rollup casts text to bigint. One SQL function and its test.", 4 * HOUR, 3, now), runId: "run-3131-triage" },
				reproduce: { ...done("claude-opus", "Added a PGlite test that sends \"1532.0\" and gets 0 back, and caught the usage page reading 0.", 3.6 * HOUR, 9, now), runId: "run-3131-reproduce" },
				fix: { status: "running", agentId: "claude-opus", runId: "run-3131-fix", startedAt: now - 6 * MIN },
			},
		},
		{
			number: 3128, kind: "pull", title: "fix(gateway): keep reasoning items when a stream ends early", labels: ["gateway"], author: "danielbutler", ageHours: 9, assigneeId: "codex-gpt", branch: "fix/reasoning-stream-end", linked: 3119, comments: 6, diff: { files: 7, additions: 214, deletions: 38 }, checks: { passed: 14, failed: 1, pending: 0 },
			stages: {
				review: { status: "needs-you", agentId: "codex-gpt", runId: "run-3128-review", summary: "2 findings: a dropped item on retry and a missing test for empty deltas.", startedAt: now - 2 * HOUR, finishedAt: now - 1.7 * HOUR },
			},
		},
		{
			number: 3125, kind: "issue", title: "Anthropic snippets in the docs point at /v1/v1/messages", labels: ["bug", "docs"], author: "maya-k", ageHours: 20, priority: "high", assigneeId: "claude-sonnet",
			stages: {
				triage: done("claude-sonnet", "Docs-only: 14 snippets across 9 locales build the base URL twice.", 6 * HOUR, 2, now),
				reproduce: { status: "skipped", summary: "Docs change, nothing to reproduce." },
				fix: { status: "queued", agentId: "claude-sonnet" },
			},
		},
		{
			number: 3122, kind: "issue", title: "Role \"system\" messages are rejected on the Messages endpoint", labels: ["bug", "gateway"], author: "jonas", ageHours: 26, priority: "high", assigneeId: "codex-gpt",
			stages: {
				triage: done("codex-gpt", "Schema rejects role system; upstream accepts it when hoisted to the system field.", 20 * HOUR, 4, now),
				reproduce: { status: "needs-you", agentId: "codex-gpt", runId: "run-3122-reproduce", summary: "Couldn't make it fail on main: the rejection only happens with the strict schema flag on.", startedAt: now - 19 * HOUR, finishedAt: now - 18.8 * HOUR },
			},
		},
		{
			number: 3120, kind: "pull", title: "feat(web): presets keep prompt template versions", labels: ["web", "presets"], author: "priya", ageHours: 30, assigneeId: "claude-opus", branch: "feat/preset-versions", comments: 2, diff: { files: 18, additions: 902, deletions: 120 }, checks: { passed: 9, failed: 0, pending: 5 },
			stages: { review: { status: "running", agentId: "claude-opus", startedAt: now - 3 * MIN } },
		},
		{
			number: 3133, kind: "pull", state: "draft", title: "Billing page shows US$12.50 instead of $12.50", labels: ["bug", "web"], author: "danielbutler", ageHours: 1.2, assigneeId: "claude-opus", branch: "factory/3126-billing-us-dollars", linked: 3126, comments: 0, diff: { files: 3, additions: 46, deletions: 9 }, checks: { passed: 15, failed: 0, pending: 0 },
			stages: {
				fix: { status: "done", agentId: "claude-opus" },
				review: { ...done("codex-gpt", "No findings. The formatter change is covered for en-GB, en-US and de-DE.", 1.1 * HOUR, 7, now), runId: "run-3133-review" },
				verify: { ...done("codex-gpt", "The billing page shows $12.50 under en-GB; tests and typecheck pass.", 0.9 * HOUR, 12, now), runId: "run-3133-verify" },
			},
		},
		{
			number: 3126, kind: "issue", title: "Billing page shows US$12.50 instead of $12.50", labels: ["bug", "web"], author: "maya-k", ageHours: 3, priority: "normal", assigneeId: "claude-opus", linked: 3133, branch: "factory/3126-billing-us-dollars",
			stages: {
				triage: done("claude-sonnet", "Real bug: formatMoney passes the page locale to Intl, and en-GB prints US$.", 2.7 * HOUR, 2, now),
				reproduce: { ...done("claude-opus", "A formatter test for en-GB fails with US$12.50, and the billing page shows it.", 2.5 * HOUR, 8, now), runId: "run-3126-reproduce" },
				fix: { ...done("claude-opus", "Money is always formatted en-US; the test passes and the page shows $12.50.", 2.2 * HOUR, 14, now), runId: "run-3126-fix" },
			},
		},
		{
			number: 3117, kind: "issue", title: "Compare page shows \"Compare 1 Providers\" in the title", labels: ["bug", "web"], author: "danielbutler", ageHours: 40, priority: "low", loggedHere: true,
			attachments: [{ name: "image-1.png", type: "image/png", bytes: 184_220 }, { name: "image-2.png", type: "image/png", bytes: 96_512 }],
			body: "Comparing a single model's providers titles the page \"Compare 1 Providers\". It should read \"Compare 1 provider\".\n\n2 images attached in Phaseo Factory: image-1.png, image-2.png.\n\n## Done when\n\n- [ ] One provider reads \"Compare 1 provider\"\n- [ ] Two or more still read \"Compare 2 providers\"",
			stages: {},
		},
		{
			number: 3114, kind: "issue", title: "Gemini Live sessions never send session.ended after a revoke", labels: ["bug", "realtime"], author: "sam-r", ageHours: 46, priority: "normal", assigneeId: "claude-sonnet",
			stages: { triage: { status: "queued", agentId: "claude-sonnet" } },
		},
		{
			number: 3110, kind: "issue", title: "Mobile: money shows US$ under en-GB", labels: ["mobile"], author: "danielbutler", ageHours: 52, priority: "normal",
			stages: {},
		},
		{
			number: 3107, kind: "pull", title: "chore(deps): bump vite to 8.0.18", labels: ["dependencies"], author: "dependabot", ageHours: 60, assigneeId: "hub-sonnet", diff: { files: 3, additions: 41, deletions: 41 }, checks: { passed: 15, failed: 0, pending: 0 },
			stages: { review: done("hub-sonnet", "Patch bump, no API changes used here.", 50 * HOUR, 2, now), verify: done("codex-gpt", "Build, typecheck and 1,525 tests pass.", 49 * HOUR, 11, now) },
		},
		{
			number: 3101, kind: "issue", state: "closed", title: "Batch results lose metadata when a row has no custom_id", labels: ["bug", "batches"], author: "jonas", ageHours: 90, assigneeId: "claude-opus", linked: 3104, branch: "factory/3101-batch-metadata",
			stages: {
				triage: done("claude-sonnet", "Rows without custom_id fall through the map.", 80 * HOUR, 2, now),
				reproduce: done("claude-opus", "Failing test with two anonymous rows.", 79 * HOUR, 6, now),
				fix: done("claude-opus", "Key rows by position when custom_id is missing. Opened #3104.", 78 * HOUR, 14, now),
			},
		},
		{
			number: 3098, kind: "pull", state: "merged", title: "fix(api): page /v1/models past 1,000 rows", labels: ["gateway"], author: "danielbutler", ageHours: 110, assigneeId: "codex-gpt", diff: { files: 4, additions: 88, deletions: 12 }, checks: { passed: 15, failed: 0, pending: 0 },
			stages: { review: done("claude-opus", "One nit, fixed.", 100 * HOUR, 6, now), verify: done("codex-gpt", "570 models live after deploy.", 99 * HOUR, 8, now) },
		},
		{
			repo: SKILLS_REPO, number: 14, kind: "issue", title: "phaseo-gateway skill still documents x-api-key auth", labels: ["bug", "docs"], author: "danielbutler", ageHours: 4, priority: "high", assigneeId: "claude-sonnet",
			stages: { triage: done("claude-sonnet", "Real: three references still show x-api-key; the gateway only takes Bearer.", 0.35 * HOUR, 2, now), reproduce: { status: "running", agentId: "claude-sonnet", startedAt: now - 3 * MIN } },
		},
		{
			repo: SKILLS_REPO, number: 12, kind: "issue", title: "Add a skill for routing presets with fallbacks", labels: ["enhancement"], author: "maya-k", ageHours: 30, priority: "normal",
			stages: {},
		},
		{
			repo: SKILLS_REPO, number: 11, kind: "pull", title: "chore(deps): bump yaml to 2.9.1", labels: ["dependencies"], author: "dependabot", ageHours: 20, assigneeId: "hub-sonnet", diff: { files: 2, additions: 9, deletions: 9 }, checks: { passed: 4, failed: 0, pending: 0 },
			stages: { review: { status: "needs-you", agentId: "hub-sonnet", summary: "yaml 2.9 drops Node 18; the CI matrix still runs it.", startedAt: now - 2 * HOUR, finishedAt: now - 1.8 * HOUR } },
		},
	];

	return seeds.map((seed) => ({
		id: `${seed.repo ?? DEMO_REPO}#${seed.number}`,
		source: "github",
		repo: seed.repo ?? DEMO_REPO,
		number: seed.number,
		kind: seed.kind,
		state: seed.state ?? "open",
		title: seed.title,
		body: seed.body ?? `## Context\n\n${seed.title}.\n\nSee the linked discussion for the full report.`,
		author: { login: seed.author },
		labels: seed.labels,
		url: `https://github.com/${seed.repo ?? DEMO_REPO}/${seed.kind === "pull" ? "pull" : "issues"}/${seed.number}`,
		createdAt: now - seed.ageHours * HOUR,
		updatedAt: now - seed.ageHours * HOUR * 0.3,
		comments: seed.comments ?? 0,
		branch: seed.branch,
		linked: seed.linked,
		assigneeId: seed.assigneeId,
		priority: seed.priority ?? "normal",
		stages: { ...emptyStages(), ...seed.stages },
		diff: seed.diff,
		checks: seed.checks,
		loggedHere: seed.loggedHere,
		attachments: seed.attachments,
	}));
}

const FIX_LOG: [number, LogLine["kind"], string][] = [
	[0, "info", "Worktree ready at factory/3131-usage-decimals from origin/main"],
	[4, "text", "The failing test from Reproduce is in supabase/tests/usage-rollup-decimals.test.mjs. Reading the rollup function."],
	[9, "tool", "Read supabase/schemas/public/functions/gateway_usage_total_tokens.sql"],
	[14, "tool", "Grep \"::bigint\" in supabase/schemas/public/functions"],
	[21, "text", "Three casts read usage values as bigint. Decimal strings like \"1532.0\" fail the cast and the COALESCE turns them into 0."],
	[30, "tool", "Edit gateway_usage_total_tokens.sql (+6 −3)"],
	[38, "tool", "Write supabase/migrations/20261021190000_usage_total_tokens_decimals.sql"],
	[52, "tool", "Run node supabase/tests/usage-rollup-decimals.test.mjs"],
	[71, "result", "1 passed"],
	[86, "you", "Also check the cost rollup: I think it reads the same column with the same cast."],
	[92, "text", "Good catch: gateway_usage_cost has the same ::bigint cast. Fixing both, and adding a cost case to the test."],
	[98, "tool", "Edit gateway_usage_cost.sql (+4 −2)"],
	[104, "tool", "Run node supabase/tests/usage-rollup-decimals.test.mjs > .factory/proof/run-3131-fix/after-test.log"],
];

export function demoRuns(now: number): Run[] {
	const started = now - 6 * MIN;
	return [
		{
			id: "run-3131-fix",
			itemId: `${DEMO_REPO}#3131`,
			stage: "fix",
			agentId: "claude-opus",
			status: "running",
			startedAt: started,
			worktree: "E:/phaseo-factory/worktrees/3131-fix",
			branch: "factory/3131-usage-decimals",
			log: FIX_LOG.map(([seconds, kind, text]) => ({ at: started + seconds * 4_000, kind, text })),
			usage: { inputTokens: 184_220, outputTokens: 6_410 },
		},
		{
			id: "run-3131-reproduce",
			itemId: `${DEMO_REPO}#3131`,
			stage: "reproduce",
			agentId: "claude-opus",
			status: "succeeded",
			startedAt: now - 3.6 * HOUR,
			finishedAt: now - 3.6 * HOUR + 9 * MIN,
			log: [{ at: now - 3.6 * HOUR, kind: "result", text: "Summary: Added a PGlite test that sends \"1532.0\" and gets 0 back." }],
			usage: { inputTokens: 96_400, outputTokens: 3_120 },
			summary: "Added a PGlite test that sends \"1532.0\" and gets 0 back, and caught the usage page reading 0.",
			report: report({
				summary: "Added a PGlite test that sends \"1532.0\" and gets 0 back, and caught the usage page reading 0.",
				verdict: "Reproduced",
				notes: ["`node supabase/tests/usage-rollup-decimals.test.mjs`: 1 failed, expected 1532 and got 0"],
				files: [["usage-week-zero.png", "Usage → Tokens → This week reads 0 after 3 requests with decimal usage"], ["failing-test.log", "The new test failing on main"]],
			}),
		},
		{
			id: "run-3131-triage",
			itemId: `${DEMO_REPO}#3131`,
			stage: "triage",
			agentId: "claude-sonnet",
			status: "succeeded",
			startedAt: now - 4 * HOUR,
			finishedAt: now - 4 * HOUR + 3 * MIN,
			log: [],
			usage: { inputTokens: 41_800, outputTokens: 1_240 },
			summary: "Real bug: the rollup casts text to bigint. One SQL function and its test.",
			report: report({ summary: "Real bug: the rollup casts text to bigint. One SQL function and its test.", verdict: "Bug", notes: ["gateway_usage_total_tokens.sql:41 casts usage->>'total_tokens' to bigint; \"1532.0\" fails the cast and COALESCE makes it 0"] }),
		},
		{
			id: "run-3120-review",
			itemId: `${DEMO_REPO}#3120`,
			stage: "review",
			agentId: "claude-opus",
			status: "running",
			startedAt: now - 3 * MIN,
			log: [{ at: now - 3 * MIN, kind: "info", text: "Reviewing 18 files against main" }, { at: now - 2 * MIN, kind: "tool", text: "Read apps/web/src/lib/presets/versions.ts" }],
			usage: { inputTokens: 72_000, outputTokens: 900 },
		},
		{
			id: "run-3128-review",
			itemId: `${DEMO_REPO}#3128`,
			stage: "review",
			agentId: "codex-gpt",
			status: "succeeded",
			startedAt: now - 2 * HOUR,
			finishedAt: now - 1.7 * HOUR,
			log: [],
			usage: { inputTokens: 120_000, outputTokens: 4_800 },
			summary: "2 findings: a dropped item on retry and a missing test for empty deltas.",
			report: report({
				summary: "2 findings: a dropped item on retry and a missing test for empty deltas.",
				verdict: "Findings",
				risk: { level: "high", why: "Changes how every streamed response is rebuilt after a retry" },
				notes: [
					"stream-end.ts:88: a retry after an early end rebuilds the item list from the second attempt only, so the first reasoning item is lost",
					"No test covers a stream whose last delta is empty; `pnpm vitest run stream-end` passes with the guard on line 61 removed",
				],
				files: [["retry-drops-item.log", "A two-attempt stream returning 1 reasoning item instead of 2"]],
				text: "1. stream-end.ts:88 drops the first attempt's reasoning item on retry.\n2. Missing test for an empty last delta.",
			}),
		},
		{
			id: "run-3122-reproduce",
			itemId: `${DEMO_REPO}#3122`,
			stage: "reproduce",
			agentId: "codex-gpt",
			status: "failed",
			startedAt: now - 19 * HOUR,
			finishedAt: now - 18.8 * HOUR,
			log: [],
			usage: { inputTokens: 64_000, outputTokens: 2_200 },
			summary: "Couldn't make it fail on main: the rejection only happens with the strict schema flag on.",
			report: report({
				summary: "Couldn't make it fail on main: the rejection only happens with the strict schema flag on.",
				verdict: "Could not reproduce",
				notes: ["`pnpm vitest run messages-roles`: the new test passes on main", "With GATEWAY_STRICT_SCHEMA=1 the same request returns 400 invalid_role"],
				files: [["strict-schema.log", "The request accepted by default and rejected with the flag on"]],
			}),
		},
		{
			id: "run-3133-verify",
			itemId: `${DEMO_REPO}#3133`,
			stage: "verify",
			agentId: "codex-gpt",
			status: "succeeded",
			startedAt: now - 0.9 * HOUR,
			finishedAt: now - 0.9 * HOUR + 12 * MIN,
			log: [],
			usage: { inputTokens: 88_000, outputTokens: 2_900 },
			summary: "The billing page shows $12.50 under en-GB; tests and typecheck pass.",
			report: report({
				summary: "The billing page shows $12.50 under en-GB; tests and typecheck pass.",
				verdict: "Passed",
				notes: ["`pnpm --filter @phaseo/web test format-money`: 6 passed", "`pnpm --filter @phaseo/web typecheck`: no errors"],
				files: [["before-billing-page.png", "main, en-GB: the October total reads US$12.50"], ["after-billing-page.png", "This branch, en-GB: the same total reads $12.50"], ["verify-tests.log", "Formatter tests and typecheck"]],
			}),
		},
		{
			id: "run-3126-fix",
			itemId: `${DEMO_REPO}#3126`,
			stage: "fix",
			agentId: "claude-opus",
			status: "succeeded",
			startedAt: now - 2.2 * HOUR,
			finishedAt: now - 2.2 * HOUR + 14 * MIN,
			branch: "factory/3126-billing-us-dollars",
			log: [{ at: now - 2.2 * HOUR + 14 * MIN, kind: "result", text: "Opened draft pull request #3133" }],
			usage: { inputTokens: 131_000, outputTokens: 5_400 },
			summary: "Money is always formatted en-US; the test passes and the page shows $12.50.",
			report: report({
				summary: "Money is always formatted en-US; the test passes and the page shows $12.50.",
				verdict: "Fixed",
				notes: ["`pnpm --filter @phaseo/web test format-money`: 6 passed, including the en-GB case from Reproduce", "`pnpm --filter @phaseo/web typecheck`: no errors"],
				files: [["after-billing-page.png", "en-GB, the October total now reads $12.50"]],
			}),
		},
		{
			id: "run-3126-reproduce",
			itemId: `${DEMO_REPO}#3126`,
			stage: "reproduce",
			agentId: "claude-opus",
			status: "succeeded",
			startedAt: now - 2.5 * HOUR,
			finishedAt: now - 2.5 * HOUR + 8 * MIN,
			log: [],
			usage: { inputTokens: 74_000, outputTokens: 2_600 },
			summary: "A formatter test for en-GB fails with US$12.50, and the billing page shows it.",
			report: report({
				summary: "A formatter test for en-GB fails with US$12.50, and the billing page shows it.",
				verdict: "Reproduced",
				notes: ["`pnpm --filter @phaseo/web test format-money`: 1 failed, expected $12.50 and got US$12.50"],
				files: [["before-billing-page.png", "en-GB, the October total reads US$12.50"]],
			}),
		},
		{
			id: "run-3133-review",
			itemId: `${DEMO_REPO}#3133`,
			stage: "review",
			agentId: "codex-gpt",
			status: "succeeded",
			startedAt: now - 1.1 * HOUR,
			finishedAt: now - 1.1 * HOUR + 7 * MIN,
			log: [],
			usage: { inputTokens: 52_000, outputTokens: 1_100 },
			summary: "No findings. The formatter change is covered for en-GB, en-US and de-DE.",
			report: { ...report({ summary: "No findings. The formatter change is covered for en-GB, en-US and de-DE.", verdict: "No findings" }), risk: { level: "low", why: "Three files, one formatter, tested in three locales" } },
			outcome: { kind: "success" },
		},
	];
}

function report(input: { summary: string; verdict: string; notes?: string[]; files?: [string, string][]; text?: string; risk?: RunReport["risk"] }): RunReport {
	const files: ProofFile[] = (input.files ?? []).map(([name, caption]) => ({ name, caption, kind: proofKind(name), bytes: name.endsWith(".png") ? 184_000 : 2_400 }));
	return { summary: input.summary, verdict: input.verdict, notes: input.notes ?? [], files, text: input.text, risk: input.risk };
}

/** A browser window with a page in it, drawn as SVG, standing in for a real screenshot. */
function page(title: string, body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800" font-family="Inter, Segoe UI, sans-serif">
<rect width="1280" height="800" fill="#ffffff"/>
<rect width="1280" height="44" fill="#f4f4f5"/>
<circle cx="24" cy="22" r="6" fill="#d4d4d8"/><circle cx="44" cy="22" r="6" fill="#d4d4d8"/><circle cx="64" cy="22" r="6" fill="#d4d4d8"/>
<rect x="320" y="10" width="640" height="24" rx="6" fill="#ffffff" stroke="#e4e4e7"/>
<text x="640" y="27" font-size="13" fill="#71717a" text-anchor="middle">localhost:3000/settings/${title.toLowerCase()}</text>
<rect x="0" y="44" width="240" height="756" fill="#fafafa"/><line x1="240" y1="44" x2="240" y2="800" stroke="#e4e4e7"/>
<text x="32" y="92" font-size="15" font-weight="700" fill="#09090b">Phaseo</text>
<text x="32" y="140" font-size="14" fill="#52525b">Overview</text><text x="32" y="172" font-size="14" fill="#52525b">Logs</text>
<text x="32" y="204" font-size="14" fill="${title === "Usage" ? "#09090b" : "#52525b"}" font-weight="${title === "Usage" ? 600 : 400}">Usage</text>
<text x="32" y="236" font-size="14" fill="${title === "Billing" ? "#09090b" : "#52525b"}" font-weight="${title === "Billing" ? 600 : 400}">Billing</text>
<text x="296" y="112" font-size="30" font-weight="700" fill="#09090b">${title}</text>
${body}
</svg>`;
}

function billing(total: string, good: boolean): string {
	const rows = [["Gateway requests", "Oct 1 – Oct 21", "$9.80"], ["Web search", "Oct 1 – Oct 21", "$2.70"]];
	const tone = good ? "#16a34a" : "#dc2626";
	return page("Billing", `<text x="296" y="148" font-size="15" fill="#71717a">October invoice · en-GB</text>
<rect x="296" y="180" width="920" height="300" rx="8" fill="none" stroke="#e4e4e7"/>
<text x="320" y="216" font-size="13" fill="#71717a">Item</text><text x="680" y="216" font-size="13" fill="#71717a">Period</text><text x="1192" y="216" font-size="13" fill="#71717a" text-anchor="end">Amount</text>
${rows.map(([item, period], index) => `<line x1="296" y1="${236 + index * 64}" x2="1216" y2="${236 + index * 64}" stroke="#f4f4f5"/><text x="320" y="${274 + index * 64}" font-size="15" fill="#09090b">${item}</text><text x="680" y="${274 + index * 64}" font-size="15" fill="#52525b">${period}</text><text x="1192" y="${274 + index * 64}" font-size="15" fill="#09090b" text-anchor="end">${good ? rows[index][2] : rows[index][2].replace("$", "US$")}</text>`).join("")}
<line x1="296" y1="364" x2="1216" y2="364" stroke="#e4e4e7"/>
<text x="320" y="420" font-size="18" font-weight="700" fill="#09090b">Total</text>
<rect x="1020" y="386" width="184" height="52" rx="8" fill="none" stroke="${tone}" stroke-width="3"/>
<text x="1192" y="422" font-size="24" font-weight="700" fill="#09090b" text-anchor="end">${total}</text>
<text x="1112" y="468" font-size="13" fill="${tone}" text-anchor="middle">${good ? "Shown in US format" : "Should read $12.50"}</text>`);
}

const DEMO_PROOF: Record<string, () => string> = {
	"before-billing-page.png": () => billing("US$12.50", false),
	"after-billing-page.png": () => billing("$12.50", true),
	"usage-week-zero.png": () => page("Usage", `<text x="296" y="148" font-size="15" fill="#71717a">Tokens · This week</text>
<rect x="296" y="180" width="920" height="420" rx="8" fill="none" stroke="#e4e4e7"/>
<text x="328" y="248" font-size="13" fill="#71717a">Total tokens</text>
<rect x="318" y="262" width="150" height="64" rx="8" fill="none" stroke="#dc2626" stroke-width="3"/>
<text x="332" y="310" font-size="40" font-weight="700" fill="#09090b">0</text>
<line x1="328" y1="560" x2="1184" y2="560" stroke="#e4e4e7"/>
${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => `<text x="${360 + index * 128}" y="584" font-size="12" fill="#a1a1aa" text-anchor="middle">${day}</text>`).join("")}
<text x="756" y="470" font-size="14" fill="#dc2626" text-anchor="middle">3 requests in Logs this week, 4,596 tokens billed</text>`),
	"failing-test.log": () => "$ node supabase/tests/usage-rollup-decimals.test.mjs\n✗ weekly total counts decimal-string usage\n  expected: 1532\n  received: 0\n\n1 failed, 0 passed\n",
	"retry-drops-item.log": () => "$ pnpm vitest run stream-end -t \"retry after early end\"\n✗ keeps reasoning items across a retry\n  expected 2 reasoning items, received 1\n  missing: rs_01J9...a4 (from attempt 1)\n\n1 failed, 14 passed\n",
	"strict-schema.log": () => "$ curl -s localhost:8787/v1/messages -d @system-role.json | jq .type\n\"message\"\n\n$ GATEWAY_STRICT_SCHEMA=1 curl -s localhost:8787/v1/messages -d @system-role.json | jq .error.code\n\"invalid_role\"\n",
	"verify-tests.log": () => "$ pnpm --filter @phaseo/web test format-money\n✓ formats en-GB as $12.50\n✓ formats en-US as $12.50\n✓ formats de-DE as $12.50\n✓ keeps cents for amounts under $1\n✓ groups thousands with commas\n✓ shows negative amounts with a minus\n\n6 passed\n\n$ pnpm --filter @phaseo/web typecheck\nDone in 41.2s\n",
};

/** The demo's proof files: drawn screenshots and short logs. */
const DEMO_ATTACHMENTS: Record<string, () => string> = {
	"3117/image-1.png": () => page("Compare", `<text x="296" y="148" font-size="15" fill="#71717a">openai/gpt-5.5 · Providers</text>
<rect x="288" y="168" width="420" height="56" rx="8" fill="none" stroke="#dc2626" stroke-width="3"/>
<text x="300" y="208" font-size="30" font-weight="700" fill="#09090b">Compare 1 Providers</text>
<rect x="296" y="260" width="920" height="200" rx="8" fill="none" stroke="#e4e4e7"/>
<text x="320" y="300" font-size="15" fill="#09090b">OpenAI</text><text x="1192" y="300" font-size="15" fill="#52525b" text-anchor="end">$1.25 / $10.00</text>`),
	"3117/image-2.png": () => page("Compare", `<text x="296" y="148" font-size="15" fill="#71717a">anthropic/claude-sonnet-5.5 · Providers</text>
<text x="300" y="208" font-size="30" font-weight="700" fill="#09090b">Compare 3 Providers</text>
<rect x="296" y="260" width="920" height="200" rx="8" fill="none" stroke="#e4e4e7"/>
${["Anthropic", "Amazon Bedrock", "Google Vertex"].map((name, index) => `<text x="320" y="${300 + index * 48}" font-size="15" fill="#09090b">${name}</text>`).join("")}`),
};

/** Demo mode: a drawing for each image attached to a seeded issue. */
export function demoAttachment(number: number, name: string): { body: string; type: string } | null {
	const make = DEMO_ATTACHMENTS[`${number}/${name}`];
	return make ? { body: make(), type: "image/svg+xml" } : null;
}

export function demoProof(name: string): { body: string; type: string } | null {
	const make = DEMO_PROOF[name];
	if (!make) return null;
	return { body: make(), type: name.endsWith(".png") ? "image/svg+xml" : "text/plain; charset=utf-8" };
}

/** Both demo repositories, read in full a little while ago. */
export function demoRepos(now: number): RepoStatus[] {
	const items = demoItems(now).filter((item) => item.state === "open" || item.state === "draft");
	return DEMO_SETTINGS.repos.map(({ repo }) => ({
		repo, importedAt: now - 3 * HOUR, syncedAt: now - 70_000,
		issues: items.filter((item) => item.repo === repo && item.kind === "issue").length,
		pulls: items.filter((item) => item.repo === repo && item.kind === "pull").length,
	}));
}

/** What agents noted about the main demo repository and this computer, in every state a note can be in. */
export function demoNotes(now: number): Record<string, RepoNote[]> {
	return {
		[DEMO_REPO]: [
			{ id: "note-1", text: "Web tests: `pnpm --filter @phaseo/web test -- <path>`. The full suite has 31 known failures on main, so run only the files you touched.", at: now - 3 * HOUR, runId: "run-3131-reproduce", stage: "reproduce", agentId: "claude-opus", checked: "ran the full suite on main, 31 failed", confirmations: 4, confirmedAt: now - 40 * 60_000 },
			{ id: "note-2", text: "Gateway unit tests need no database: `pnpm --filter @phaseo/gateway-api test`.", at: now - 26 * HOUR, stage: "fix", agentId: "codex-gpt", flagged: { why: "Since the usage rollup moved to SQL, `usage-rollup.test.ts` needs PGlite: it fails without `pnpm db:test`.", at: now - 2 * HOUR, agentId: "claude-opus", stage: "reproduce" } },
			{ id: "note-3", text: "Money is formatted by `formatUsd` in `apps/web/src/lib/money.ts`; never use `toLocaleString` with a currency.", at: now - 50 * HOUR, pinned: true },
			{ id: "note-4", text: "SQL changes ship as a new file in `supabase/migrations`; the test helper applies them in name order.", at: now - 30 * HOUR, updatedAt: now - 5 * HOUR, previous: "SQL changes go in supabase/schema.sql.", stage: "fix", agentId: "claude-sonnet", confirmations: 1, confirmedAt: now - 5 * HOUR },
		],
		"@computer": [
			{ id: "note-c1", text: "PowerShell blocks `npm.ps1`: use `npm.cmd` and `pnpm.cmd`.", at: now - 20 * HOUR, stage: "fix", agentId: "codex-gpt", checked: "npm failed with an execution policy error, npm.cmd worked", confirmations: 6, confirmedAt: now - 1 * HOUR },
		],
	};
}
