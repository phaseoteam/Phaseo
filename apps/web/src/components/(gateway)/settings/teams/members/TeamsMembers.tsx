"use client";

import React from "react";
import { User, Crown, ShieldIcon, UserRoundX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	updateMemberRole,
	removeMember,
} from "@/app/(dashboard)/settings/teams/memberActions";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface Member {
	user_id: string;
	role?: string;
	display_name?: string | null;
}

interface Team {
	id: string;
	name: string;
}

interface Props {
	teams: Team[];
	membersByTeam: Record<string, Member[]>;
	currentUserId?: string | null;
	activeWorkspaceId?: string | undefined;
	onRemoveMember?: (workspaceId: string, userId: string) => void;
	onUpdateMemberRole?: (
		workspaceId: string,
		userId: string,
		newRole?: string,
	) => void;
	personalTeamId?: string | null;
}

export default function TeamsMembers({
	teams,
	membersByTeam,
	currentUserId,
	activeWorkspaceId: controlledActiveId,
	onRemoveMember,
	onUpdateMemberRole,
	personalTeamId,
}: Props) {
	const activeWorkspaceId =
		controlledActiveId && teams.some((team) => team.id === controlledActiveId)
			? controlledActiveId
			: teams[0]?.id;

	const roleRank = (r?: string) => {
		switch ((r || "").toLowerCase()) {
			case "owner":
				return 1;
			case "admin":
				return 2;
			case "member":
				return 3;
			default:
				return 4;
		}
	};

	const sortedMembers = React.useMemo(() => {
		if (!activeWorkspaceId) return [];
		const list = (membersByTeam[activeWorkspaceId] || []).slice();
		list.sort((a, b) => {
			const ra = roleRank(a.role);
			const rb = roleRank(b.role);
			if (ra !== rb) return ra - rb;
			const na = (a.display_name ?? a.user_id ?? "").toLowerCase();
			const nb = (b.display_name ?? b.user_id ?? "").toLowerCase();
			return na.localeCompare(nb);
		});
		return list;
	}, [activeWorkspaceId, membersByTeam]);

	const activeTeam = teams.find((t) => t.id === activeWorkspaceId);
	const count = sortedMembers.length;

	const roleIcon = (role?: string) => {
		switch ((role || "").toLowerCase()) {
			case "owner":
				return <Crown className="h-4 w-4" />;
			case "admin":
				return <ShieldIcon className="h-4 w-4" />;
			case "member":
				return <User className="h-4 w-4" />;
			default:
				return <UserRoundX className="h-4 w-4" />;
		}
	};

	const router = useRouter();
	const [selectedMember, setSelectedMember] = React.useState<Member | null>(null);
	const [roleDialogOpen, setRoleDialogOpen] = React.useState(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [selectedRole, setSelectedRole] = React.useState<string>("member");
	const [loading, setLoading] = React.useState(false);

	const isSelfSelected =
		Boolean(currentUserId) && selectedMember?.user_id === currentUserId;
	const canLeaveTeam =
		isSelfSelected &&
		Boolean(activeTeam && personalTeamId && activeTeam.id !== personalTeamId);

	const confirmActionTitle = canLeaveTeam ? "Leave workspace" : "Revoke access";
	const confirmActionButton = canLeaveTeam ? "Leave workspace" : "Revoke access";
	const confirmActionLoading = canLeaveTeam ? "Leaving..." : "Revoking...";

	const currentUserRole = React.useMemo(() => {
		if (!activeWorkspaceId || !currentUserId) return undefined;
		const row = (membersByTeam[activeWorkspaceId] ?? []).find(
			(m) => m.user_id === currentUserId,
		);
		return (row?.role ?? "").toLowerCase();
	}, [activeWorkspaceId, currentUserId, membersByTeam]);

	const currentUserRoleRank = currentUserRole
		? roleRank(currentUserRole)
		: Number.POSITIVE_INFINITY;
	const selectedMemberRoleRank = selectedMember
		? roleRank(selectedMember.role)
		: Number.POSITIVE_INFINITY;
	const selectedMemberRole = (selectedMember?.role ?? "").toLowerCase();
	const isSelectedOwner = selectedMemberRole === "owner";
	const isSelectedHigherRole =
		Boolean(selectedMember && currentUserRole) &&
		selectedMemberRoleRank < currentUserRoleRank;

	const canModifyRoles = currentUserRole === "owner" || currentUserRole === "admin";
	const canEditSelectedRole =
		canModifyRoles && Boolean(selectedMember) && !isSelectedOwner;
	const canRevokeSelectedMember =
		Boolean(selectedMember) &&
		!isSelfSelected &&
		canModifyRoles &&
		!isSelectedHigherRole;
	const confirmActionDescription = canLeaveTeam
		? `Are you sure you want to leave ${activeTeam?.name ?? "this workspace"}?`
		: isSelectedHigherRole
			? "You can't revoke access for someone with a higher role than yours."
			: `Are you sure you want to revoke access for ${
					selectedMember?.display_name ??
					selectedMember?.user_id ??
					"this member"
				}?`;

	React.useEffect(() => {
		if (!selectedMember) return;
		setSelectedRole(
			selectedMember.role === "" ? "__none" : selectedMember.role || "member",
		);
	}, [selectedMember]);

	const saveRole = async () => {
		if (!activeTeam || !selectedMember || !canEditSelectedRole) return;
		try {
			setLoading(true);
			if (onUpdateMemberRole) {
				onUpdateMemberRole(activeTeam.id, selectedMember.user_id, selectedRole);
			} else {
				await updateMemberRole(activeTeam.id, selectedMember.user_id, selectedRole);
			}
			setRoleDialogOpen(false);
			setSelectedMember(null);
			router.refresh();
		} catch (err: any) {
			toast.error(err?.message ?? "Unable to update the member role right now.");
		} finally {
			setLoading(false);
		}
	};

	const confirmRevoke = async () => {
		if (!activeTeam || !selectedMember) return;
		if (!canLeaveTeam && !canRevokeSelectedMember) {
			toast.error(
				"You can't revoke access for members with a higher role than yours.",
			);
			return;
		}

		const targetLabel =
			selectedMember.display_name ?? selectedMember.user_id ?? "member";
		const teamLabel = activeTeam.name ?? "this workspace";
		try {
			setLoading(true);
			if (onRemoveMember) {
				await onRemoveMember(activeTeam.id, selectedMember.user_id);
			} else {
				const res = await removeMember(activeTeam.id, selectedMember.user_id);
				if (res && res.ok === false) {
					const msg = res.message ?? "Unable to revoke access.";
					toast.error(
						msg.toLowerCase().includes("owner")
							? "You can't revoke the owner's access."
							: msg,
					);
					return;
				}
			}

			toast.success(
				canLeaveTeam ? `You left ${teamLabel}.` : `Revoked access for ${targetLabel}.`,
			);
			setConfirmOpen(false);
			setRoleDialogOpen(false);
			setSelectedMember(null);
			router.refresh();
		} catch (err: any) {
			toast.error(err?.message ?? "Unable to revoke access right now.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="space-y-3">
			<div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h3 className="text-base font-semibold">Workspace members</h3>
					<p className="text-sm text-muted-foreground">
						Manage and review members in the selected workspace.
					</p>
				</div>
				<Badge variant="outline">{count} members</Badge>
			</div>

			{!activeTeam ? (
				<div className="text-sm text-muted-foreground">
					No workspaces available.
				</div>
			) : count === 0 ? (
				<div className="text-sm text-muted-foreground">
					No members in {activeTeam.name} yet.
				</div>
			) : (
				<div className="overflow-hidden rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Member</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Manage</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sortedMembers.map((member) => {
								const isCurrent = currentUserId && member.user_id === currentUserId;
								const title = member.display_name ?? member.user_id;
								const role = (member.role ?? "member").toLowerCase();
								return (
									<TableRow
										key={member.user_id}
										className="cursor-pointer"
										onClick={() => {
											setSelectedMember(member);
											setRoleDialogOpen(true);
										}}
									>
										<TableCell>
											<div className="flex min-w-0 items-center gap-2">
												<div
													className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted"
													title={role.replace(/^(.)/, (s) => s.toUpperCase())}
												>
													{roleIcon(role)}
												</div>
												<div className="min-w-0">
													<div className="truncate text-sm font-medium">{title}</div>
													{member.display_name ? (
														<div className="truncate text-xs text-muted-foreground">
															{member.user_id}
														</div>
													) : null}
												</div>
											</div>
										</TableCell>
										<TableCell className="capitalize text-muted-foreground">
											{role}
										</TableCell>
										<TableCell>
											{isCurrent ? <Badge variant="secondary">You</Badge> : "—"}
										</TableCell>
										<TableCell className="text-right text-xs text-muted-foreground">
											Open
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<Dialog
				open={roleDialogOpen}
				onOpenChange={(v) => {
					if (!v) {
						setRoleDialogOpen(false);
						setSelectedMember(null);
					} else {
						setRoleDialogOpen(true);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Member actions</DialogTitle>
						<DialogDescription>
							{selectedMember
								? (selectedMember.display_name ?? selectedMember.user_id)
								: "Member"}
						</DialogDescription>
					</DialogHeader>

					<div className="mt-2">
						<Label className="mb-2">User Role</Label>
						{!canModifyRoles ? (
							<div className="rounded border border-dashed border-muted p-3 text-sm text-muted-foreground">
								Members cannot change roles. Contact your workspace owner/admin.
							</div>
						) : isSelectedOwner ? (
							<div className="rounded border border-dashed border-muted p-3 text-sm text-muted-foreground">
								The workspace owner role is fixed and cannot be edited.
							</div>
						) : (
							<Select value={selectedRole} onValueChange={(v) => setSelectedRole(v)}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="admin">Admin</SelectItem>
									<SelectItem value="member">Member</SelectItem>
								</SelectContent>
							</Select>
						)}
					</div>

					<DialogFooter className="flex items-center">
						<div>
							<Button
								variant="destructive"
								onClick={() => {
									if (!canLeaveTeam && !canRevokeSelectedMember) return;
									setConfirmOpen(true);
								}}
								disabled={loading || (!canLeaveTeam && !canRevokeSelectedMember)}
							>
								{loading ? "Working..." : confirmActionButton}
							</Button>
							{!canLeaveTeam && isSelectedHigherRole ? (
								<p className="mt-2 text-xs text-muted-foreground">
									You can only revoke members with an equal or lower role.
								</p>
							) : null}
						</div>

						<div className="ml-auto flex items-center gap-2">
							<DialogClose asChild>
								<Button variant="ghost">Cancel</Button>
							</DialogClose>
							<Button onClick={saveRole} disabled={loading || !canEditSelectedRole}>
								{loading ? "Saving..." : "Save"}
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{confirmActionTitle}</DialogTitle>
						<DialogDescription>{confirmActionDescription}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							disabled={loading}
							onClick={() => setConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={confirmRevoke}
							disabled={loading}
						>
							{loading ? confirmActionLoading : confirmActionButton}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
