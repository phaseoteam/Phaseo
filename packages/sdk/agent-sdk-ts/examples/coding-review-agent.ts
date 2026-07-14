import {
	createAgent,
	createGatewayAgentClient,
	defineTool,
} from "@phaseo/agent-sdk";

type CodeReviewPlan = {
	risk: "low" | "medium" | "high";
	summary: string;
	recommendedActions: string[];
	needsApproval: boolean;
};

const lookupDiffSummary = defineTool({
	id: "lookup-diff-summary",
	description: "Return a short summary of the changed files in one pull request.",
	async execute(input: { pullRequestId: string }) {
		return {
			pullRequestId: input.pullRequestId,
			files: ["apps/api/src/pipeline/before/index.ts", "apps/web/src/lib/chat/formatRoomError.ts"],
			summary:
				"Changes touch request validation and request-detail rendering for gateway diagnostics.",
		};
	},
});

const lookupFailingChecks = defineTool({
	id: "lookup-failing-checks",
	description: "Return the failing CI checks for one pull request.",
	async execute(input: { pullRequestId: string }) {
		return {
			pullRequestId: input.pullRequestId,
			failingChecks: ["web-typecheck"],
		};
	},
});

const codingReviewAgent = createAgent<string, CodeReviewPlan>({
	id: "coding-review-agent",
	model: "phaseo/free",
	instructions:
		"Use the available tools to inspect the coding task, then return a strict JSON review plan with risk, summary, recommendedActions, and needsApproval.",
	tools: [lookupDiffSummary, lookupFailingChecks],
	parseOutput(text: string) {
		return JSON.parse(text) as CodeReviewPlan;
	},
	humanReview: ({ parsedOutput }: { parsedOutput?: CodeReviewPlan }) =>
		parsedOutput?.needsApproval
			? {
					reason: "coding_review_approval_required",
					payload: parsedOutput,
			  }
			: null,
});

async function main() {
	const client = createGatewayAgentClient({
		clientOptions: {
			apiKey: process.env.PHASEO_API_KEY!,
		},
		responseFormat: {
			type: "json_schema",
			name: "code_review_plan",
			schema: {
				type: "object",
				properties: {
					risk: {
						type: "string",
						enum: ["low", "medium", "high"],
					},
					summary: { type: "string" },
					recommendedActions: {
						type: "array",
						items: { type: "string" },
						minItems: 1,
					},
					needsApproval: { type: "boolean" },
				},
				required: ["risk", "summary", "recommendedActions", "needsApproval"],
				additionalProperties: false,
			},
		},
		plugins: [{ id: "response-healing", mode: "strict" }],
	});

	const result = await codingReviewAgent.run({
		input: "Review pull request pr_482 and produce a remediation plan.",
		client,
		onEvent(event: { type: string; runId: string }) {
			console.log(event.type, event.runId);
		},
	});

	if (result.run.status === "waiting_for_human") {
		console.log("Paused for approval:", result.run.pause);
		const continued = await codingReviewAgent.continueRun({
			run: result,
			client,
			humanInput: "Approved. Finalize the plan.",
		});
		console.log(continued.output);
		return;
	}

	console.log(result.output);
}

void main();
