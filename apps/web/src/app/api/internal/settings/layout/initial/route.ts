import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsLayoutInitialData = {
	isEnterpriseInvoiceMode: boolean;
	showBroadcast: boolean;
	signedIn: boolean;
};

export async function GET() {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const userId = authData.user?.id ?? null;

	if (!userId) {
		return NextResponse.json({
			isEnterpriseInvoiceMode: false,
			showBroadcast: false,
			signedIn: false,
		} satisfies SettingsLayoutInitialData);
	}

	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		return NextResponse.json({
			isEnterpriseInvoiceMode: false,
			showBroadcast: false,
			signedIn: true,
		} satisfies SettingsLayoutInitialData);
	}

	const [{ data: membership }, { data: teamRow }] = await Promise.all([
		supabase
			.from("workspace_members")
			.select("role")
			.eq("workspace_id", workspaceId)
			.eq("user_id", userId)
			.maybeSingle(),
		supabase
			.from("workspaces")
			.select("tier,billing_mode")
			.eq("id", workspaceId)
			.maybeSingle(),
	]);

	const tier = String(teamRow?.tier ?? "").toLowerCase();
	const billingMode = String(teamRow?.billing_mode ?? "wallet").toLowerCase();

	return NextResponse.json({
		isEnterpriseInvoiceMode: tier === "enterprise" && billingMode === "invoice",
		showBroadcast: (membership?.role ?? "").toLowerCase() === "admin",
		signedIn: true,
	} satisfies SettingsLayoutInitialData);
}
