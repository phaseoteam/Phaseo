import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsPresetsInitialData = {
	currentUserId: string | undefined;
	initialTeamId: string | null;
	teams: Array<{
		id: string;
		name: string;
	}>;
	teamsWithPresets: Array<{
		id: string;
		name: string;
		presets: any[];
	}>;
};

export async function GET() {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return NextResponse.json({
			currentUserId: undefined,
			initialTeamId: null,
			teams: [],
			teamsWithPresets: [],
		} satisfies SettingsPresetsInitialData);
	}

	const initialTeamId = (await getWorkspaceIdFromCookie()) ?? null;

	const [teamUsersResult, presetsResult] = await Promise.all([
		supabase
			.from("workspace_members")
			.select("workspace_id, teams:workspaces(id, name)")
			.eq("user_id", user.id),
		initialTeamId
			? supabase.from("presets").select("*").eq("workspace_id", initialTeamId)
			: Promise.resolve({ data: [], error: null }),
	]);

	if (teamUsersResult.error) throw new Error(teamUsersResult.error.message);
	if (presetsResult.error) throw new Error(presetsResult.error.message);

	const teams: Array<{ id: string; name: string }> = [];

	for (const teamUser of teamUsersResult.data ?? []) {
		const rawTeam = (teamUser as any)?.teams;
		const team = Array.isArray(rawTeam) ? rawTeam[0] : rawTeam;
		if (team?.id && team?.name) {
			teams.push({ id: team.id as string, name: team.name as string });
		}
	}

	const activeTeam = teams.find((team) => team.id === initialTeamId);

	return NextResponse.json({
		currentUserId: user.id,
		initialTeamId,
		teams,
		teamsWithPresets: activeTeam
			? [{ ...activeTeam, presets: (presetsResult.data ?? []) as any[] }]
			: [],
	} satisfies SettingsPresetsInitialData);
}
