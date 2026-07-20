"use server";

import { revalidatePath } from "next/cache";
import { createApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

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
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	const result = await fetchAccountWebApi<{ state: Record<string, unknown> }>("/api/account/auth/onboarding", accessToken, { method: "PUT", body: JSON.stringify({ ...input, completedSteps: normaliseSteps(input.completedSteps) }) });
	revalidatePath("/onboarding");
	return result;
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
	const name = String(input.name ?? "").trim() || "Onboarding quickstart";
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	const requested = String(input.workspaceId ?? "").trim();
	const resolved = await fetchAccountWebApi<{ userId: string; workspaceId: string | null }>(
		`/api/account/auth/workspace?roles=owner,admin&persist=0${requested ? `&requested=${encodeURIComponent(requested)}` : ""}`,
		accessToken,
	);
	const workspaceId = String(resolved.workspaceId ?? "").trim();
	if (!workspaceId) throw new Error("No personal workspace found");

	const key = await createApiKeyAction(name, resolved.userId, workspaceId, JSON.stringify([]));
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
			userId: resolved.userId,
			workspaceId,
			keyId: key.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return { ...key, workspaceId };
}
