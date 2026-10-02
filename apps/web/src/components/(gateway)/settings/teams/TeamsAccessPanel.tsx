"use client";

import React from "react";
import { Check, ExternalLink, Infinity, X } from "lucide-react";
import { useSettingsRouter as useRouter } from "../PrivateSettingsQuery";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

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

export default function TeamsAccessPanel({
	requestsByTeam,
	invitesByTeam,
	membersByTeam,
	activeWorkspaceId,
	activeWorkspaceName,
	currentUserId,
	canManageWorkspace,
}: Props) {
	const format = useDisplayFormatters();
	const formatDate = (value?: string | null) => format.date(value, "—");
	const t = useTranslations("SettingsUI");
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

	function roleLabel(role: string) {
		switch (role.toLowerCase()) {
			case "owner":
				return t("labels.owner");
			case "admin":
				return t("labels.admin");
			case "member":
				return t("labels.member");
			default:
				return role;
		}
	}

	const handleRequestAction = async (
		requestId: string,
		action: "approve" | "reject"
	) => {
		setBusyRequestId(requestId);
		try {
			if (action === "approve") {
				await toast.promise(approveJoinRequest(requestId).then(() => router.refresh()), {
					loading: t("teams.approvingRequest"),
					success: t("teams.requestApproved"),
					error: () => t("teams.requestActionFailed"),
				});
			} else {
				await toast.promise(rejectJoinRequest(requestId).then(() => router.refresh()), {
					loading: t("teams.rejectingRequest"),
					success: t("teams.requestRejected"),
					error: () => t("teams.requestActionFailed"),
				});
			}
		} finally {
			setBusyRequestId(null);
		}
	};

	if (!activeWorkspaceId) {
		return (
			<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
				{t("strings.phraseNoWorkspaceIsCurrentlySelected" as never)}
			</div>
		);
	}

	if (!canManageWorkspace) {
		return (
			<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
				{t("teams.ownerAdminWorkspaceAccess", {
					workspace: activeWorkspaceName ?? t("labels.workspace"),
				})}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="space-y-4">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div className="min-w-0">
						<h2 className="text-sm font-medium">{t("teams.joinRequests")}</h2>
						<p className="mt-0.5 text-sm text-muted-foreground">
							{t("teams.joinRequestsDescription")}
						</p>
					</div>
					<Badge variant="secondary">
						{t("teams.pendingRequests", { count: requests.length })}
					</Badge>
				</div>
				{requests.length === 0 ? (
					<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
						{t("teams.noPendingRequests", {
							workspace: activeWorkspaceName ?? t("labels.workspace"),
						})}
					</div>
				) : (
					<div className="overflow-hidden rounded-xl border bg-background">
						<Table className="min-w-[680px]">
							<TableHeader className="bg-muted/30">
								<TableRow>
									<TableHead className="px-4">{t("teams.requester")}</TableHead>
									<TableHead className="px-4">{t("teams.requested")}</TableHead>
									<TableHead className="px-4 text-right">{t("labels.actions")}</TableHead>
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
													{t("teams.reject")}
												</Button>
												<Button
													size="sm"
													disabled={busyRequestId === request.id}
													onClick={() =>
														handleRequestAction(request.id, "approve")
													}
												>
													<Check className="mr-1.5 h-4 w-4" />
													{t("teams.approve")}
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
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div className="min-w-0">
						<h2 className="text-sm font-medium">{t("teams.invites")}</h2>
						<p className="mt-0.5 text-sm text-muted-foreground">
							{t("teams.invitesDescription")}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">{t("teams.total", { count: inviteCounts.total })}</Badge>
						<Badge variant="secondary">{t("teams.active", { count: inviteCounts.active })}</Badge>
					</div>
				</div>
				{invites.length === 0 ? (
					<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
						{t("teams.noInvites", {
							workspace: activeWorkspaceName ?? t("labels.workspace"),
						})}
					</div>
				) : (
					<div className="overflow-hidden rounded-xl border bg-background">
						<Table className="min-w-[760px]">
							<TableHeader className="bg-muted/30">
								<TableRow>
									<TableHead className="px-4">{t("teams.createdBy")}</TableHead>
									<TableHead className="px-4">{t("teams.role")}</TableHead>
									<TableHead className="px-4">{t("teams.expiry")}</TableHead>
									<TableHead className="px-4">{t("teams.uses")}</TableHead>
									<TableHead className="px-4">{t("teams.status")}</TableHead>
									<TableHead className="px-4 text-right">{t("labels.actions")}</TableHead>
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
														{invite.users?.display_name ?? t("teams.unknown")}
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
													{roleLabel(invite.role)}
												</Badge>
											</TableCell>
											<TableCell className="px-4 py-3 text-sm text-muted-foreground">
												{invite.expires_at
													? formatDate(invite.expires_at)
													: t("labels.noExpiry")}
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
													{expired ? t("teams.statusExpired") : t("teams.statusActive")}
												</Badge>
											</TableCell>
											<TableCell className="px-4 py-3 text-right">
												<Button
													size="sm"
													variant="outline"
													onClick={() => setSelectedInvite(invite)}
												>
													<ExternalLink className="mr-1.5 h-4 w-4" />
													{t("teams.openInvite")}
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
