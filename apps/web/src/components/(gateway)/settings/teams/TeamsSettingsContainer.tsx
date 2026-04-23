"use client";

import React from "react";
import CreateTeamDialog from "@/components/(gateway)/settings/CreateTeamDialog";
import CreateTeamInviteDialog from "@/components/(gateway)/settings/CreateTeamInviteDialog";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import TeamSettingsPanel from "./TeamSettingsPanel";
import TeamsInvites from "./TeamsInvites";
import TeamsRequests from "./JoinRequests/TeamsRequests";
import TeamsMembers from "./members/TeamsMembers";

type Team = { id: string; name: string };

type Props = {
	teams: Team[];
	membersByTeam: Record<string, any[]>;
	invitesByTeam?: Record<string, any[]>;
	requestsByTeam: Record<string, any[]>;
	initialTeamId?: string | null;
	currentUserId?: string | null;
	personalTeamId?: string | null;
	manageableTeamIds?: string[];
	walletBalances?: Record<string, number>;
	hideTitle?: boolean;
	tab?: "general" | "access" | "members" | "settings";
};

export default function TeamsSettingsContainer({
	teams,
	membersByTeam,
	invitesByTeam,
	requestsByTeam,
	initialTeamId,
	currentUserId,
	personalTeamId,
	manageableTeamIds,
	walletBalances,
	hideTitle = false,
	tab = "general",
}: Props) {
	const normalizedTab = React.useMemo<"general" | "access">(
		() => (tab === "access" ? "access" : "general"),
		[tab],
	);
	const activeWorkspaceId = React.useMemo(
		() =>
			initialTeamId && teams.some((team) => team.id === initialTeamId)
				? initialTeamId
				: teams[0]?.id,
		[initialTeamId, teams],
	);

	const manageableTeams = React.useMemo(() => {
		if (!manageableTeamIds?.length) return [] as Team[];
		const allowed = new Set(manageableTeamIds);
		return teams.filter((team) => allowed.has(team.id));
	}, [teams, manageableTeamIds]);

	const canManageActiveTeam = Boolean(
		activeWorkspaceId && manageableTeamIds?.includes(activeWorkspaceId)
	);

	const inviteDefaultWorkspaceId = React.useMemo(() => {
		if (activeWorkspaceId && manageableTeamIds?.includes(activeWorkspaceId)) {
			return activeWorkspaceId;
		}
		return manageableTeams[0]?.id;
	}, [manageableTeamIds, manageableTeams, activeWorkspaceId]);

	return (
		<div className="space-y-6">
			{hideTitle ? null : (
				<SettingsPageHeader
					title="Workspaces"
					description="Manage workspaces, members, and workspace-level access controls."
					actions={
						<>
							<CreateTeamDialog
								currentUserId={currentUserId ?? undefined}
							/>
							{normalizedTab === "access" &&
							canManageActiveTeam &&
							manageableTeams.length ? (
								<CreateTeamInviteDialog
									currentUserId={currentUserId ?? undefined}
									teams={manageableTeams}
									defaultWorkspaceId={inviteDefaultWorkspaceId}
								/>
							) : null}
						</>
					}
				/>
			)}

			{normalizedTab === "general" ? (
				<div className="grid w-full gap-4">
					<TeamSettingsPanel
						teams={teams}
						membersByTeam={membersByTeam}
						workspaceId={activeWorkspaceId}
						currentUserId={currentUserId}
						personalTeamId={personalTeamId}
						walletBalances={walletBalances}
					/>
					<TeamsMembers
						teams={teams}
						membersByTeam={membersByTeam}
						currentUserId={currentUserId}
						activeWorkspaceId={activeWorkspaceId}
						personalTeamId={personalTeamId}
					/>
				</div>
			) : (
				<div className="grid w-full gap-4">
					{canManageActiveTeam ? (
						<>
							<TeamsRequests
								teams={manageableTeams}
								requestsByTeam={requestsByTeam}
								activeWorkspaceId={activeWorkspaceId}
							/>
							<TeamsInvites
								teams={manageableTeams}
								invitesByTeam={invitesByTeam}
								activeWorkspaceId={activeWorkspaceId}
								membersByTeam={membersByTeam}
								currentUserId={currentUserId}
							/>
						</>
					) : (
						<div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
							Join requests and invites are visible to workspace owners/admins.
							Select a workspace where you are owner/admin from the header to
							manage access.
						</div>
					)}
				</div>
			)}
		</div>
	);
}
