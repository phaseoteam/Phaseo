import { redirect } from "next/navigation";
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
import { getGatewaySupportedModels } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export const metadata = {
	title: "Developer onboarding - AI Stats",
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
	"x-ai/grok-4.3",
	"x-ai/grok-4",
	"z-ai/glm-5.1",
	"moonshotai/kimi-k2.6",
	"qwen/qwen3-235b-a22b",
];

function pickModels(models: Awaited<ReturnType<typeof getGatewaySupportedModels>>) {
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
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		redirect("/sign-in?returnUrl=%2Fonboarding");
	}

	const [{ data: userRow }, { data: workspaceRows }, allModels] = await Promise.all([
		supabase
			.from("users")
			.select("onboarding_state,onboarding_completed_at,default_workspace_id")
			.eq("user_id", user.id)
			.maybeSingle(),
		supabase
			.from("workspace_members")
			.select("workspace_id, role, workspaces(id, name)")
			.eq("user_id", user.id)
			.in("role", ["owner", "admin"]),
		getGatewaySupportedModels(false),
	]);

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
			<InteractiveOnboarding
				initialState={savedState}
				initialCompletedAt={userRow?.onboarding_completed_at ?? null}
				models={pickModels(allModels)}
				workspaces={workspaces}
				initialWorkspaceId={initialWorkspace?.id ?? null}
			/>
		</>
	);
}
