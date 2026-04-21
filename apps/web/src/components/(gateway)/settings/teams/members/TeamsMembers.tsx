"use client";

import React from "react";
import { User, Crown, ShieldIcon, UserRoundX } from "lucide-react";
// removed useRouter and direct server action usage; actions are handled in child component
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
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
	onTeamChange?: (id?: string) => void;
	/** Called when a member is removed: (workspaceId, userId) */
	onRemoveMember?: (workspaceId: string, userId: string) => void;
	/** Called when a member's role is changed: (workspaceId, userId, newRole) */
	onUpdateMemberRole?: (
		workspaceId: string,
		userId: string,
		newRole?: string
	) => void;
	personalTeamId?: string | null;
}

export default function TeamsMembers({
	teams,
	membersByTeam,
	onTeamChange,
	currentUserId,
	activeWorkspaceId: controlledActiveId,
	onRemoveMember,
	onUpdateMemberRole,
	personalTeamId,
}: Props) {
	const [localActiveTeamId, setLocalActiveTeamId] = React.useState<
		string | undefined
	>(teams.length ? teams[0].id : undefined);
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

	// Per-member loading is handled by the child actions component

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
	const [selectedMember, setSelectedMember] = React.useState<Member | null>(
		null
	);
	const [roleDialogOpen, setRoleDialogOpen] = React.useState(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [selectedRole, setSelectedRole] = React.useState<string>("member");
	const [loading, setLoading] = React.useState(false);

	const isSelfSelected =
		Boolean(currentUserId) && selectedMember?.user_id === currentUserId;
	const canLeaveTeam =
		isSelfSelected &&
		Boolean(
			activeTeam && personalTeamId && activeTeam.id !== personalTeamId
		);

	const confirmActionTitle = canLeaveTeam ? "Leave workspace" : "Revoke access";
	const confirmActionButton = canLeaveTeam ? "Leave workspace" : "Revoke access";
	const confirmActionLoading = canLeaveTeam ? "Leaving..." : "Revoking...";

	const currentUserRole = React.useMemo(() => {
		if (!activeWorkspaceId || !currentUserId) return undefined;
		const row = (membersByTeam[activeWorkspaceId] ?? []).find(
			(m) => m.user_id === currentUserId
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

	const canModifyRoles =
		currentUserRole === "owner" || currentUserRole === "admin";
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
		if (selectedMember) {
			setSelectedRole(
				selectedMember.role === ""
					? "__none"
					: selectedMember.role || "member"
			);
		}
	}, [selectedMember]);

	const saveRole = async () => {
		if (!activeTeam || !selectedMember || !canEditSelectedRole) return;
		try {
			setLoading(true);
			if (onUpdateMemberRole) {
				onUpdateMemberRole(
					activeTeam.id,
					selectedMember.user_id,
					selectedRole
				);
			} else {
				await updateMemberRole(
					activeTeam.id,
					selectedMember.user_id,
					selectedRole
				);
			}
			setRoleDialogOpen(false);
			setSelectedMember(null);
			router.refresh();
		} catch (err: any) {
			const message =
				err?.message ?? "Unable to update the member role right now.";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	};

	const confirmRevoke = async () => {
		if (!activeTeam || !selectedMember) return;
		if (!canLeaveTeam && !canRevokeSelectedMember) {
			toast.error(
				"You can't revoke access for members with a higher role than yours."
			);
			return;
		}
		const targetLabel =
			selectedMember.display_name ?? selectedMember.user_id ?? "member";
		const teamLabel = activeTeam?.name ?? "this workspace";
		try {
			setLoading(true);
			if (onRemoveMember) {
				await onRemoveMember(activeTeam.id, selectedMember.user_id);
			} else {
				const res = await removeMember(
					activeTeam.id,
					selectedMember.user_id
				);

				if (res && res.ok === false) {
					const msg = res.message ?? "Unable to revoke access.";
					if (msg.toLowerCase().includes("owner")) {
						toast.error("You can't revoke the owner's access.");
					} else {
						toast.error(msg);
					}
					return;
				}
			}

			toast.success(
				canLeaveTeam
					? `You left ${teamLabel}.`
					: `Revoked access for ${targetLabel}.`
			);
			setConfirmOpen(false);
			setRoleDialogOpen(false);
			setSelectedMember(null);
			router.refresh();
		} catch (err: any) {
			const message =
				err?.message ?? "Unable to revoke access right now.";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Card className="h-full">
			<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<CardTitle className="text-base">Workspace members</CardTitle>
					<CardDescription>
						Manage and review members in the selected workspace.
					</CardDescription>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{count} members</Badge>
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
				) : count === 0 ? (
					<div className="text-sm text-muted-foreground">
						No members in {activeTeam.name} yet.
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						{sortedMembers.map((m) => {
							const isCurrent =
								currentUserId && m.user_id === currentUserId;
							const title = m.display_name ?? m.user_id;
							return (
								<Card
									key={m.user_id}
									className={
										"cursor-pointer border p-3 shadow-sm transition hover:shadow-md"
									}
									onClick={() => {
										setSelectedMember(m);
										setRoleDialogOpen(true);
									}}
								>
									<div
										className={`flex items-center gap-3 ${
											isCurrent
												? "bg-accent/5 p-2 rounded-md"
												: ""
										}`}
									>
										<div
											className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"
											title={(m.role || "member").replace(
												/^(.)/,
												(s) => s.toUpperCase()
											)}
										>
											{roleIcon(m.role)}
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center justify-between">
												<div className="truncate text-sm font-medium">
													{title}
												</div>
												<div className="ml-2">
													{m.role && (
														<div className="text-xs text-muted-foreground capitalize">
															{m.role}
														</div>
													)}
												</div>
											</div>
											{isCurrent && (
												<div className="mt-1 text-xs text-foreground/80 rounded bg-primary/10 px-2 py-0.5 inline-block">
													You
												</div>
											)}
										</div>
										<div className="ml-2 flex items-center gap-2">
											{/* kept placeholder: actions moved into card-click dialog */}
										</div>
									</div>
								</Card>
							);
						})}
					</div>
				)}
			</CardContent>

			{/* Member actions dialog (opened when a card is clicked) */}
			<Dialog
				open={roleDialogOpen}
				onOpenChange={(v) => {
					if (!v) {
						setRoleDialogOpen(false);
						setSelectedMember(null);
					} else setRoleDialogOpen(true);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Member actions</DialogTitle>
						<DialogDescription>
							{selectedMember
								? selectedMember.display_name ??
								  selectedMember.user_id
								: "Member"}
						</DialogDescription>
					</DialogHeader>

					<div className="mt-2">
						<Label className="mb-2">User Role</Label>
						{!canModifyRoles ? (
							<div className="rounded border border-dashed border-muted p-3 text-sm text-muted-foreground">
								Members cannot change roles. If you would like a
								change, please contact your workspace owner or admin.
							</div>
						) : isSelectedOwner ? (
							<div className="rounded border border-dashed border-muted p-3 text-sm text-muted-foreground">
								The workspace owner role is fixed and cannot be edited.
							</div>
						) : (
							<Select
								value={selectedRole}
								onValueChange={(v) => setSelectedRole(v)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={"admin"}>
										Admin
									</SelectItem>
									<SelectItem value={"member"}>
										Member
									</SelectItem>
								</SelectContent>
							</Select>
						)}
					</div>

					<DialogFooter className="flex items-center">
						<div>
							<Button
								variant="destructive"
								onClick={() => {
									if (
										!canLeaveTeam &&
										!canRevokeSelectedMember
									)
										return;
									setConfirmOpen(true);
								}}
								disabled={
									loading ||
									(!canLeaveTeam && !canRevokeSelectedMember)
								}
							>
								{loading ? "Working..." : confirmActionButton}
							</Button>
							{!canLeaveTeam && isSelectedHigherRole ? (
								<p className="mt-2 text-xs text-muted-foreground">
									You can only revoke members with an equal or
									lower role.
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

			{/* Revoke confirmation dialog */}
			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{confirmActionTitle}</DialogTitle>
						<DialogDescription>
							{confirmActionDescription}
						</DialogDescription>
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
							{loading
								? confirmActionLoading
								: confirmActionButton}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
