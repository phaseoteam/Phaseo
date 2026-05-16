"use client";

import React from "react";
import {
	Copy,
	Crown,
	MoreHorizontal,
	ShieldIcon,
	User,
	UserRoundX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	removeMember,
	updateMemberRole,
} from "@/app/(dashboard)/settings/teams/memberActions";

interface Member {
	user_id: string;
	role?: string;
	display_name?: string | null;
	spend_30d_nanos?: number | null;
}

interface Props {
	membersByTeam: Record<string, Member[]>;
	currentUserId?: string | null;
	activeWorkspaceId?: string | undefined;
	activeWorkspaceName?: string | null;
	onRemoveMember?: (workspaceId: string, userId: string) => void;
	onUpdateMemberRole?: (
		workspaceId: string,
		userId: string,
		newRole?: string
	) => void;
	personalTeamId?: string | null;
}

function roleRank(role?: string) {
	switch ((role || "").toLowerCase()) {
		case "owner":
			return 1;
		case "admin":
			return 2;
		case "member":
			return 3;
		default:
			return 4;
	}
}

function roleBadge(role?: string) {
	switch ((role || "").toLowerCase()) {
		case "owner":
			return (
				<Badge variant="default" className="gap-1.5">
					<Crown className="h-3.5 w-3.5" />
					Owner
				</Badge>
			);
		case "admin":
			return (
				<Badge variant="secondary" className="gap-1.5">
					<ShieldIcon className="h-3.5 w-3.5" />
					Admin
				</Badge>
			);
		case "member":
			return (
				<Badge variant="outline" className="gap-1.5">
					<User className="h-3.5 w-3.5" />
					Member
				</Badge>
			);
		default:
			return (
				<Badge variant="outline" className="gap-1.5">
					<UserRoundX className="h-3.5 w-3.5" />
					Unknown
				</Badge>
			);
	}
}

function formatUsdFromNanos(value?: number | null) {
	const nanos = Number(value ?? 0);
	if (!Number.isFinite(nanos)) return "--";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(nanos / 1_000_000_000);
}

