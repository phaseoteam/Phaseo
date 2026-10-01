import { notFound } from "next/navigation";
import DynamicRoutesStudio from "@/components/(gateway)/settings/routing/DynamicRoutesStudio";
import type { SettingsDynamicRoutesInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getTranslations } from "next-intl/server";

const previewData: SettingsDynamicRoutesInitialData = {
	workspaceId: "00000000-0000-0000-0000-000000000001",
	routes: [{
		id: "00000000-0000-0000-0000-000000000010",
		workspace_id: "00000000-0000-0000-0000-000000000001",
		name: "Production responses",
		description: "Keep interactive traffic fast while preserving prompt-cache locality.",
		status: "active",
		version: 3,
		deployed_version: 2,
		config: {
			schemaVersion: 2,
			entryNodeId: "start",
			cacheAwareRouting: true,
			sessionAffinity: true,
			nodes: [
				{ id: "start", type: "start", position: { x: 460, y: 40 }, data: { label: "Request received" } },
				{ id: "plan", type: "condition", position: { x: 460, y: 230 }, data: { label: "Is this a paid customer?", source: "metadata", path: "customer_plan", operator: "equals", value: "pro" } },
				{ id: "pro-budget", type: "budget_limit", position: { x: 190, y: 470 }, data: { label: "Check team budget", window: "monthly", maxCostUsd: 500 } },
				{ id: "experiment", type: "percentage", position: { x: 730, y: 470 }, data: { label: "Free-tier rollout", branches: [{ id: "stable", label: "Stable", percentage: 90 }, { id: "candidate", label: "Candidate", percentage: 10 }] } },
				{ id: "sonnet", type: "model", position: { x: 40, y: 740 }, data: { label: "High-quality response", model: "anthropic/claude-sonnet-4.5", modelFallbacks: ["openai/gpt-5-mini"], routingMode: "latency", providerOrder: ["anthropic"], providerOnly: [], providerIgnore: [], allowFallbacks: true } },
				{ id: "mini", type: "model", position: { x: 330, y: 740 }, data: { label: "Budget fallback", model: "openai/gpt-5-mini", routingMode: "price", providerOrder: ["openai"], providerOnly: [], providerIgnore: [], allowFallbacks: true } },
				{ id: "flash", type: "model", position: { x: 620, y: 740 }, data: { label: "Stable free model", model: "google/gemini-2.5-flash", routingMode: "price", providerOrder: ["google-ai-studio"], providerOnly: [], providerIgnore: [], allowFallbacks: true } },
				{ id: "candidate", type: "model", position: { x: 910, y: 740 }, data: { label: "Candidate model", model: "openai/gpt-5-mini", routingMode: "balanced", providerOrder: ["openai"], providerOnly: [], providerIgnore: [], allowFallbacks: true } },
			],
			edges: [
				{ id: "start-plan", source: "start", target: "plan" },
				{ id: "plan-pro", source: "plan", target: "pro-budget", sourceHandle: "true" },
				{ id: "plan-free", source: "plan", target: "experiment", sourceHandle: "false" },
				{ id: "budget-within", source: "pro-budget", target: "sonnet", sourceHandle: "within" },
				{ id: "budget-exceeded", source: "pro-budget", target: "mini", sourceHandle: "exceeded" },
				{ id: "split-stable", source: "experiment", target: "flash", sourceHandle: "stable" },
				{ id: "split-candidate", source: "experiment", target: "candidate", sourceHandle: "candidate" },
			],
			defaultAction: { routingMode: "balanced", providerOrder: ["anthropic", "openai", "google-ai-studio"], providerOnly: [], providerIgnore: [], allowFallbacks: true },
			rules: [],
		},
		keyIds: ["00000000-0000-0000-0000-000000000101"],
		created_at: "2026-07-26T12:00:00.000Z",
		updated_at: "2026-07-26T14:00:00.000Z",
		versions: [
			{ version: 3, status: "draft", created_at: "2026-07-26T14:00:00.000Z" },
			{ version: 2, status: "deployed", created_at: "2026-07-25T16:20:00.000Z" },
			{ version: 1, status: "superseded", created_at: "2026-07-24T10:05:00.000Z" },
		],
	}],
	keys: [
		{ id: "00000000-0000-0000-0000-000000000101", name: "Production", prefix: "ph_live_7f2", status: "active" },
		{ id: "00000000-0000-0000-0000-000000000102", name: "Evaluation jobs", prefix: "ph_live_92a", status: "active" },
	],
	providers: [
		{ id: "anthropic", name: "Anthropic", status: "active" },
		{ id: "openai", name: "OpenAI", status: "active" },
		{ id: "google-ai-studio", name: "Google AI Studio", status: "active" },
		{ id: "groq", name: "Groq", status: "active" },
	],
};

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("dynamicRoutingPreview") };
}

export default async function DynamicRoutingDemoPage() {
	const t = await getTranslations("SettingsUI");
	const routingT = await getTranslations("SettingsUI.routingStudio");
	if (process.env.NODE_ENV === "production") notFound();
	const demoNodeLabelKeys: Record<string, string> = {
		start: "requestReceived",
		plan: "demoPaidCustomer",
		"pro-budget": "demoCheckTeamBudget",
		experiment: "demoFreeTierRollout",
		sonnet: "demoHighQualityResponse",
		mini: "demoBudgetFallback",
		flash: "demoStableFreeModel",
		candidate: "demoCandidateModel",
	};
	const localizedPreviewData: SettingsDynamicRoutesInitialData = {
		...previewData,
		routes: previewData.routes.map((route) => ({
			...route,
			name: routingT("demoRouteName"),
			description: routingT("demoRouteDescription"),
			config: {
				...route.config,
				nodes: route.config.nodes?.map((node) => ({
					...node,
					data: {
						...node.data,
						label: demoNodeLabelKeys[node.id] ? routingT(demoNodeLabelKeys[node.id] as never) : node.data.label,
						branches: node.data.branches?.map((branch: any) => ({
							...branch,
							label: branch.id === "stable" ? routingT("stable") : branch.id === "candidate" ? routingT("candidate") : branch.label,
						})),
					},
				})),
			},
		})),
		keys: previewData.keys.map((key) => ({
			...key,
			name: key.id.endsWith("101") ? routingT("demoProductionKey") : routingT("demoEvaluationKey"),
		})),
	};
	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-bold">{t("headers.dynamicRouting")}</h1>
				<p className="mt-2 text-sm text-muted-foreground">{t("headers.dynamicRoutingDescription")}</p>
			</header>
			<div className="border-l-2 border-cyan-500 px-3 py-1 text-sm text-muted-foreground">{t("headers.dynamicRoutingPreview")}</div>
			<DynamicRoutesStudio initialData={localizedPreviewData} demoMode />
		</div>
	);
}
