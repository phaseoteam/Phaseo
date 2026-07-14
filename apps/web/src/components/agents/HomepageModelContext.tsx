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
					name: "get-phaseo-discovery",
					title: "Get discovery metadata",
					description:
						"Return the Phaseo homepage, API catalog, API docs, quickstart docs, and pricing/model URLs for agent use.",
					annotations: { readOnlyHint: true },
					execute: async () => ({
						homepageUrl: window.location.origin,
						...TOOL_TARGETS,
					}),
				},
				{
					name: "open-phaseo-models",
					title: "Open models page",
					description:
						"Open the public Phaseo models page for browsing the model catalogue.",
					annotations: { readOnlyHint: true },
					execute: async () => navigateTo(TOOL_TARGETS.modelsUrl),
				},
				{
					name: "open-phaseo-api-docs",
					title: "Open API docs",
					description:
						"Open the Phaseo Gateway API reference documentation.",
					annotations: { readOnlyHint: true },
					execute: async () => navigateTo(TOOL_TARGETS.apiDocsUrl),
				},
				{
					name: "open-phaseo-pricing",
					title: "Open pricing",
					description:
						"Open the Phaseo pricing page for the gateway and model pricing context.",
					annotations: { readOnlyHint: true },
					execute: async () => navigateTo(TOOL_TARGETS.pricingUrl),
				},
			],
		});
	}, []);

	return null;
}
