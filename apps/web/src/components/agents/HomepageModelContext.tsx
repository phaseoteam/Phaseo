"use client";

import { useEffect } from "react";
import { API_DOCS_URL, API_QUICKSTART_URL } from "@/lib/agent-discovery";

type ModelContextTool = {
	annotations?: {
		readOnlyHint?: boolean;
	};
	description: string;
	execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
	inputSchema?: Record<string, unknown>;
	name: string;
	title?: string;
};

type ModelContextApi = {
	provideContext?: (context: { tools: ModelContextTool[] }) => void;
};

type NavigatorWithModelContext = Navigator & {
	modelContext?: ModelContextApi;
};

const TOOL_TARGETS = {
	apiDocsUrl: API_DOCS_URL,
	apiQuickstartUrl: API_QUICKSTART_URL,
	modelsUrl: "/models",
	pricingUrl: "/pricing",
	apiCatalogUrl: "/.well-known/api-catalog",
};

function navigateTo(url: string) {
	const target = url.startsWith("http") ? url : new URL(url, window.location.origin).toString();
	window.location.href = target;
	return {
		ok: true,
		url: target,
	};
}

export function HomepageModelContext() {
	useEffect(() => {
		const navigatorWithModelContext = navigator as NavigatorWithModelContext;
		const modelContext = navigatorWithModelContext.modelContext;
		if (!modelContext?.provideContext) {
			return;
		}

		modelContext.provideContext({
			tools: [
				{
					name: "get-ai-stats-discovery",
					title: "Get discovery metadata",
					description:
						"Return the AI Stats homepage, API catalog, API docs, quickstart docs, and pricing/model URLs for agent use.",
					annotations: { readOnlyHint: true },
					execute: async () => ({
						homepageUrl: window.location.origin,
						...TOOL_TARGETS,
					}),
				},
				{
					name: "open-ai-stats-models",
					title: "Open models page",
					description:
						"Open the public AI Stats models page for browsing the model catalogue.",
					annotations: { readOnlyHint: true },
					execute: async () => navigateTo(TOOL_TARGETS.modelsUrl),
				},
				{
					name: "open-ai-stats-api-docs",
					title: "Open API docs",
					description:
						"Open the AI Stats Gateway API reference documentation.",
					annotations: { readOnlyHint: true },
					execute: async () => navigateTo(TOOL_TARGETS.apiDocsUrl),
				},
				{
					name: "open-ai-stats-pricing",
					title: "Open pricing",
					description:
						"Open the AI Stats pricing page for the gateway and model pricing context.",
					annotations: { readOnlyHint: true },
					execute: async () => navigateTo(TOOL_TARGETS.pricingUrl),
				},
			],
		});
	}, []);

	return null;
}
