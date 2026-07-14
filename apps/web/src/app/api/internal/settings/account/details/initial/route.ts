import { NextResponse } from "next/server";
import type { UserPayload } from "@/components/(gateway)/settings/account/AccountSettingsClient";
import { getUserObfuscationPreference } from "@/lib/fetchers/account/getUserObfuscationPreference";
import { createClient } from "@/utils/supabase/server";

export type SettingsAccountDetailsInitialData = {
	hasPassword: boolean;
	teams: Array<{
		id: string;
		name: string;
	}>;
	user: UserPayload | null;
};

export async function GET() {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const authUser = authData.user;

	if (!authUser) {
		return NextResponse.json({
			hasPassword: false,
			teams: [],
			user: null,
		} satisfies SettingsAccountDetailsInitialData);
	}

	const [userRowResult, teamMembersResult, obfuscateInfo] = await Promise.all([
		supabase
			.from("users")
			.select("user_id, display_name, default_workspace_id, created_at")
			.eq("user_id", authUser.id)
			.maybeSingle(),
		supabase
			.from("workspace_members")
			.select("workspace_id, teams:workspaces(id, name)")
			.eq("user_id", authUser.id),
		getUserObfuscationPreference(authUser.id),
	]);

	if (userRowResult.error) throw new Error(userRowResult.error.message);
	if (teamMembersResult.error) throw new Error(teamMembersResult.error.message);

	const provider = authUser.app_metadata?.provider;
	const isOAuthUser = provider && provider !== "email";
	const userRow = userRowResult.data;

	const teams = (teamMembersResult.data ?? [])
		.map((teamMember: any) => {
			const team = Array.isArray(teamMember.teams)
				? teamMember.teams[0]
				: teamMember.teams;
			return team && team.id && team.name
				? { id: team.id as string, name: team.name as string }
				: null;
		})
		.filter((team): team is { id: string; name: string } => Boolean(team));

	return NextResponse.json({
		hasPassword: !isOAuthUser,
		teams,
		user: {
			id: authUser.id,
			displayName: userRow?.display_name,
			email: authUser.email ?? null,
			defaultWorkspaceId: userRow?.default_workspace_id ?? null,
			obfuscateInfo,
			createdAt: userRow?.created_at,
		},
	} satisfies SettingsAccountDetailsInitialData);
}
