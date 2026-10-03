"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";

import React from "react";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Copy,
	Crown,
	LogOut,
	MoreHorizontal,
	ShieldIcon,
	User,
	UserCog,
	UserRoundX,
} from "lucide-react";
import { useSettingsRouter as useRouter } from "../../PrivateSettingsQuery";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { UserUsageChip } from "../../keys/UserUsageChip";

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
	is_sample?: boolean;
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
	samplePreview?: boolean;
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

function roleBadge(role: string | undefined, s: (key: string) => string) {
	switch ((role || "").toLowerCase()) {
		case "owner":
			return (
				<Badge variant="default" className="gap-1.5">
					<Crown className="h-3.5 w-3.5" />
					{s("Owner")}
				</Badge>
			);
		case "admin":
			return (
				<Badge variant="secondary" className="gap-1.5">
					<ShieldIcon className="h-3.5 w-3.5" />
					{s("Admin")}
				</Badge>
			);
		case "member":
			return (
				<Badge variant="outline" className="gap-1.5">
					<User className="h-3.5 w-3.5" />
					{s("Member")}
				</Badge>
			);
		default:
			return (
				<Badge variant="outline" className="gap-1.5">
					<UserRoundX className="h-3.5 w-3.5" />
					{s("Unknown")}
				</Badge>
			);
	}
}

function formatUsdFromNanos(
	value: number | null | undefined,
	formatNumber: ReturnType<typeof useDisplayFormatters>["number"]
) {
	const nanos = Number(value ?? 0);
	if (!Number.isFinite(nanos)) return "--";
	return formatNumber(nanos / 1_000_000_000, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
		notation: "standard",
	});
}

