"use client";

import React from "react";
import CreateTeamDialog from "@/components/(gateway)/settings/CreateTeamDialog";
import CreateTeamInviteDialog from "@/components/(gateway)/settings/CreateTeamInviteDialog";
import TeamSettingsPanel from "./TeamSettingsPanel";
import TeamsPanel from "./TeamsPanel";

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
}: Props) {
	// Controlled active team id state shared between child panels
	const getInitial = () =>
		initialTeamId && teams.some((t) => t.id === initialTeamId)
			? initialTeamId
			: teams[0]?.id;

	const [activeTeamId, setActiveTeamId] = React.useState<string | undefined>(
		getInitial()
	);

	const manageableTeams = React.useMemo(() => {
		if (!manageableTeamIds?.length) return [] as Team[];
		const allowed = new Set(manageableTeamIds);
		return teams.filter((team) => allowed.has(team.id));
	}, [teams, manageableTeamIds]);

	const canManageActiveTeam = Boolean(
		activeTeamId && manageableTeamIds?.includes(activeTeamId)
	);

	const inviteableTeams = React.useMemo(() => {
		if (!manageableTeams.length) return [];
		if (!activeTeamId) return manageableTeams;
		const idx = manageableTeams.findIndex(
			(team) => team.id === activeTeamId
		);
		if (idx <= 0) return manageableTeams;
		const ordered = manageableTeams.slice();
		const [active] = ordered.splice(idx, 1);
		ordered.unshift(active);
		return ordered;
	}, [manageableTeams, activeTeamId]);

	// Keep client state in sync with server-provided initialTeamId when it changes
	React.useEffect(() => {
		const next = getInitial();
		if (next !== activeTeamId) setActiveTeamId(next);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialTeamId, teams?.length]);

	return (
		<div className="space-y-6">
			<div
				className={`flex flex-col gap-3 sm:flex-row sm:items-center ${hideTitle ? "sm:justify-end" : "sm:justify-between"}`}
			>
				{hideTitle ? null : <h1 className="text-2xl font-bold">Teams</h1>}
				<div className="flex flex-wrap items-center gap-2">
					<CreateTeamDialog
						currentUserId={currentUserId ?? undefined}
					/>
					{canManageActiveTeam && inviteableTeams.length ? (
						<CreateTeamInviteDialog
							currentUserId={currentUserId ?? undefined}
							teams={inviteableTeams}
							defaultTeamId={activeTeamId}
						/>
					) : null}
				</div>
			</div>

			<TeamSettingsPanel
				teams={teams}
				membersByTeam={membersByTeam}
				teamId={activeTeamId}
				onTeamChange={(id) => setActiveTeamId(id)}
				currentUserId={currentUserId}
				personalTeamId={personalTeamId}
				walletBalances={walletBalances}
			/>

			<TeamsPanel
				teams={teams}
				membersByTeam={membersByTeam}
				requestsByTeam={requestsByTeam}
				invitesByTeam={invitesByTeam}
				activeTeamId={activeTeamId}
				onTeamChange={(id) => setActiveTeamId(id)}
				currentUserId={currentUserId}
				personalTeamId={personalTeamId}
				manageableTeamIds={manageableTeamIds}
			/>
		</div>
	);
}
