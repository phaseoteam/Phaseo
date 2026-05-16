"use client";

import React from "react";
import { Check, ExternalLink, Infinity, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import TeamInviteDialog from "./TeamInviteDialog";
import { approveJoinRequest, rejectJoinRequest } from "@/app/(dashboard)/settings/teams/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface Request {
	id: string;
	workspace_id?: string;
	requester_user_id: string;
	status?: "pending" | "accepted" | "rejected" | string | null;
	created_at?: string | null;
	requester?: { display_name?: string | null; avatar_url?: string | null };
}

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

interface Props {
	requestsByTeam: Record<string, Request[]>;
	invitesByTeam?: Record<string, Invite[]>;
	membersByTeam?: Record<string, any[]>;
	activeWorkspaceId?: string;
	activeWorkspaceName?: string | null;
	currentUserId?: string | null;
	canManageWorkspace?: boolean;
}

function formatDate(value?: string | null) {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString(undefined, {
			day: "2-digit",
			month: "short",
			year: "numeric",
		});
	} catch {
		return "—";
	}
}

export default function TeamsAccessPanel({
	requestsByTeam,
	invitesByTeam,
	membersByTeam,
	activeWorkspaceId,
	activeWorkspaceName,
	currentUserId,
	canManageWorkspace,
}: Props) {
	const router = useRouter();
	const [selectedInvite, setSelectedInvite] = React.useState<Invite | null>(null);
	const [busyRequestId, setBusyRequestId] = React.useState<string | null>(null);
	const requests = React.useMemo(() => {
		if (!activeWorkspaceId) return [];
		return (requestsByTeam[activeWorkspaceId] || []).filter(
			(request) => request.status === "pending"
		);
	}, [activeWorkspaceId, requestsByTeam]);
	const invites = React.useMemo(() => {
		if (!activeWorkspaceId) return [];
		const activeInvites = (invitesByTeam?.[activeWorkspaceId] || []).slice();
		activeInvites.sort((a, b) => {
			if (!a.expires_at && !b.expires_at) return 0;
			if (!a.expires_at) return 1;
			if (!b.expires_at) return -1;
			return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
		});
		return activeInvites;
	}, [activeWorkspaceId, invitesByTeam]);

	const inviteCounts = React.useMemo(() => {
		let active = 0;
		let expired = 0;
		for (const invite of invites) {
			const isExpired = invite.expires_at
				? new Date(invite.expires_at) < new Date()
				: false;
			if (isExpired) expired += 1;
			else active += 1;
		}
		return { active, expired, total: invites.length };
	}, [invites]);

	const selectedInviteCanManage = React.useMemo(() => {
		if (!selectedInvite || !currentUserId) return false;
		if (selectedInvite.creator_user_id === currentUserId) return true;

		const teamMembers = membersByTeam?.[selectedInvite.workspace_id] ?? [];
		const currentMembership = teamMembers.find(
			(member: any) => member?.user_id === currentUserId
		);
		const role = String(currentMembership?.role ?? "").toLowerCase();
		return role === "owner" || role === "admin";
	}, [selectedInvite, currentUserId, membersByTeam]);

	const handleRequestAction = async (
		requestId: string,
		action: "approve" | "reject"
	) => {
		setBusyRequestId(requestId);
		try {
			if (action === "approve") {
				await toast.promise(approveJoinRequest(requestId), {
					loading: "Approving request...",
					success: "Request approved",
					error: (error) => `Failed: ${error?.message || error}`,
				});
			} else {
				await toast.promise(rejectJoinRequest(requestId), {
					loading: "Rejecting request...",
					success: "Request rejected",
					error: (error) => `Failed: ${error?.message || error}`,
				});
			}
			router.refresh();
		} finally {
			setBusyRequestId(null);
		}
	};

	if (!activeWorkspaceId) {
		return (
			<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
				No workspace is currently selected.
			</div>
		);
	}

	if (!canManageWorkspace) {
		return (
			<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
				You need owner or admin access on{" "}
				<span className="font-medium text-foreground">
					{activeWorkspaceName ?? "this workspace"}
				</span>{" "}
				to review join requests and manage invites.
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">
						{requests.length} pending request{requests.length === 1 ? "" : "s"}
					</Badge>
				</div>
				{requests.length === 0 ? (
					<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
						No pending requests for {activeWorkspaceName ?? "this workspace"}.
					</div>
				) : (
					<div className="overflow-hidden rounded-xl border bg-background">
						<Table className="min-w-[680px]">
							<TableHeader className="bg-muted/30">
								<TableRow>
									<TableHead className="px-4">Requester</TableHead>
									<TableHead className="px-4">Requested</TableHead>
									<TableHead className="px-4 text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{requests.map((request) => (
									<TableRow key={request.id}>
										<TableCell className="px-4 py-3">
											<div className="min-w-0">
												<div className="truncate font-medium">
													{request.requester?.display_name ??
														request.requester_user_id}
												</div>
												<div className="truncate text-xs text-muted-foreground">
													{request.requester_user_id}
												</div>
											</div>
										</TableCell>
										<TableCell className="px-4 py-3 text-sm text-muted-foreground">
											{formatDate(request.created_at)}
										</TableCell>
										<TableCell className="px-4 py-3">
											<div className="flex justify-end gap-2">
												<Button
													size="sm"
													variant="outline"
													disabled={busyRequestId === request.id}
													onClick={() =>
														handleRequestAction(request.id, "reject")
													}
												>
													<X className="mr-1.5 h-4 w-4" />
													Reject
												</Button>
												<Button
													size="sm"
													disabled={busyRequestId === request.id}
													onClick={() =>
														handleRequestAction(request.id, "approve")
													}
												>
													<Check className="mr-1.5 h-4 w-4" />
													Approve
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</section>

			<section className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{inviteCounts.total} total</Badge>
					<Badge variant="secondary">{inviteCounts.active} active</Badge>
				</div>
				{invites.length === 0 ? (
					<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
						No invites for {activeWorkspaceName ?? "this workspace"} yet.
					</div>
				) : (
					<div className="overflow-hidden rounded-xl border bg-background">
						<Table className="min-w-[760px]">
							<TableHeader className="bg-muted/30">
								<TableRow>
									<TableHead className="px-4">Created by</TableHead>
									<TableHead className="px-4">Role</TableHead>
									<TableHead className="px-4">Expiry</TableHead>
									<TableHead className="px-4">Uses</TableHead>
									<TableHead className="px-4">Status</TableHead>
									<TableHead className="px-4 text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{invites.map((invite) => {
									const expired = invite.expires_at
										? new Date(invite.expires_at) < new Date()
										: false;
									return (
										<TableRow key={invite.id}>
											<TableCell className="px-4 py-3">
												<div className="min-w-0">
													<div className="truncate font-medium">
														{invite.users?.display_name ?? "Unknown"}
													</div>
													<div className="text-xs text-muted-foreground">
														{formatDate(invite.created_at)}
													</div>
												</div>
											</TableCell>
											<TableCell className="px-4 py-3">
												<Badge
													variant={
														invite.role === "owner"
															? "default"
															: invite.role === "admin"
																? "secondary"
																: "outline"
													}
													className="capitalize"
												>
													{invite.role}
												</Badge>
											</TableCell>
											<TableCell className="px-4 py-3 text-sm text-muted-foreground">
												{invite.expires_at
													? formatDate(invite.expires_at)
													: "No expiry"}
											</TableCell>
											<TableCell className="px-4 py-3 text-sm text-muted-foreground">
												{invite.uses_count ?? 0}
												{invite.max_uses ? (
													<span> / {invite.max_uses}</span>
												) : (
													<span className="inline-flex items-center gap-1">
														{" "}
														/ <Infinity className="h-3.5 w-3.5" />
													</span>
												)}
											</TableCell>
											<TableCell className="px-4 py-3">
												<Badge
													className={
														expired
															? "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-300"
															: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950 dark:text-emerald-300"
													}
												>
													{expired ? "Expired" : "Active"}
												</Badge>
											</TableCell>
											<TableCell className="px-4 py-3 text-right">
												<Button
													size="sm"
													variant="outline"
													onClick={() => setSelectedInvite(invite)}
												>
													<ExternalLink className="mr-1.5 h-4 w-4" />
													Open
												</Button>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</section>

			{selectedInvite ? (
				<TeamInviteDialog
					invite={selectedInvite}
					open={true}
					onOpenChange={(isOpen: boolean) => {
						if (!isOpen) setSelectedInvite(null);
					}}
					currentUserId={currentUserId}
					canManageInvite={selectedInviteCanManage}
				/>
			) : null}
		</div>
	);
}