export default function TeamsMembers({
	membersByTeam,
	currentUserId,
	activeWorkspaceId,
	activeWorkspaceName,
	onRemoveMember,
	onUpdateMemberRole,
	personalTeamId,
	samplePreview = false,
}: Props) {
	const format = useDisplayFormatters();
	const router = useRouter();
	const t = useTranslations("SettingsUI");
	const s = React.useCallback(
		(key: string, values?: Record<string, string>) =>
			t(settingsStringKey(key) as never, values as never),
		[t],
	);
	const roleOptions = React.useMemo(
		() => [
			{ value: "admin", label: s("Admin") },
			{ value: "member", label: s("Member") },
		],
		[s],
	);
	const [selectedMember, setSelectedMember] = React.useState<Member | null>(
		null
	);
	const [roleDialogOpen, setRoleDialogOpen] = React.useState(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [selectedRole, setSelectedRole] = React.useState<string>("member");
	const [loading, setLoading] = React.useState(false);
	const [spendSort, setSpendSort] = React.useState<"none" | "asc" | "desc">(
		"none",
	);
	const [sampleRoleOverrides, setSampleRoleOverrides] = React.useState<
		Record<string, string>
	>({});
	const [hiddenSampleMemberIds, setHiddenSampleMemberIds] = React.useState<
		Set<string>
	>(new Set());

	const sortedMembers = React.useMemo(() => {
		if (!activeWorkspaceId) return [];
		const list = (membersByTeam[activeWorkspaceId] || [])
			.filter(
				(member) =>
					!member.is_sample || !hiddenSampleMemberIds.has(member.user_id),
			)
			.map((member) =>
				member.is_sample && sampleRoleOverrides[member.user_id]
					? { ...member, role: sampleRoleOverrides[member.user_id] }
					: member,
			);
		list.sort((a, b) => {
			if (spendSort !== "none") {
				const spendDifference =
					Number(a.spend_30d_nanos ?? 0) - Number(b.spend_30d_nanos ?? 0);
				if (spendDifference !== 0) {
					return spendSort === "asc" ? spendDifference : -spendDifference;
				}
			}
			const rankDiff = roleRank(a.role) - roleRank(b.role);
			if (rankDiff !== 0) return rankDiff;
			const nameA = (a.display_name ?? a.user_id ?? "").toLowerCase();
			const nameB = (b.display_name ?? b.user_id ?? "").toLowerCase();
			return nameA.localeCompare(nameB);
		});
		return list;
	}, [
		activeWorkspaceId,
		hiddenSampleMemberIds,
		membersByTeam,
		sampleRoleOverrides,
		spendSort,
	]);

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

	const confirmActionTitle = canLeaveTeam ? s("Leave workspace") : s("Revoke access");
	const confirmActionButton = canLeaveTeam ? s("Leave workspace") : s("Revoke access");
	const confirmActionLoading = canLeaveTeam ? s("phraseLeaving") : s("phraseRevoking");
	const confirmActionDescription = canLeaveTeam
		? s("Are you sure you want to leave {workspace}?", {
				workspace: activeWorkspaceName ?? s("this workspace"),
		  })
		: isSelectedHigherRole
			? s("phraseYouCanTRevokeAccessForSomeoneWithAHigherRoleThanYours")
			: s("Are you sure you want to revoke access for {member}?", {
					member: selectedMember?.display_name ?? selectedMember?.user_id ?? s("this member"),
				});

	const saveRole = async () => {
		if (!activeWorkspaceId || !selectedMember || !canEditSelectedRole) return;
		if (selectedMember.is_sample) {
			setSampleRoleOverrides((current) => ({
				...current,
				[selectedMember.user_id]: selectedRole,
			}));
			toast.success(s("phraseUpdatedMemberSSampleRole", { member: selectedMember.display_name ?? selectedMember.user_id }));
			setRoleDialogOpen(false);
			setSelectedMember(null);
			return;
		}
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
				localizedSettingsError(
					error,
					t,
					"Action failed",
					s("phraseUnableToUpdateTheMemberRoleRightNow"),
				),
			);
		} finally {
			setLoading(false);
		}
	};

	const confirmRevoke = async () => {
		if (!activeWorkspaceId || !selectedMember) return;
		if (!canLeaveTeam && !canRevokeSelectedMember) {
			toast.error(s("phraseYouCanTRevokeAccessForMembersWithAHigherRoleThanYours"));
			return;
		}
		if (selectedMember.is_sample) {
			setHiddenSampleMemberIds((current) => {
				const next = new Set(current);
				next.add(selectedMember.user_id);
				return next;
			});
			toast.success(s("phraseRemovedSampleMemberMember", { member: selectedMember.display_name ?? selectedMember.user_id }));
			setConfirmOpen(false);
			setRoleDialogOpen(false);
			setSelectedMember(null);
			return;
		}

		const targetLabel = selectedMember.display_name ?? selectedMember.user_id ?? s("member");
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
					const message = localizedSettingsError(
						result.message,
						t,
						"Action failed",
						s("phraseUnableToRevokeAccess"),
					);
					if (message.toLowerCase().includes("owner")) {
						toast.error(s("phraseYouCanTRevokeTheOwnerSAccess"));
					} else {
						toast.error(message);
					}
					return;
				}
			}

			toast.success(
				canLeaveTeam
					? s("phraseYouLeftWorkspace", { workspace: activeWorkspaceName ?? s("the workspace") })
					: s("phraseRevokedAccessForMember", { member: targetLabel })
			);
			setConfirmOpen(false);
			setRoleDialogOpen(false);
			setSelectedMember(null);
			router.refresh();
		} catch (error: any) {
			toast.error(
				localizedSettingsError(
					error,
					t,
					"Action failed",
					s("phraseUnableToRevokeAccessRightNow"),
				),
			);
		} finally {
			setLoading(false);
		}
	};

	const openRoleEditor = (member: Member) => {
		setSelectedRole(member.role === "" ? "__none" : member.role || "member");
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
			toast.success(s("Copied user ID"));
		} catch {
			toast.error(s("Unable to copy user ID"));
		}
	};

	const cycleSpendSort = () => {
		setSpendSort((current) =>
			current === "none" ? "desc" : current === "desc" ? "asc" : "none",
		);
	};

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">
					{count} {count === 1 ? s("member") : s("members")}
				</Badge>
				{samplePreview ? (
					<>
						<Badge variant="outline">{s("Sample preview")}</Badge>
						<Button asChild variant="ghost" size="sm" className="ml-auto">
							<Link
								href={
									activeWorkspaceId
										? `/settings/workspaces/members?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
										: "/settings/workspaces/members"
								}
							>
								{s("Hide Samples")}
							</Link>
						</Button>
					</>
				) : null}
			</div>

			{!activeWorkspaceId ? (
				<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
					{s("phraseNoWorkspaceIsCurrentlySelected")}
				</div>
			) : count === 0 ? (
				<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
					{s("phraseNoMembersInWorkspaceYet", { workspace: activeWorkspaceName ?? s("this workspace") })}
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border bg-background">
					<Table className="min-w-[720px]">
							<TableHeader className="bg-muted/30">
								<TableRow>
					<TableHead className="w-[40%] px-4">{s("Member")}</TableHead>
					<TableHead className="w-[18%] px-4">{s("Role")}</TableHead>
									<TableHead
										className="w-[22%] px-2"
										aria-sort={
											spendSort === "asc"
												? "ascending"
												: spendSort === "desc"
													? "descending"
													: "none"
										}
									>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
											onClick={cycleSpendSort}
											aria-label={`${s("Sort by 30-day spend")}${
												spendSort === "none"
													? ""
													: spendSort === "desc"
														? `, ${s("currently descending")}`
														: `, ${s("currently ascending")}`
											}`}
										>
											{s("Spend (30d)")}
											{spendSort === "asc" ? (
												<ArrowUp />
											) : spendSort === "desc" ? (
												<ArrowDown />
											) : (
												<ArrowUpDown />
											)}
										</Button>
									</TableHead>
									<TableHead className="w-[20%] px-4 text-right">
										{s("Actions")}
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
									return (
										<TableRow key={member.user_id}>
											<TableCell className="px-4 py-3">
												<div className="min-w-0">
													<div className="truncate font-medium">
														{member.is_sample || !activeWorkspaceId ? member.display_name ?? member.user_id : <UserUsageChip userId={member.user_id} name={member.display_name ?? null} avatarUrl={null} workspaceId={activeWorkspaceId} currentUserId={currentUserId ?? undefined} canViewWorkspaceUsers={currentUserRole === "owner" || currentUserRole === "admin"} />}
													</div>
													{isCurrent || member.is_sample ? (
														<div className="mt-1">
															<Badge variant="outline">
														{isCurrent ? s("You") : s("Sample")}
															</Badge>
														</div>
													) : null}
												</div>
											</TableCell>
											<TableCell className="px-4 py-3">
												{roleBadge(member.role, s)}
											</TableCell>
											<TableCell className="px-4 py-3 text-sm text-muted-foreground">
												<span className="font-mono tabular-nums">
											{formatUsdFromNanos(member.spend_30d_nanos, format.number)}
												</span>
											</TableCell>
											<TableCell className="px-4 py-3 text-right">
												<DropdownMenu>
													<DropdownMenuTrigger render={<Button
															variant="ghost"
															size="icon"
															aria-label={s("Actions for {member}", {
																member: member.display_name ?? member.user_id,
															})} />}>

															<MoreHorizontal className="h-4 w-4" />

													</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-44">
												{canOpenEditDialog ? (
													<DropdownMenuItem
														onClick={() => openRoleEditor(member)}
													>
														<UserCog />
															{s("Change Role")}
													</DropdownMenuItem>
												) : null}
												{canOpenEditDialog ? (
													<DropdownMenuSeparator />
												) : null}
														<DropdownMenuItem
															onClick={() => void copyUserId(member.user_id)}
														>
															<Copy className="h-4 w-4" />
															{s("Copy User ID")}
														</DropdownMenuItem>
														{canRemoveMember ? (
															<>
																<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() => openRemovalDialog(member)}
															variant="destructive"
														>
															{isCurrent && canLeaveCurrentRow ? (
																<LogOut />
															) : (
																<UserRoundX />
															)}
															{isCurrent && canLeaveCurrentRow
																? s("Leave workspace")
																: s("Remove Member")}
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
						<DialogTitle>{s("Member actions")}</DialogTitle>
						<DialogDescription>
							{selectedMember
								? selectedMember.display_name ?? selectedMember.user_id
								: s("Member")}
						</DialogDescription>
					</DialogHeader>

					<div className="mt-2">
						<Label className="mb-2">{s("User Role")}</Label>
						{!canModifyRoles ? (
							<div className="rounded border border-dashed border-muted p-3 text-sm text-muted-foreground">
								{s("phraseOnlyWorkspaceOwnersCanChangeMemberRoles")}
							</div>
						) : isSelectedOwner ? (
							<div className="rounded border border-dashed border-muted p-3 text-sm text-muted-foreground">
								{s("phraseTheWorkspaceOwnerRoleIsFixedAndCannotBeEdited")}
							</div>
						) : (
							<Select
								value={selectedRole}
								items={roleOptions}
								onValueChange={(value) => setSelectedRole(value)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="admin" label={s("Admin")}>
										{s("Admin")}
									</SelectItem>
									<SelectItem value="member" label={s("Member")}>
										{s("Member")}
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
									if (!canLeaveTeam && !canRevokeSelectedMember) return;
									setConfirmOpen(true);
								}}
								disabled={loading || (!canLeaveTeam && !canRevokeSelectedMember)}
							>
								{loading ? s("phraseWorking") : confirmActionButton}
							</Button>
							{!canLeaveTeam && isSelectedHigherRole ? (
								<p className="mt-2 text-xs text-muted-foreground">
									{s("phraseYouCanOnlyRevokeMembersWithAnEqualOrLowerRole")}
								</p>
							) : null}
						</div>

						<div className="ml-auto flex items-center gap-2">
							<DialogClose asChild>
								<Button variant="ghost">{s("Cancel")}</Button>
							</DialogClose>
							<Button
								onClick={saveRole}
								disabled={loading || !canEditSelectedRole}
							>
								{loading ? s("phraseSaving") : s("Save")}
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
							{s("Cancel")}
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
