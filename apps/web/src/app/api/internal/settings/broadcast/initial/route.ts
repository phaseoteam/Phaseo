import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsBroadcastInitialData = {
	configuredDestinations: Array<{
		destinationConfig: Record<string, unknown> | null;
		destinationId: string;
		enabled: boolean;
		id: string;
		name: string;
		samplingRate: number;
		updatedAt: string | null;
	}>;
	teamName: string | null;
	workspaceId: string | null;
};

export async function GET() {
	const supabase = await createClient();
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return NextResponse.json({
			configuredDestinations: [],
			teamName: null,
			workspaceId: null,
		} satisfies SettingsBroadcastInitialData);
	}

	const [teamResult, configuredResult] = await Promise.all([
		supabase.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle(),
		supabase
			.from("workspace_broadcast_destinations")
			.select(
				"id, destination_id, name, enabled, sampling_rate, destination_config, updated_at",
			)
			.eq("workspace_id", workspaceId)
			.order("created_at", { ascending: false }),
	]);

	if (teamResult.error) throw new Error(teamResult.error.message);
	if (
		configuredResult.error &&
		!configuredResult.error.message.includes(
			"Could not find the table 'public.workspace_broadcast_destinations'",
		)
	) {
		throw new Error(configuredResult.error.message);
	}

	return NextResponse.json({
		configuredDestinations: (configuredResult.data ?? []).map((row: any) => ({
			id: row.id as string,
			destinationId: row.destination_id as string,
			name: row.name as string,
			enabled: Boolean(row.enabled),
			samplingRate: Number(row.sampling_rate ?? 1),
			destinationConfig: (row.destination_config ?? null) as Record<
				string,
				unknown
			> | null,
			updatedAt: (row.updated_at as string | null) ?? null,
		})),
		teamName: (teamResult.data?.name as string | null) ?? null,
		workspaceId,
	} satisfies SettingsBroadcastInitialData);
}
