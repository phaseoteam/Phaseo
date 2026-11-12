// Onboarding page data (account check, provider-mode and signed-out
// redirects, workspace cookie, curated models), loaded by one server function
// in that order. The route's beforeLoad runs it through ensureQueryData so the
// redirects happen before anything renders, and the page reads the cached result.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";
import type { OnboardingModel } from "@/components/(gateway)/onboarding/InteractiveOnboarding";
import {
	compareByReleaseDateDesc,
	normalizeFavoriteModelId,
} from "@/components/(chat)/playgroundConfig";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

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

const loadOnboardingPage = createServerFn({ method: "GET" }).handler(async () => {
	const [{ redirect }, { fetchInternalAuthHeaderData }, { fetchOnboardingInitialData }, { fetchFrontendGatewayModels }, { getWorkspaceIdFromCookie }] = await Promise.all([
		import("@/lib/navigation"),
		import("@/lib/fetchers/internal/fetchInternalAuthHeaderData"),
		import("@/lib/fetchers/internal/fetchOnboardingInitialData"),
		import("@/lib/fetchers/frontend/fetchFrontendGatewayModels"),
		import("@/utils/workspaceCookie"),
	]);
	const account = await fetchInternalAuthHeaderData().catch(() => null);
	if (!account) return { accountAvailable: false as const };
	if (account.providerMode) redirect("/settings/account/providers");
	const onboarding = await fetchOnboardingInitialData();
	if (!onboarding.signedIn) {
		redirect("/sign-in?returnUrl=%2Fonboarding");
	}
	const allModels = await fetchFrontendGatewayModels();
	const cookieWorkspaceId = await getWorkspaceIdFromCookie();
	return {
		accountAvailable: true as const,
		// onboarding_state is free-form JSON; `any` keeps it serialisable for the server function.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		onboarding: onboarding as Omit<typeof onboarding, "user"> & { user: (NonNullable<typeof onboarding.user> & { onboarding_state?: any }) | null },
		models: pickModels(allModels),
		cookieWorkspaceId: cookieWorkspaceId ?? null,
	};
});

export const onboardingPageQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "onboarding", "page"],
		queryFn: () => loadOnboardingPage(),
		// The redirects are thrown from here; never retry them.
		retry: false,
	});
