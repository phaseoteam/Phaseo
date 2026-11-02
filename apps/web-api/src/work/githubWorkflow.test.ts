import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { buildGithubWorkflow, DEFAULT_WORKFLOW_MODEL } from "./githubWorkflow";

type Step = { name?: string; id?: string; if?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = { if?: string; permissions?: Record<string, string>; env?: Record<string, string>; steps: Step[] };
type Workflow = { name: string; on: Record<string, { types: string[] }>; permissions: Record<string, string>; jobs: Record<string, Job> };

const parse = (text: string) => yaml.load(text) as Workflow;
const allSteps = (workflow: Workflow) => Object.values(workflow.jobs).flatMap((job) => job.steps);

describe("buildGithubWorkflow", () => {
	const text = buildGithubWorkflow({ repo: "acme/shop" });
	const workflow = parse(text);

	it("parses as YAML with the triggers and both jobs", () => {
		expect(workflow.on).toEqual({
			issues: { types: ["opened", "edited", "closed", "reopened", "labeled"] },
			issue_comment: { types: ["created"] },
			pull_request: { types: ["opened", "closed", "edited"] },
		});
		expect(Object.keys(workflow.jobs)).toEqual(["report", "agent"]);
		expect(workflow.jobs.report.if).toBeUndefined();
	});

	it("reports the event with jq and curl only, to the bridge URL with the secret token", () => {
		const [step] = workflow.jobs.report.steps;
		expect(workflow.jobs.report.steps).toHaveLength(1);
		expect(step.uses).toBeUndefined();
		expect(step.env?.PHASEO_WORK_URL).toBe("https://phaseo.app/api/_web/work/github");
		expect(step.env?.PHASEO_WORK_TOKEN).toBe("${{ secrets.PHASEO_WORK_TOKEN }}");
		expect(step.run).toContain('jq -c --arg event "$GITHUB_EVENT_NAME"');
		expect(step.run).toContain('"$GITHUB_EVENT_PATH"');
		expect(step.run).toContain('curl -sS --fail-with-body');
		expect(step.env?.PHASEO_JQ).toContain(".[0:20000]");
	});

	it("runs the agent only for @phaseo comments from people with write access, or the phaseo label", () => {
		const agent = workflow.jobs.agent;
		expect(agent.if).toContain("contains(github.event.comment.body, '@phaseo')");
		expect(agent.if).toContain(`contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association)`);
		expect(agent.if).toContain("!github.event.issue.pull_request");
		expect(agent.if).toContain("github.event.label.name == 'phaseo'");
		expect(agent.permissions).toEqual({ contents: "write", "pull-requests": "write", issues: "write" });
		expect(workflow.permissions).toEqual({ contents: "read" });
		expect(agent.steps.map((step) => step.name)).toEqual([
			"Check out the repository",
			"Set up Node.js",
			"Report the agent run as running",
			"Write the agent prompt",
			"Run the engineer agent (Claude Code through the Phaseo gateway)",
			"Open a pull request with the changes",
			"Comment on the issue",
			"Report the agent run result",
		]);
	});

	it("runs Claude Code through the Phaseo gateway with the key on that step only", () => {
		const harness = workflow.jobs.agent.steps.find((step) => step.id === "harness")!;
		expect(harness.env).toEqual({
			ANTHROPIC_BASE_URL: "https://api.phaseo.app",
			ANTHROPIC_AUTH_TOKEN: "${{ secrets.PHASEO_API_KEY }}",
			ANTHROPIC_API_KEY: "",
			ANTHROPIC_MODEL: "${{ env.PHASEO_MODEL }}",
		});
		expect(harness.run).toContain('npx -y @anthropic-ai/claude-code -p "$(cat "$RUNNER_TEMP/phaseo-prompt.md")"');
		expect(harness.run).toContain("--permission-mode acceptEdits --max-turns 40");
		expect(workflow.jobs.agent.env?.PHASEO_MODEL).toBe(DEFAULT_WORKFLOW_MODEL);
		expect(JSON.stringify(workflow.jobs.agent.env)).not.toContain("PHASEO_API_KEY");
		const checkout = workflow.jobs.agent.steps[0];
		expect(checkout.with).toEqual({ "persist-credentials": false });
	});

	it("opens the pull request on phaseo/issue-N with Fixes #N", () => {
		const pr = workflow.jobs.agent.steps.find((step) => step.id === "pr")!;
		expect(pr.run).toContain('BRANCH="phaseo/issue-$ISSUE_NUMBER"');
		expect(pr.run).toContain('echo "Fixes #$ISSUE_NUMBER"');
		expect(pr.run).toContain("gh pr create");
	});

	it("never puts expressions or event text inside run scripts", () => {
		for (const harness of ["claude-code", "codex"] as const) {
			const steps = allSteps(parse(buildGithubWorkflow({ repo: "acme/shop", harness })));
			for (const step of steps) {
				if (step.run) expect(step.run, step.name).not.toContain("${{");
			}
			const prompt = steps.find((step) => step.name === "Write the agent prompt")!;
			expect(prompt.env).toMatchObject({
				ISSUE_TITLE: "${{ github.event.issue.title }}",
				ISSUE_BODY: "${{ github.event.issue.body }}",
				COMMENT_BODY: "${{ github.event.comment.body }}",
			});
			expect(prompt.run).toContain("untrusted data");
			expect(prompt.run).toContain('FENCE="PHASEO_UNTRUSTED_$(openssl rand -hex 12)"');
		}
	});

	it("has no customer data or other product names", () => {
		expect(text).not.toMatch(/customer|contact_|work_customer/i);
		expect(text).not.toMatch(/linear|sentry|posthog|openrouter/i);
	});

	it("offers Codex through the Phaseo Responses endpoint", () => {
		const codex = parse(buildGithubWorkflow({ repo: "acme/shop", harness: "codex", model: "openai/gpt-5.5", phaseoOrigin: "https://staging.phaseo.app/" }));
		const harness = codex.jobs.agent.steps.find((step) => step.id === "harness")!;
		expect(harness.env).toEqual({ PHASEO_API_KEY: "${{ secrets.PHASEO_API_KEY }}", CODEX_HOME: "${{ runner.temp }}/codex-home" });
		expect(harness.run).toContain("npx -y @openai/codex exec --sandbox workspace-write --skip-git-repo-check");
		expect(harness.run).toContain("base_url = \"https://api.phaseo.app/v1\"");
		expect(harness.run).toContain("wire_api = \"responses\"");
		expect(codex.jobs.report.steps[0].env?.PHASEO_WORK_URL).toBe("https://staging.phaseo.app/api/_web/work/github");
		expect(codex.jobs.agent.env?.PHASEO_MODEL).toBe("openai/gpt-5.5");
	});

	it("rejects repos, models and origins that could break the YAML", () => {
		expect(() => buildGithubWorkflow({ repo: "acme/shop\non: push" })).toThrow();
		expect(() => buildGithubWorkflow({ repo: "acme/shop", model: "x\" && curl evil" })).toThrow();
		expect(() => buildGithubWorkflow({ repo: "acme/shop", phaseoOrigin: "javascript:alert(1)" })).toThrow();
	});
});