export default function TeamsMembers({
	membersByTeam,
	currentUserId,
	activeWorkspaceId,
	activeWorkspaceName,
	onRemoveMember,
	onUpdateMemberRole,
	personalTeamId,
}: Props) {
	const router = useRouter();
	const [selectedMember, setSelectedMember] = React.useState<Member | null>(
		null
	);
	const [roleDialogOpen, setRoleDialogOpen] = React.useState(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [selectedRole, setSelectedRole] = React.useState<string>("member");
	const [loading, setLoading] = React.useState(false);

	const sortedMembers = React.useMemo(() => {
		if (!activeWorkspaceId) return [];
		const list = (membersByTeam[activeWorkspaceId] || []).slice();
		list.sort((a, b) => {
			const rankDiff = roleRank(a.role) - roleRank(b.role);
			if (rankDiff !== 0) return rankDiff;
			const nameA = (a.display_name ?? a.user_id ?? "").toLowerCase();
			const nameB = (b.display_name ?? b.user_id ?? "").toLowerCase();
			return nameA.localeCompare(nameB);
		});
		return list;
	}, [activeWorkspaceId, membersByTeam]);

	const count = sortedMembers.length;
	const currentUserRole = React.useMemo(() => {
		if (!activeWorkspaceId || !currentUserId) return undefined;
		const row = (membersByTeam[activeWorkspaceId] ?? []).find(
			(member) => member.user_id === currentUserId
		);
		return (row?.role ?? "").toLowerCase();
	}, [activeWorkspaceId, currentUserId, membersByTeam]);

	const isSelfSelected =
		Boolean(currentUserId) && selectedMember?.user_id === currentUserId;
	const isCurrentUserOwner = currentUserRole === "owner";
	const canModifyRoles = isCurrentUserOwner;
	const canLeaveTeam =
		isSelfSelected &&
		Boolean(
			activeWorkspaceId &&
				personalTeamId &&
				activeWorkspaceId !== personalTeamId
		);

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
	const canEditSelectedRole =
		isCurrentUserOwner && Boolean(selectedMember) && !isSelectedOwner;
	const canRevokeSelectedMember =
		Boolean(selectedMember) &&
		!isSelfSelected &&
		isCurrentUserOwner &&
		!isSelectedHigherRole;

	const confirmActionTitle = canLeaveTeam ? "Leave workspace" : "Revoke access";
	const confirmActionButton = canLeaveTeam ? "Leave workspace" : "Revoke access";
	const confirmActionLoading = canLeaveTeam ? "Leaving..." : "Revoking...";
	const confirmActionDescription = canLeaveTeam
		? `Are you sure you want to leave ${activeWorkspaceName ?? "this workspace"}?`
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
			selectedMember.role === "" ? "__none" : selectedMember.role || "member"
		);
	}, [selectedMember]);

	const saveRole = async () => {
		if (!activeWorkspaceId || !selectedMember || !canEditSelectedRole) return;
		try {
			setLoading(true);
			if (onUpdateMemberRole) {
				onUpdateMemberRole(
					activeWorkspaceId,
					selectedMember.user_id,
					selectedRole
				);
			} else {
				await updateMemberRole(
					activeWorkspaceId,
					selectedMember.user_id,
					selectedRole
				);
			}
			setRoleDialogOpen(false);
			setSelectedMember(null);
			router.refresh();
		} catch (error: any) {
			toast.error(
				error?.message ?? "Unable to update the member role right now."
			);
		} finally {
			setLoading(false);
		}
	};

	const updateRoleDirect = async (member: Member, nextRole: "admin" | "member") => {
		if (!activeWorkspaceId) return;
		try {
			setLoading(true);
			await updateMemberRole(activeWorkspaceId, member.user_id, nextRole);
			toast.success(
				`${member.display_name ?? member.user_id} is now ${nextRole}.`
			);
			router.refresh();
		} catch (error: any) {
			toast.error(error?.message ?? "Unable to update the member role right now.");
		} finally {
			setLoading(false);
		}
	};

	const confirmRevoke = async () => {
		if (!activeWorkspaceId || !selectedMember) return;
		if (!canLeaveTeam && !canRevokeSelectedMember) {
			toast.error(
				"You can't revoke access for members with a higher role than yours."
			);
			return;
		}

		const targetLabel =
			selectedMember.display_name ?? selectedMember.user_id ?? "member";
		try {
			setLoading(true);
			if (onRemoveMember) {
				await onRemoveMember(activeWorkspaceId, selectedMember.user_id);
			} else {
				const result = await removeMember(
					activeWorkspaceId,
					selectedMember.user_id
				);
				if (result && result.ok === false) {
					const message = result.message ?? "Unable to revoke access.";
					if (message.toLowerCase().includes("owner")) {
						toast.error("You can't revoke the owner's access.");
					} else {
						toast.error(message);
					}
					return;
				}
			}

			toast.success(
				canLeaveTeam
					? `You left ${activeWorkspaceName ?? "the workspace"}.`
					: `Revoked access for ${targetLabel}.`
			);
			setConfirmOpen(false);
			setRoleDialogOpen(false);
			setSelectedMember(null);
			router.refresh();
		} catch (error: any) {
			toast.error(error?.message ?? "Unable to revoke access right now.");
		} finally {
			setLoading(false);
		}
	};

	const openRoleEditor = (member: Member) => {
		setSelectedMember(member);
		setRoleDialogOpen(true);
	};

	const openRemovalDialog = (member: Member) => {
		setSelectedMember(member);
		setConfirmOpen(true);
	};

	const copyUserId = async (userId: string) => {
		try {
			await navigator.clipboard.writeText(userId);
			toast.success("Copied user ID");
		} catch {
			toast.error("Unable to copy user ID");
		}
	};

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">
					{count} member{count === 1 ? "" : "s"}
				</Badge>
			</div>

			{!activeWorkspaceId ? (
				<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
					No workspace is currently selected.
				</div>
			) : count === 0 ? (
				<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
					No members in {activeWorkspaceName ?? "this workspace"} yet.
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border bg-background">
					<Table className="min-w-[720px]">
							<TableHeader className="bg-muted/30">
								<TableRow>
									<TableHead className="w-[40%] px-4">Member</TableHead>
									<TableHead className="w-[18%] px-4">Role</TableHead>
									<TableHead className="w-[22%] px-4">Spend (30d)</TableHead>
									<TableHead className="w-[20%] px-4 text-right">
										Actions
									</TableHead>
								</TableRow>
						</TableHeader>
						<TableBody>
								{sortedMembers.map((member) => {
									const isCurrent = currentUserId === member.user_id;
									const canLeaveCurrentRow =
										isCurrent &&
										Boolean(
											activeWorkspaceId &&
												personalTeamId &&
												activeWorkspaceId !== personalTeamId
										);
									const memberRole = (member.role ?? "").toLowerCase();
									const isOwner = memberRole === "owner";
									const memberRoleRank = roleRank(member.role);
									const isHigherRole =
										Boolean(currentUserRole) &&
										memberRoleRank < currentUserRoleRank;
									const canEditMemberRole =
										isCurrentUserOwner && !isOwner;
									const canRemoveMember =
										(isCurrent && canLeaveCurrentRow) ||
										(!isCurrent && isCurrentUserOwner && !isHigherRole);
									const canOpenEditDialog = canEditMemberRole;
									const canPromoteToAdmin =
										isCurrentUserOwner && !isOwner && memberRole !== "admin";
									const canDemoteToMember =
										isCurrentUserOwner && !isOwner && memberRole !== "member";
									const hasManagementActions =
										canOpenEditDialog ||
										canPromoteToAdmin ||
										canDemoteToMember ||
										canRemoveMember;
									return (
										<TableRow key={member.user_id}>
											<TableCell className="px-4 py-3">
												<div className="min-w-0">
													<div className="truncate font-medium">
														{member.display_name ?? member.user_id}
													</div>
													{isCurrent ? (
														<div className="mt-1">
															<Badge variant="outline">You</Badge>
														</div>
													) : null}
												</div>
											</TableCell>
											<TableCell className="px-4 py-3">
												{roleBadge(member.role)}
											</TableCell>
											<TableCell className="px-4 py-3 text-sm text-muted-foreground">
												<span className="font-mono tabular-nums">
													{formatUsdFromNanos(member.spend_30d_nanos)}
												</span>
											</TableCell>
											<TableCell className="px-4 py-3 text-right">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															aria-label={`Actions for ${
																member.display_name ?? member.user_id
															}`}
														>
															<MoreHorizontal className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														{canOpenEditDialog ? (
															<DropdownMenuItem
																onClick={() => openRoleEditor(member)}
															>
																Edit
															</DropdownMenuItem>
														) : null}
														{canPromoteToAdmin ? (
															<DropdownMenuItem
																onClick={() =>
																	void updateRoleDirect(member, "admin")
																}
															>
																Make admin
															</DropdownMenuItem>
														) : null}
														{canDemoteToMember ? (
															<DropdownMenuItem
																onClick={() =>
																	void updateRoleDirect(member, "member")
																}
															>
																Make member
															</DropdownMenuItem>
														) : null}
														{hasManagementActions ? (
															<DropdownMenuSeparator />
														) : null}
														<DropdownMenuItem
															onClick={() => void copyUserId(member.user_id)}
														>
															<Copy className="h-4 w-4" />
															Copy User ID
														</DropdownMenuItem>
														{canRemoveMember ? (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => openRemovalDialog(member)}
																	className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
																>
																	{isCurrent && canLeaveCurrentRow
																		? "Leave workspace"
																		: "Remove"}
																</DropdownMenuItem>
															</>
														) : null}
													</DropdownMenuContent>
												</DropdownMenu>
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
				onOpenChange={(nextOpen) => {
					if (!nextOpen) {
						setRoleDialogOpen(false);
						setSelectedMember(null);
						return;
					}
					setRoleDialogOpen(true);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Member actions</DialogTitle>
						<DialogDescription>
							{selectedMember
								? selectedMember.display_name ?? selectedMember.user_id
								: "Member"}
						</DialogDescription>
					</DialogHeader>

					<div className="mt-2">
						<Label className="mb-2">User Role</Label>
						{!canModifyRoles ? (
							<div className="rounded border border-dashed border-muted p-3 text-sm text-muted-foreground">
								Only workspace owners can change member roles.
							</div>
						) : isSelectedOwner ? (
							<div className="rounded border border-dashed border-muted p-3 text-sm text-muted-foreground">
								The workspace owner role is fixed and cannot be edited.
							</div>
						) : (
							<Select
								value={selectedRole}
								onValueChange={(value) => setSelectedRole(value)}
							>
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
							<Button
								onClick={saveRole}
								disabled={loading || !canEditSelectedRole}
							>
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
