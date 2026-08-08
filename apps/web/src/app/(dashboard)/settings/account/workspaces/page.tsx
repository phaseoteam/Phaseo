import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";

import CreateTeamDialog from "@/components/(gateway)/settings/CreateTeamDialog";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSettingsTeamsInitialData } from "@/lib/fetchers/internal/fetchSettingsTeamsInitialData";

export const metadata = {
	title: "Workspaces - Account Settings",
};

export default async function AccountWorkspacesPage() {
	const data = await fetchSettingsTeamsInitialData();
	const manageable = new Set(data.manageableTeamIds);
	const activeWorkspace = data.teams.find(
		(workspace) => workspace.id === data.initialTeamId,
	);
	const orderedWorkspaces = activeWorkspace
		? [
				activeWorkspace,
				...data.teams.filter((workspace) => workspace.id !== activeWorkspace.id),
			]
		: data.teams;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<SettingsPageHeader
					title="Workspaces"
					description="Create workspaces and choose which ones you want to manage."
					className="min-w-0 flex-1"
				/>
				<div className="shrink-0 sm:pt-1">
					<CreateTeamDialog currentUserId={data.currentUserId ?? undefined} />
				</div>
			</div>

			<div className="divide-y border-y">
				{orderedWorkspaces.map((workspace) => {
					const memberCount = data.membersByTeam[workspace.id]?.length ?? 0;
					const membership = (data.membersByTeam[workspace.id] ?? []).find(
						(member) => member.user_id === data.currentUserId,
					);
					const isPersonal = workspace.id === data.personalTeamId;
					return (
						<div key={workspace.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex min-w-0 items-start gap-3">
								<div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/30">
									<Building2 className="size-4 text-muted-foreground" />
								</div>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="truncate text-sm font-medium">{workspace.name}</p>
										{isPersonal ? <Badge variant="secondary">Personal</Badge> : null}
										{membership?.role ? <Badge variant="outline" className="capitalize">{membership.role}</Badge> : null}
									</div>
									<p className="mt-1 text-xs text-muted-foreground">
										{memberCount} {memberCount === 1 ? "member" : "members"}
									</p>
								</div>
							</div>
							<Button asChild variant="outline" size="sm">
								<Link href={`/settings/workspaces/${manageable.has(workspace.id) ? "settings" : "members"}?workspaceId=${encodeURIComponent(workspace.id)}`}>
									{manageable.has(workspace.id) ? "Open Settings" : "View members"}
									<ArrowUpRight className="size-3.5" />
								</Link>
							</Button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
