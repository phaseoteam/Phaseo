import { notFound } from "next/navigation";
import DynamicRoutesStudio from "@/components/(gateway)/settings/routing/DynamicRoutesStudio";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import type { SettingsDynamicRoutesInitialData } from "@/lib/fetchers/internal/settingsTypes";

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

export const metadata = { title: "Dynamic routing preview" };

export default function DynamicRoutingDemoPage() {
	if (process.env.NODE_ENV === "production") notFound();
	return (
		<div className="flex flex-col gap-3 lg:h-[calc(100dvh-var(--site-header-height,3.75rem)-var(--site-notice-height,0px)-2.5rem)] lg:min-h-[420px]">
			<SettingsPageHeader title="Dynamic routing" />
			<div className="border-l-2 border-cyan-500 px-3 py-1 text-sm text-muted-foreground">Local preview mode — changes stay in this browser and do not touch the database.</div>
			<DynamicRoutesStudio initialData={previewData} demoMode />
		</div>
	);
}
