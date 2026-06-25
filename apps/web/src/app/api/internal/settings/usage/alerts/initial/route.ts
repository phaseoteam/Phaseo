import { NextResponse } from "next/server";
import {
	getDeprecationWarningsForTeam,
	type DeprecationWarning,
} from "@/lib/fetchers/usage/deprecationWarnings";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsUsageAlertsInitialData = {
	signedIn: boolean;
	warnings: DeprecationWarning[];
	workspaceId: string | null;
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({
			signedIn: false,
			warnings: [],
			workspaceId: null,
		} satisfies SettingsUsageAlertsInitialData);
	}

	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return NextResponse.json({
			signedIn: true,
			warnings: [],
			workspaceId: null,
		} satisfies SettingsUsageAlertsInitialData);
	}

	const warnings = await getDeprecationWarningsForTeam(workspaceId);

	return NextResponse.json({
		signedIn: true,
		warnings,
		workspaceId,
	} satisfies SettingsUsageAlertsInitialData);
}
