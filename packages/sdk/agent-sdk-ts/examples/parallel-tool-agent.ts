import { createAgent, createGatewayAgentClient, defineTool } from "@ai-stats/agent-sdk";

const fetchDocs = defineTool({
	id: "fetch-docs",
	description: "Fetch one internal docs summary by slug.",
	async execute(input: { slug: string }) {
		return {
			slug: input.slug,
			summary: `Docs summary for ${input.slug}`,
		};
	},
});

const fetchStatus = defineTool({
	id: "fetch-status",
	description: "Fetch one status summary by component id.",
	async execute(input: { component: string }) {
		return {
			component: input.component,
			status: "operational",
		};
	},
});

const fetchIncidents = defineTool({
	id: "fetch-incidents",
	description: "Fetch one current incident digest by service id.",
	async execute(input: { service: string }) {
		return {
			service: input.service,
			openIncidents: 0,
		};
	},
});

const agent = createAgent({
	id: "parallel-tool-agent",
	model: "ai-stats/free",
	instructions:
		"Use the available tools to gather context, then return one concise operational summary.",
	tools: [fetchDocs, fetchStatus, fetchIncidents],
	toolExecution: {
		toolConcurrency: 3,
	},
});

const result = await agent.run({
	input:
		"Fetch the presets docs, the gateway status component, and the async-jobs incident digest, then summarize the current state.",
	client: createGatewayAgentClient({
		clientOptions: {
			apiKey: process.env.AI_STATS_API_KEY!,
		},
	}),
	onEvent(event) {
		console.log(event.type, event.runId);
	},
});

console.log(result.output);
