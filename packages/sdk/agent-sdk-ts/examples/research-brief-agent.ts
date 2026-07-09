import { createAgent, createGatewayAgentClient } from "@phaseo/agent-sdk";

type ResearchBrief = {
	topic: string;
	summary: string;
	sources: Array<{
		title: string;
		url: string;
	}>;
};

export const researchBriefAgent = createAgent<string, ResearchBrief>({
	id: "research-brief-agent",
	model: "phaseo/free",
	instructions:
		"Research the user's topic with web search when needed and return a concise JSON brief with cited sources.",
	parseOutput(text) {
		return JSON.parse(text) as ResearchBrief;
	},
});

const client = createGatewayAgentClient({
	clientOptions: {
		apiKey: process.env.PHASEO_API_KEY!,
	},
	responseFormat: {
		type: "json_schema",
		name: "research_brief",
		schema: {
			type: "object",
			properties: {
				topic: { type: "string" },
				summary: { type: "string" },
				sources: {
					type: "array",
					items: {
						type: "object",
						properties: {
							title: { type: "string" },
							url: { type: "string" },
						},
						required: ["title", "url"],
						additionalProperties: false,
					},
					minItems: 1,
				},
			},
			required: ["topic", "summary", "sources"],
			additionalProperties: false,
		},
	},
	plugins: [{ id: "response-healing" }],
	gatewayTools: [{ type: "gateway:web_search", parameters: { max_results: 5 } }] as any,
	toolChoice: "gateway:web_search" as any,
	webSearchOptions: {
		search_context_size: "high",
	},
});

export async function runResearchBrief(topic: string) {
	const result = await researchBriefAgent.run({
		input: topic,
		client,
		onEvent(event) {
			console.log(event.type, event.runId);
		},
	});

	return result.output;
}
