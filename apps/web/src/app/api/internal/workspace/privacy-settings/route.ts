import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type WorkspacePrivacySettings = {
	isAuthenticated: boolean;
	privacyEnablePaidMayTrain: boolean;
	privacyEnableFreeMayTrain: boolean;
	privacyZdrOnly: boolean;
	providerRestrictionMode: "none" | "allowlist" | "blocklist";
	providerRestrictionProviderIds: string[];
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return NextResponse.json(null);
	}

	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		return NextResponse.json(null);
	}

	const { data: settingsRow, error: settingsError } = await supabase
		.from("workspace_settings")
		.select(
			"privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids",
		)
		.eq("workspace_id", workspaceId)
		.maybeSingle();

	if (settingsError) {
		return NextResponse.json(null);
	}

	if (!settingsRow) {
		return NextResponse.json(null);
	}

	const rawMode = String(settingsRow.provider_restriction_mode ?? "")
		.trim()
		.toLowerCase();
	const providerRestrictionMode =
		rawMode === "allowlist" || rawMode === "blocklist" || rawMode === "none"
			? rawMode
			: "none";

	return NextResponse.json({
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
	} satisfies WorkspacePrivacySettings);
}
