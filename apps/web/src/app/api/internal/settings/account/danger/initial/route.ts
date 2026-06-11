import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export type SettingsAccountDangerInitialData = {
	signedIn: boolean;
};

export async function GET() {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();

	return NextResponse.json({
		signedIn: Boolean(authData.user),
	} satisfies SettingsAccountDangerInitialData);
}
