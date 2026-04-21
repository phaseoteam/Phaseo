"use client";

import React from "react";
import CreateTeamDialog from "@/components/(gateway)/settings/CreateTeamDialog";
import CreateTeamInviteDialog from "@/components/(gateway)/settings/CreateTeamInviteDialog";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import TeamSettingsPanel from "./TeamSettingsPanel";
import TeamsPanel from "./TeamsPanel";
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
	tab?: "members" | "settings";
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
	// Controlled active team id state shared between child panels
	const getInitial = () =>
		initialTeamId && teams.some((t) => t.id === initialTeamId)
			? initialTeamId
			: teams[0]?.id;

	const [activeWorkspaceId, setActiveTeamId] = React.useState<string | undefined>(
		getInitial()
	);

	const manageableTeams = React.useMemo(() => {
		if (!manageableTeamIds?.length) return [] as Team[];
		const allowed = new Set(manageableTeamIds);
		return teams.filter((team) => allowed.has(team.id));
	}, [teams, manageableTeamIds]);

	const canManageActiveTeam = Boolean(
		activeWorkspaceId && manageableTeamIds?.includes(activeWorkspaceId)
	);

	const inviteableTeams = React.useMemo(() => {
		if (!manageableTeams.length) return [];
		if (!activeWorkspaceId) return manageableTeams;
		const idx = manageableTeams.findIndex(
			(team) => team.id === activeWorkspaceId
		);
		if (idx <= 0) return manageableTeams;
		const ordered = manageableTeams.slice();
		const [active] = ordered.splice(idx, 1);
		ordered.unshift(active);
		return ordered;
	}, [manageableTeams, activeWorkspaceId]);

	// Keep client state in sync with server-provided initialTeamId when it changes
	React.useEffect(() => {
		const next = getInitial();
		if (next !== activeWorkspaceId) setActiveTeamId(next);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialTeamId, teams?.length]);

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
							{canManageActiveTeam && inviteableTeams.length ? (
								<CreateTeamInviteDialog
									currentUserId={currentUserId ?? undefined}
									teams={inviteableTeams}
									defaultWorkspaceId={activeWorkspaceId}
								/>
							) : null}
						</>
					}
				/>
			)}

			{tab === "settings" ? (
				<TeamSettingsPanel
					teams={teams}
					membersByTeam={membersByTeam}
					workspaceId={activeWorkspaceId}
					onTeamChange={(id) => setActiveTeamId(id)}
					currentUserId={currentUserId}
					personalTeamId={personalTeamId}
					walletBalances={walletBalances}
					teamSsoSettingsByTeam={teamSsoSettingsByTeam}
				/>
			) : (
				<TeamsPanel
					teams={teams}
					membersByTeam={membersByTeam}
					requestsByTeam={requestsByTeam}
					invitesByTeam={invitesByTeam}
					activeWorkspaceId={activeWorkspaceId}
					onTeamChange={(id) => setActiveTeamId(id)}
					currentUserId={currentUserId}
					personalTeamId={personalTeamId}
					manageableTeamIds={manageableTeamIds}
				/>
			)}
		</div>
	);
}
