"use client";

import React from "react";
import TeamInviteDialog from "./TeamInviteDialog";
import { Infinity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";

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
	onTeamChange?: (id?: string) => void;
	currentUserId?: string | null;
}

export default function TeamsInvites({
	teams,
	invitesByTeam,
	onTeamChange,
	membersByTeam,
	currentUserId,
	activeWorkspaceId: controlledActiveId,
}: Props) {
	const [localActiveTeamId, setLocalActiveTeamId] = React.useState<
		string | undefined
	>(teams.length ? teams[0].id : undefined);
	const [selectedInvite, setSelectedInvite] = React.useState<Invite | null>(
		null
	);

	const activeWorkspaceId = controlledActiveId ?? localActiveTeamId;
	const setActiveTeamId = React.useCallback(
		(id?: string) => {
			if (onTeamChange) onTeamChange(id);
			else setLocalActiveTeamId(id);
		},
		[onTeamChange]
	);

	React.useEffect(() => {
		if (!teams.length) {
			setActiveTeamId(undefined);
			return;
		}
		if (!activeWorkspaceId) {
			setActiveTeamId(teams[0].id);
			return;
		}
		if (!teams.find((t) => t.id === activeWorkspaceId)) {
			setActiveTeamId(teams[0].id);
		}
	}, [teams, activeWorkspaceId, setActiveTeamId]);

	const mergedInvites = React.useMemo(
		() => invitesByTeam || {},
		[invitesByTeam]
	);
	const activeInvites = React.useMemo(() => {
		if (!activeWorkspaceId) return [];
		const invites = (mergedInvites[activeWorkspaceId] || []).slice();
		// sort by expiry date ascending (soonest first). null expiry (no expiry) go last
		invites.sort((a, b) => {
			if (!a.expires_at && !b.expires_at) return 0;
			if (!a.expires_at) return 1; // a has no expiry -> put after b
			if (!b.expires_at) return -1; // b has no expiry -> put after a
			const da = new Date(a.expires_at as string).getTime();
			const db = new Date(b.expires_at as string).getTime();
			// descending: newest expiry first
			return db - da;
		});
		return invites;
	}, [activeWorkspaceId, mergedInvites]);

	const activeTeam = teams.find((t) => t.id === activeWorkspaceId);
	const counts = React.useMemo(() => {
		let active = 0;
		let expired = 0;
		for (const inv of activeInvites) {
			const isExpired = inv.expires_at
				? new Date(inv.expires_at) < new Date()
				: false;
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
		<Card className="h-full">
			<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<CardTitle className="text-base">Invites</CardTitle>
					<CardDescription>
						View and manage invites for this workspace.
					</CardDescription>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{counts.total} total</Badge>
					<Badge variant="secondary">{counts.active} active</Badge>
					<Select
						value={activeWorkspaceId}
						onValueChange={(v) => setActiveTeamId(v)}
					>
						<SelectTrigger className="w-full sm:w-[200px]">
							<SelectValue placeholder="Select workspace…" />
						</SelectTrigger>
						<SelectContent>
							{teams.map((t) => (
								<SelectItem key={t.id} value={t.id}>
									{t.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</CardHeader>

			<CardContent>
				{!activeTeam ? (
					<div className="text-sm text-muted-foreground">
						No workspaces available.
					</div>
				) : activeInvites.length === 0 ? (
					<div className="text-sm text-muted-foreground">
						No invites for {activeTeam.name} yet.
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						{activeInvites.map((i) => {
							const expired = i.expires_at
								? new Date(i.expires_at) < new Date()
								: false;
							const status = expired ? "expired" : "active";
							return (
								<Card
									key={i.id}
									className="cursor-pointer border p-3 shadow-sm transition hover:shadow-md"
									onClick={() => setSelectedInvite(i)}
								>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
										<div className="min-w-0 flex-1">
											<div className="flex items-center justify-between">
												<div className="truncate">
													<div className="truncate text-sm font-medium">
														Created by{" "}
														{i.users
															?.display_name ??
															"Unknown"}
													</div>
													<div className="text-xs text-muted-foreground">
														Created{" "}
														{new Date(
															i.created_at
														).toLocaleDateString()}
													</div>
												</div>
												<div className="ml-2">
													<Badge
														className="h-auto px-2 py-0.5 text-xs capitalize"
														variant={
															i.role === "owner"
																? "default"
																: i.role ===
																  "admin"
																? "secondary"
																: "outline"
														}
													>
														{i.role}
													</Badge>
												</div>
											</div>

											<div className="mt-2 flex items-center justify-between text-xs">
												<div className="text-muted-foreground">
													{i.expires_at
														? `Expires ${new Date(
																i.expires_at
														  ).toLocaleDateString()}`
														: "No expiry"}
												</div>
												<div className="flex items-center gap-2">
													<div className="flex items-center gap-1 text-muted-foreground">
														<span>
															Uses:{" "}
															{i.uses_count ?? 0}
														</span>
														{i.max_uses ? (
															<span>
																/ {i.max_uses}
															</span>
														) : (
															<span className="flex items-center gap-0.5">
																/{" "}
																<Infinity className="h-3.5 w-3.5 opacity-80" />
															</span>
														)}
													</div>
													{/* Status badge with clearer colours: green for active, red for expired */}
													<Badge
														className={
															"text-xs capitalize h-auto px-2 py-0.5 " +
															(status === "active"
																? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-200"
																: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300 border-rose-200")
														}
													>
														{status}
													</Badge>
												</div>
											</div>
										</div>
									</div>
								</Card>
							);
						})}
					</div>
				)}
			</CardContent>

			{/* Invite details dialog */}
			{selectedInvite && (
				<TeamInviteDialog
					invite={selectedInvite}
					open={true}
					onOpenChange={(v: boolean) => {
						if (!v) setSelectedInvite(null);
					}}
					currentUserId={currentUserId}
					canManageInvite={selectedInviteCanManage}
				/>
			)}
		</Card>
	);
}
