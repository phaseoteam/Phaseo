"use server";

import { revalidatePath } from "next/cache";
import { createApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";
import { requireAuthenticatedUser } from "@/utils/serverActionAuth";

export type OnboardingProgressInput = {
	workspaceId?: string | null;
	selectedModelId?: string | null;
	selectedKeyId?: string | null;
	createdKeyId?: string | null;
	keyPrefix?: string | null;
	completedSteps?: string[];
	status?: "started" | "completed" | "skipped";
};

function normaliseSteps(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.map((item) => String(item ?? "").trim())
				.filter((item) => /^[a-z0-9_-]+$/i.test(item)),
		),
	);
}

function isMissingOnboardingColumnError(error: unknown): boolean {
	const message = String(
		(error as { message?: unknown } | null)?.message ?? "",
	).toLowerCase();
	return (
		message.includes("onboarding_state") ||
		message.includes("onboarding_completed_at")
	);
}

async function mergeUserOnboardingState(input: OnboardingProgressInput) {
	const { supabase, user } = await requireAuthenticatedUser();
	const { data: existing } = await supabase
		.from("users")
		.select("onboarding_state")
		.eq("user_id", user.id)
		.maybeSingle();

	const current =
		existing?.onboarding_state && typeof existing.onboarding_state === "object"
			? (existing.onboarding_state as Record<string, unknown>)
			: {};
	const next: Record<string, unknown> = {
		...current,
		updatedAt: new Date().toISOString(),
	};

	if (input.workspaceId !== undefined) next.workspaceId = input.workspaceId;
	if (input.selectedModelId !== undefined) next.selectedModelId = input.selectedModelId;
	if (input.selectedKeyId !== undefined) next.selectedKeyId = input.selectedKeyId;
	if (input.createdKeyId !== undefined) next.createdKeyId = input.createdKeyId;
	if (input.keyPrefix !== undefined) next.keyPrefix = input.keyPrefix;
	if (input.status) next.status = input.status;
	if (input.completedSteps) {
		next.completedSteps = normaliseSteps([
			...(Array.isArray(current.completedSteps) ? current.completedSteps : []),
			...input.completedSteps,
		]);
	}

	const updatePayload: Record<string, unknown> = {
		onboarding_state: next,
		updated_at: new Date().toISOString(),
	};
	if (input.status === "completed" || input.status === "skipped") {
		updatePayload.onboarding_completed_at = new Date().toISOString();
	}

	const { error } = await supabase
		.from("users")
		.update(updatePayload)
		.eq("user_id", user.id);
	if (error) {
		if (isMissingOnboardingColumnError(error)) {
			return { state: next };
		}
		throw error;
	}

	revalidatePath("/onboarding");
	return { state: next };
}

export async function saveOnboardingProgressAction(input: OnboardingProgressInput) {
	return mergeUserOnboardingState({
		...input,
		status: input.status ?? "started",
	});
}

export async function createOnboardingApiKeyAction(input: {
	name: string;
	workspaceId?: string | null;
	selectedModelId?: string | null;
}) {
	const { supabase, user } = await requireAuthenticatedUser();
	const name = String(input.name ?? "").trim() || "Onboarding quickstart";
	let workspaceId = String(input.workspaceId ?? "").trim();
	if (!workspaceId) {
		const { data: userRow } = await supabase
			.from("users")
			.select("default_workspace_id")
			.eq("user_id", user.id)
			.maybeSingle();
		const defaultWorkspaceId = String(userRow?.default_workspace_id ?? "").trim();

		if (defaultWorkspaceId) {
			const { data: defaultMembership } = await supabase
				.from("workspace_members")
				.select("workspace_id")
				.eq("user_id", user.id)
				.eq("workspace_id", defaultWorkspaceId)
				.in("role", ["owner", "admin"])
				.maybeSingle();
			workspaceId = String(defaultMembership?.workspace_id ?? "").trim();
		}

		if (!workspaceId) {
			const { data: firstAdminWorkspace } = await supabase
				.from("workspace_members")
				.select("workspace_id")
				.eq("user_id", user.id)
				.in("role", ["owner", "admin"])
				.limit(1)
				.maybeSingle();
			workspaceId = String(firstAdminWorkspace?.workspace_id ?? "").trim();
		}
	}
	if (!workspaceId) throw new Error("No personal workspace found");

	const key = await createApiKeyAction(name, user.id, workspaceId, JSON.stringify([]));
	try {
		await mergeUserOnboardingState({
			workspaceId,
			selectedModelId: input.selectedModelId ?? null,
			createdKeyId: key.id ?? null,
			selectedKeyId: key.id ?? null,
			keyPrefix: key.prefix ?? null,
			completedSteps: ["api-key"],
			status: "started",
		});
	} catch (error) {
		console.error("Failed to save onboarding state after API key creation", {
			userId: user.id,
			workspaceId,
			keyId: key.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return { ...key, workspaceId };
}
