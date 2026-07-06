import type { WorkspacePrivacySettings } from "@/app/api/internal/workspace/privacy-settings/route";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export async function fetchWorkspacePrivacySettings(): Promise<WorkspacePrivacySettings | null> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return null;
	}

	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		return null;
	}

	const { data: settingsRow, error: settingsError } = await supabase
		.from("workspace_settings")
		.select(
			"privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids",
		)
		.eq("workspace_id", workspaceId)
		.maybeSingle();

	if (settingsError || !settingsRow) {
		return null;
	}

	const rawMode = String(settingsRow.provider_restriction_mode ?? "")
		.trim()
		.toLowerCase();
	const providerRestrictionMode =
		rawMode === "allowlist" || rawMode === "blocklist" || rawMode === "none"
			? rawMode
			: "none";

	return {
		isAuthenticated: true,
		privacyEnablePaidMayTrain: Boolean(
			settingsRow.privacy_enable_paid_may_train ?? true,
		),
		privacyEnableFreeMayTrain: Boolean(
			settingsRow.privacy_enable_free_may_train ?? true,
		),
		privacyZdrOnly: Boolean(settingsRow.privacy_zdr_only ?? false),
		providerRestrictionMode,
		providerRestrictionProviderIds: Array.isArray(
			settingsRow.provider_restriction_provider_ids,
		)
			? settingsRow.provider_restriction_provider_ids
					.map((value: unknown) => String(value ?? "").trim())
					.filter(Boolean)
			: [],
	} satisfies WorkspacePrivacySettings;
}
