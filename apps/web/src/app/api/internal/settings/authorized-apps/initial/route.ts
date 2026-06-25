import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export type SettingsAuthorizedAppsInitialData = {
	authorizedApps: any[];
	signedIn: boolean;
	userId: string | null;
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return NextResponse.json({
			authorizedApps: [],
			signedIn: false,
			userId: null,
		} satisfies SettingsAuthorizedAppsInitialData);
	}

	const { data: authorizedApps, error: appsError } = await supabase
		.from("user_authorized_apps")
		.select("*")
		.order("last_used_at", { ascending: false, nullsFirst: false });

	if (appsError) throw new Error(appsError.message);

	return NextResponse.json({
		authorizedApps: authorizedApps ?? [],
		signedIn: true,
		userId: user.id,
	} satisfies SettingsAuthorizedAppsInitialData);
}
