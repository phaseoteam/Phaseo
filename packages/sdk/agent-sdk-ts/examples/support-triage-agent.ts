import {
	AgentGatewayError,
	createAgent,
	createGatewayAgentClient,
} from "@phaseo/agent-sdk";

type SupportTriageDecision = {
	queue: "billing" | "reliability" | "product" | "security";
	severity: "low" | "medium" | "high";
	needsHumanReview: boolean;
	summary: string;
};

const supportTriageAgent = createAgent<string, SupportTriageDecision>({
	id: "support-triage-agent",
	preset: "support-triage",
	parseOutput(text: string) {
		return JSON.parse(text) as SupportTriageDecision;
	},
	humanReview: ({ parsedOutput }: { parsedOutput?: SupportTriageDecision }) =>
		parsedOutput?.needsHumanReview
			? {
					reason: "support_triage_review_required",
					payload: parsedOutput,
			  }
			: null,
});

async function main() {
	try {
		const client = createGatewayAgentClient({
			clientOptions: {
				apiKey: process.env.PHASEO_API_KEY!,
			},
			responseFormat: {
				type: "json_schema",
				name: "support_triage_decision",
				schema: {
					type: "object",
					properties: {
						queue: {
							type: "string",
							enum: ["billing", "reliability", "product", "security"],
						},
						severity: {
							type: "string",
							enum: ["low", "medium", "high"],
						},
						needsHumanReview: {
							type: "boolean",
						},
						summary: {
							type: "string",
						},
					},
					required: ["queue", "severity", "needsHumanReview", "summary"],
					additionalProperties: false,
				},
			},
			plugins: [{ id: "response-healing", mode: "strict" }],
		});

		const result = await supportTriageAgent.run({
			input: "Customer says webhook deliveries failed overnight and asks whether data was lost.",
			client,
			modelRetry: {
				maxRetries: 2,
				backoffMs: 250,
			},
			onEvent(event: { type: string; runId: string }) {
				console.log(event.type, event.runId);
			},
		});

		if (result.run.status === "waiting_for_human") {
			console.log("Paused for approval:", result.run.pause);

			const continued = await supportTriageAgent.continueRun({
				run: result,
				client,
				humanInput: "Approved. Finalize the triage decision.",
			});

			console.log(continued.output);
			return;
		}

		console.log(result.output);
	} catch (error) {
		if (error instanceof AgentGatewayError) {
			console.error("Gateway request failed", {
				status: error.status,
				requestId: error.requestId,
				generationId: error.generationId,
				reason: error.reason,
				providerFailureDiagnostics: error.providerFailureDiagnostics,
				routingDiagnostics: error.routingDiagnostics,
			});
		}
		throw error;
	}
}

void main();
