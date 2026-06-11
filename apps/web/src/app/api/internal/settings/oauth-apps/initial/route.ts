import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsOAuthAppsInitialData = {
	initialTeamId: string | null;
	oauthApps: any[];
	signedIn: boolean;
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({
			initialTeamId: null,
			oauthApps: [],
			signedIn: false,
		} satisfies SettingsOAuthAppsInitialData);
	}

	const initialTeamId = (await getWorkspaceIdFromCookie()) ?? null;

	const { data, error } = await supabase
		.from("oauth_apps_with_stats")
		.select("*")
		.eq("workspace_id", initialTeamId)
		.order("created_at", { ascending: false });

	if (error) throw new Error(error.message);

	return NextResponse.json({
		initialTeamId,
		oauthApps: data ?? [],
		signedIn: true,
	} satisfies SettingsOAuthAppsInitialData);
}
