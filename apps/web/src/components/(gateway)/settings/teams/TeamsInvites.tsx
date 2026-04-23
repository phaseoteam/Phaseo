"use client";

import React from "react";
import TeamInviteDialog from "./TeamInviteDialog";
import { Infinity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface Invite {
	id: string;
	workspace_id: string;
	creator_user_id: string;
	role: string;
	token_encrypted: string;
	token_preview: string;
	expires_at: string | null;
	created_at: string;
	max_uses: number | null;
	uses_count: number | null;
	users?: { display_name?: string };
}

interface Team {
	id: string;
	name: string;
}

interface Props {
	teams: Team[];
	invitesByTeam?: Record<string, Invite[]>;
	membersByTeam?: Record<string, any[]>;
	activeWorkspaceId?: string | undefined;
	currentUserId?: string | null;
}

function statusBadgeClass(status: "active" | "expired") {
	return status === "active"
		? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
		: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300";
}

export default function TeamsInvites({
	teams,
	invitesByTeam,
	membersByTeam,
	currentUserId,
	activeWorkspaceId: controlledActiveId,
}: Props) {
	const [selectedInvite, setSelectedInvite] = React.useState<Invite | null>(null);

	const activeWorkspaceId =
		controlledActiveId && teams.some((team) => team.id === controlledActiveId)
			? controlledActiveId
			: teams[0]?.id;

	const mergedInvites = React.useMemo(() => invitesByTeam || {}, [invitesByTeam]);
	const activeInvites = React.useMemo(() => {
		if (!activeWorkspaceId) return [];
		const invites = (mergedInvites[activeWorkspaceId] || []).slice();
		invites.sort((a, b) => {
			if (!a.expires_at && !b.expires_at) return 0;
			if (!a.expires_at) return 1;
			if (!b.expires_at) return -1;
			const da = new Date(a.expires_at as string).getTime();
			const db = new Date(b.expires_at as string).getTime();
			return db - da;
		});
		return invites;
	}, [activeWorkspaceId, mergedInvites]);

	const activeTeam = teams.find((t) => t.id === activeWorkspaceId);
	const counts = React.useMemo(() => {
		let active = 0;
		let expired = 0;
		for (const inv of activeInvites) {
			const isExpired = inv.expires_at ? new Date(inv.expires_at) < new Date() : false;
			if (isExpired) expired++;
			else active++;
		}
		return { active, expired, total: activeInvites.length };
	}, [activeInvites]);

	const selectedInviteCanManage = React.useMemo(() => {
		if (!selectedInvite || !currentUserId) return false;
		if (selectedInvite.creator_user_id === currentUserId) return true;

		const teamMembers = membersByTeam?.[selectedInvite.workspace_id] ?? [];
		const currentMembership = teamMembers.find(
			(member: any) => member?.user_id === currentUserId,
		);
		const role = String(currentMembership?.role ?? "").toLowerCase();
		return role === "owner" || role === "admin";
	}, [selectedInvite, currentUserId, membersByTeam]);

	return (
		<section className="space-y-3">
			<div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h3 className="text-base font-semibold">Invites</h3>
					<p className="text-sm text-muted-foreground">
						View and manage invites for this workspace.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{counts.total} total</Badge>
					<Badge variant="secondary">{counts.active} active</Badge>
				</div>
			</div>

			{!activeTeam ? (
				<div className="text-sm text-muted-foreground">
					No workspaces available.
				</div>
			) : activeInvites.length === 0 ? (
				<div className="text-sm text-muted-foreground">
					No invites for {activeTeam.name} yet.
				</div>
			) : (
				<div className="overflow-hidden rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Creator</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Expires</TableHead>
								<TableHead>Uses</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{activeInvites.map((invite) => {
								const expired = invite.expires_at
									? new Date(invite.expires_at) < new Date()
									: false;
								const status: "active" | "expired" = expired ? "expired" : "active";
								return (
									<TableRow
										key={invite.id}
										className="cursor-pointer"
										onClick={() => setSelectedInvite(invite)}
									>
										<TableCell>
											<div className="min-w-0">
												<div className="truncate text-sm font-medium">
													{invite.users?.display_name ?? "Unknown"}
												</div>
												<div className="truncate text-xs text-muted-foreground">
													{new Date(invite.created_at).toLocaleDateString()}
												</div>
											</div>
										</TableCell>
										<TableCell className="capitalize">{invite.role}</TableCell>
										<TableCell className="text-muted-foreground">
											{invite.expires_at
												? new Date(invite.expires_at).toLocaleDateString()
												: "No expiry"}
										</TableCell>
										<TableCell className="text-muted-foreground">
											<span className="inline-flex items-center gap-1">
												{invite.uses_count ?? 0}
												/
												{invite.max_uses ?? <Infinity className="h-3.5 w-3.5" />}
											</span>
										</TableCell>
										<TableCell>
											<span
												className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium capitalize ${statusBadgeClass(
													status,
												)}`}
											>
												{status}
											</span>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{selectedInvite ? (
				<TeamInviteDialog
					invite={selectedInvite}
					open={true}
					onOpenChange={(v: boolean) => {
						if (!v) setSelectedInvite(null);
					}}
					currentUserId={currentUserId}
					canManageInvite={selectedInviteCanManage}
				/>
			) : null}
		</section>
	);
}
