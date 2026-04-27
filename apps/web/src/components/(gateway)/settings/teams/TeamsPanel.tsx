"use client";

import React from "react";
import TeamsMembers from "./members/TeamsMembers";
import TeamsRequests from "./JoinRequests/TeamsRequests";
import TeamsInvites from "./TeamsInvites";

interface Team {
	id: string;
	name: string;
}

interface Props {
	teams: Team[];
	membersByTeam: Record<string, any[]>;
	requestsByTeam: Record<string, any[]>;
	invitesByTeam?: Record<string, any[]>;
	activeWorkspaceId?: string | undefined | null;
	onTeamChange?: (id?: string) => void;
	currentUserId?: string | null;
	personalTeamId?: string | null;
	manageableTeamIds?: string[];
}

export default function TeamsPanel({
	teams,
	membersByTeam,
	requestsByTeam,
	invitesByTeam,
	activeWorkspaceId,
	onTeamChange,
	currentUserId,
	personalTeamId,
	manageableTeamIds,
}: Props) {
	const manageableTeams = React.useMemo(() => {
		if (!manageableTeamIds?.length) return [] as Team[];
		const allowed = new Set(manageableTeamIds);
		return teams.filter((team) => allowed.has(team.id));
	}, [teams, manageableTeamIds]);
	const canManageActiveTeam = Boolean(
		activeWorkspaceId && manageableTeamIds?.includes(activeWorkspaceId)
	);

	// activeWorkspaceId is controlled by parent; compute a fallback value for rendering
	const fallbackActiveTeamId =
		(activeWorkspaceId && teams.find((t) => t.id === activeWorkspaceId)
			? activeWorkspaceId
			: teams[0]?.id) || undefined;

	if (!teams.length) {
		return (
			<div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
				No workspaces available yet. Create a workspace to manage members,
				requests, and invites.
			</div>
		);
	}

	return (
		<div className="grid w-full gap-4">
			<TeamsMembers
				teams={teams}
				membersByTeam={membersByTeam}
				currentUserId={currentUserId}
				activeWorkspaceId={fallbackActiveTeamId}
				onTeamChange={onTeamChange}
				personalTeamId={personalTeamId}
			/>
			{canManageActiveTeam ? (
				<>
					<TeamsRequests
						teams={manageableTeams}
						requestsByTeam={requestsByTeam}
						activeWorkspaceId={activeWorkspaceId ?? undefined}
						onTeamChange={onTeamChange}
					/>
					<TeamsInvites
						teams={manageableTeams}
						invitesByTeam={invitesByTeam}
						activeWorkspaceId={activeWorkspaceId ?? undefined}
						onTeamChange={onTeamChange}
						membersByTeam={membersByTeam}
						currentUserId={currentUserId}
					/>
				</>
			) : null}
		</div>
	);
}
