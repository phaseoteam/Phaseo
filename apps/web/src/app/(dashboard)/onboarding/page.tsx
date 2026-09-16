import { redirect } from "next/navigation";
import Link from "next/link";
import NoFooterStyle from "@/components/layout/NoFooterStyle";
import InteractiveOnboarding, {
	type OnboardingModel,
	type OnboardingWorkspace,
} from "@/components/(gateway)/onboarding/InteractiveOnboarding";
import {
	compareByReleaseDateDesc,
	normalizeFavoriteModelId,
} from "@/components/(chat)/playgroundConfig";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { fetchOnboardingInitialData } from "@/lib/fetchers/internal/fetchOnboardingInitialData";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";

export const metadata = {
	title: "Developer onboarding",
	robots: {
		index: false,
		follow: false,
	},
};

const ONBOARDING_MODEL_IDS = [
	"anthropic/claude-fable-5",
	"openai/gpt-5.5",
	"google/gemini-3.1-pro-preview",
	"deepseek/deepseek-v4-pro",
	"xiaomi/mimo-v2.5-pro",
	"minimax/minimax-m3",
	"spacex-ai/grok-4.3",
	"spacex-ai/grok-4",
	"z-ai/glm-5.1",
	"moonshotai/kimi-k2.6",
	"qwen/qwen3-235b-a22b",
];

function pickModels(models: GatewaySupportedModel[]) {
	const curatedModelIds = ONBOARDING_MODEL_IDS.map((modelId) =>
		normalizeFavoriteModelId(modelId),
	);
	const curatedIdSet = new Set(curatedModelIds);
	const textModels = filterModelsForRoom(models, "text").filter(
		(model) => model.isAvailable,
	);
	const bySelector = new Map<string, (typeof textModels)[number]>();
	for (const model of textModels) {
		const existing = bySelector.get(model.selectorModelId);
		if (!existing) {
			bySelector.set(model.selectorModelId, model);
			continue;
		}
		const existingHasName = Boolean(existing.modelName);
		if (!existingHasName && model.modelName) {
			bySelector.set(model.selectorModelId, model);
		}
	}

	const sorted = Array.from(bySelector.values()).sort((a, b) =>
		compareByReleaseDateDesc(
			{
				releaseDate: a.releaseDate ?? a.announcementDate ?? null,
				label: a.modelName ?? a.selectorModelId,
				modelId: a.selectorModelId,
			},
			{
				releaseDate: b.releaseDate ?? b.announcementDate ?? null,
				label: b.modelName ?? b.selectorModelId,
				modelId: b.selectorModelId,
			},
		),
	);
	const rows = curatedModelIds
		.map((id) =>
			sorted.find(
				(model) => normalizeFavoriteModelId(model.selectorModelId) === id,
			),
		)
		.filter(Boolean) as typeof sorted;

	return rows.map<OnboardingModel>((model) => ({
		id: model.selectorModelId,
		name: model.modelName ?? model.selectorModelId,
		providerName: model.providerName ?? model.providerId,
		organisationId:
			model.organisationId?.trim() ||
			model.selectorModelId.split("/")[0] ||
			model.providerId,
		organisationName: model.organisationName ?? model.providerName ?? model.providerId,
		capabilities: model.capabilities.slice(0, 4),
		featured: curatedIdSet.has(normalizeFavoriteModelId(model.selectorModelId)),
	}));
}

export default async function OnboardingPage() {
	const account = await fetchInternalAuthHeaderData().catch(() => null);
	if (!account) return <main className="container mx-auto max-w-xl px-4 py-16"><h1 className="text-xl font-semibold">Account setup is temporarily unavailable</h1><p className="mt-2 text-sm text-muted-foreground">We could not verify your account mode. Please try again before continuing.</p><Link className="mt-5 inline-flex text-sm font-medium underline underline-offset-4" href="/onboarding">Try again</Link></main>;
	if (account.providerMode) redirect("/settings/account/providers");
	const onboarding = await fetchOnboardingInitialData();
	if (!onboarding.signedIn) {
		redirect("/sign-in?returnUrl=%2Fonboarding");
	}
	const userRow = onboarding.user;
	const workspaceRows = onboarding.workspaces;
	const allModels = await fetchFrontendGatewayModels();

	const workspaces: OnboardingWorkspace[] = [];
	const seenWorkspaceIds = new Set<string>();
	for (const row of workspaceRows ?? []) {
		const workspace = Array.isArray(row.workspaces)
			? row.workspaces[0]
			: row.workspaces;
		const id = String(workspace?.id ?? row.workspace_id ?? "").trim();
		const name = String(workspace?.name ?? "Workspace").trim();
		if (!id || seenWorkspaceIds.has(id)) continue;
		seenWorkspaceIds.add(id);
		workspaces.push({ id, name, role: String(row.role ?? "member") });
	}

	const cookieWorkspaceId = await getWorkspaceIdFromCookie();
	const savedState =
		userRow?.onboarding_state && typeof userRow.onboarding_state === "object"
			? (userRow.onboarding_state as Record<string, unknown>)
			: {};
	const preferredWorkspaceId =
		String(savedState.workspaceId ?? "").trim() ||
		String(cookieWorkspaceId ?? "").trim() ||
		String(userRow?.default_workspace_id ?? "").trim();
	const initialWorkspace =
		workspaces.find((workspace) => workspace.id === preferredWorkspaceId) ??
		workspaces[0] ??
		null;

	return (
		<>
			<NoFooterStyle />
			<div className="mx-auto w-full max-w-5xl px-6 pt-6 text-right text-sm">
				<Link href="/settings/account/providers" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">Here to provide models? Become a provider</Link>
			</div>
			<InteractiveOnboarding
				initialState={savedState}
				initialCountryCode={userRow?.declared_country_code ?? null}
				countryStorageAvailable={onboarding.countryStorageAvailable !== false}
				initialCompletedAt={userRow?.onboarding_completed_at ?? null}
				models={pickModels(allModels)}
				workspaces={workspaces}
				initialWorkspaceId={initialWorkspace?.id ?? null}
			/>
		</>
	);
}
