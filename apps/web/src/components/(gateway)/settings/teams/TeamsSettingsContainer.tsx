"use client";

import CreateTeamDialog from "@/components/(gateway)/settings/CreateTeamDialog";
import CreateTeamInviteDialog from "@/components/(gateway)/settings/CreateTeamInviteDialog";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Badge } from "@/components/ui/badge";
import TeamSettingsPanel from "./TeamSettingsPanel";
import TeamsMembers from "./members/TeamsMembers";
import TeamsAccessPanel from "./TeamsAccessPanel";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";

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
	teamSsoSettingsByTeam?: Record<string, TeamSsoSettingsRow>;
	hideTitle?: boolean;
	tab?: "members" | "access" | "settings";
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
	teamSsoSettingsByTeam,
	hideTitle = false,
	tab = "members",
}: Props) {
	const activeWorkspaceId =
		initialTeamId && teams.some((team) => team.id === initialTeamId)
			? initialTeamId
			: teams[0]?.id;
	const activeTeam = teams.find((team) => team.id === activeWorkspaceId);

	const canManageActiveTeam = Boolean(
		activeWorkspaceId && manageableTeamIds?.includes(activeWorkspaceId)
	);

	return (
		<div className="space-y-6">
			{hideTitle ? null : (
				<SettingsPageHeader
					title="Workspaces"
					description="Manage workspaces, members, and workspace-level access controls."
					meta={
						activeTeam ? (
							<Badge variant="outline" className="h-6 px-2 text-xs font-medium">
								{activeTeam.name}
							</Badge>
						) : null
					}
					actions={
						<div className="flex flex-wrap items-center gap-2">
							<CreateTeamDialog
								currentUserId={currentUserId ?? undefined}
							/>
							{canManageActiveTeam && activeTeam ? (
								<CreateTeamInviteDialog
									currentUserId={currentUserId ?? undefined}
									teams={[activeTeam]}
									defaultWorkspaceId={activeWorkspaceId}
								/>
							) : null}
						</div>
					}
				/>
			)}

			{tab === "settings" ? (
				<TeamSettingsPanel
					teams={teams}
					membersByTeam={membersByTeam}
					workspaceId={activeWorkspaceId}
					currentUserId={currentUserId}
					personalTeamId={personalTeamId}
					walletBalances={walletBalances}
					teamSsoSettingsByTeam={teamSsoSettingsByTeam}
				/>
			) : tab === "access" ? (
				<TeamsAccessPanel
					requestsByTeam={requestsByTeam}
					invitesByTeam={invitesByTeam}
					membersByTeam={membersByTeam}
					activeWorkspaceId={activeWorkspaceId}
					activeWorkspaceName={activeTeam?.name}
					currentUserId={currentUserId}
					canManageWorkspace={canManageActiveTeam}
				/>
			) : (
				<TeamsMembers
					membersByTeam={membersByTeam}
					activeWorkspaceId={activeWorkspaceId}
					activeWorkspaceName={activeTeam?.name}
					currentUserId={currentUserId}
					personalTeamId={personalTeamId}
				/>
			)}
		</div>
	);
}
