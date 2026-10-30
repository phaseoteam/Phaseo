import type { SettingsGuardrailEditorData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsGuardrailEditorData(
	mode: "create" | "edit",
	guardrailId?: string | null,
): Promise<SettingsGuardrailEditorData> {
	const context = await getServerAccountContext();
	const params = new URLSearchParams({ mode });
	if (context.workspaceId) params.set("workspaceId", context.workspaceId);
	const normalizedGuardrailId = String(guardrailId ?? "").trim();
	if (normalizedGuardrailId) params.set("guardrailId", normalizedGuardrailId);
	return fetchAccountWebApi<SettingsGuardrailEditorData>(
		`/api/account/settings/guardrails/editor?${params.toString()}`,
		context.accessToken,
	);
}
