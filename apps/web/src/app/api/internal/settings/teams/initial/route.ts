import { NextRequest, NextResponse } from "next/server";
import { getTeamsSettingsData } from "@/app/(dashboard)/settings/teams/teamsData";

export async function GET(request: NextRequest) {
	const preferredWorkspaceId =
		request.nextUrl.searchParams.get("preferredWorkspaceId")?.trim() || null;
	const data = await getTeamsSettingsData(preferredWorkspaceId);

	return NextResponse.json(data);
}
