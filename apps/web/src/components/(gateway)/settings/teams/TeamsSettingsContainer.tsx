"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import CreateTeamInviteDialog from "@/components/(gateway)/settings/CreateTeamInviteDialog";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Button } from "@/components/ui/button";
import TeamSettingsPanel from "./TeamSettingsPanel";
import TeamsMembers from "./members/TeamsMembers";
import TeamsAccessPanel from "./TeamsAccessPanel";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";

type Team = { id: string; name: string; publisherHandle?: string | null; logoUrl?: string | null };

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
	canConfigureEnterprise?: boolean;
	hideTitle?: boolean;
	sampleMembersPreview?: boolean;
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
	canConfigureEnterprise = false,
	hideTitle = false,
	sampleMembersPreview = false,
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
	const pageDescription =
		tab === "settings"
			? "Manage this workspace's details and security."
			: tab === "access"
				? "Review join requests and workspace invitations."
				: "Manage the people in this workspace.";
	const canInvite = Boolean(
		canManageActiveTeam && activeTeam && tab !== "settings",
	);
	const accessHref = activeWorkspaceId
		? `/settings/workspaces/access?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
		: "/settings/workspaces/access";

	return (
		<div className="space-y-6">
			{hideTitle ? null : (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<SettingsPageHeader
						title={activeTeam?.name ?? "Workspace settings"}
						description={pageDescription}
						className="min-w-0 flex-1"
					/>
					{canInvite && activeTeam ? (
						<div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pt-1">
							{tab === "members" ? (
								<Button asChild variant="ghost" size="sm">
									<Link href={accessHref}>
										Manage Invites
										<ArrowRight className="size-3.5" />
									</Link>
								</Button>
							) : null}
								<CreateTeamInviteDialog
									currentUserId={currentUserId ?? undefined}
									teams={[activeTeam]}
									defaultWorkspaceId={activeWorkspaceId}
								/>
						</div>
					) : null}
				</div>
			)}

			{tab === "settings" ? (
				<TeamSettingsPanel
					key={activeWorkspaceId}
					teams={teams}
					membersByTeam={membersByTeam}
					workspaceId={activeWorkspaceId}
					currentUserId={currentUserId}
					personalTeamId={personalTeamId}
					walletBalances={walletBalances}
					teamSsoSettingsByTeam={teamSsoSettingsByTeam}
					canConfigureEnterprise={canConfigureEnterprise}
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
					samplePreview={sampleMembersPreview}
				/>
			)}
		</div>
	);
}
