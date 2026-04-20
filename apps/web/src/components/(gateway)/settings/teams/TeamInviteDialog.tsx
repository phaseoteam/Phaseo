// TeamInviteDialog.tsx (client) — unchanged except for minor tidy comments
"use client";

import React, { useMemo, useState } from "react";
import {
	revealTeamInviteAction,
	revokeTeamInviteAction,
} from "@/app/(dashboard)/settings/teams/actions";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Infinity,
	Eye,
	EyeOff,
	Trash2,
	Clock,
	CheckCircle2,
	XCircle,
	Link as LinkIcon,
	Shield,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { CopyButton } from "@/components/ui/copy-button";

interface Invite {
	id: string;
	team_id: string;
	creator_user_id: string;
	role: string;
	token_encrypted: string;
	token_preview: string;
	expires_at: string | null;
	created_at: string;
	max_uses: number | null;
	uses_count: number | null;
	users?: { display_name?: string };
	revoked?: boolean | null;
}

interface Props {
	invite: Invite;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentUserId?: string | null;
	canManageInvite?: boolean;
	appBaseUrl?: string;
}

export default function TeamInviteDialog({
	invite,
	open,
	onOpenChange,
	currentUserId,
	canManageInvite = false,
	appBaseUrl,
}: Props) {
	const isCreator = !!currentUserId && currentUserId === invite.creator_user_id;
	const canManage = canManageInvite || isCreator;

	const [revealed, setRevealed] = useState<string | null>(null);
	const [revealing, setRevealing] = useState(false);
	const [revealError, setRevealError] = useState<string | null>(null);
	const [copying, setCopying] = useState(false);
	const [copyError, setCopyError] = useState<string | null>(null);
	const [revoking, setRevoking] = useState(false);
	const [revokeError, setRevokeError] = useState<string | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [showPlain, setShowPlain] = useState(false);

	const createdAt = useMemo(
		() => new Date(invite.created_at),
		[invite.created_at]
	);
	const expiresAt = useMemo(
		() => (invite.expires_at ? new Date(invite.expires_at) : null),
		[invite.expires_at]
	);

	function formatDate(d: Date | null) {
		if (!d) return null;
		const day = String(d.getDate()).padStart(2, "0");
		const month = d.toLocaleString(undefined, { month: "short" });
		const year = d.getFullYear();
		const hours = String(d.getHours()).padStart(2, "0");
		const minutes = String(d.getMinutes()).padStart(2, "0");
		return `${day} ${month} ${year}, ${hours}:${minutes}`;
	}

	const now = useMemo(() => new Date(), []);
	const isExpired = !!expiresAt && now >= expiresAt;
	const isRevoked = !!invite.revoked;
	const isMaxed =
		invite.max_uses !== null && (invite.uses_count ?? 0) >= invite.max_uses;

	const timeLeft = useMemo(() => {
		if (!expiresAt) return "No expiry";
		const ms = expiresAt.getTime() - now.getTime();
		if (ms <= 0) return "Expired";
		const days = Math.floor(ms / 86_400_000);
		const hours = Math.floor((ms % 86_400_000) / 3_600_000);
		if (days > 0) return `${days}d ${hours}h remaining`;
		const minutes = Math.floor((ms % 3_600_000) / 60_000);
		if (hours > 0) return `${hours}h ${minutes}m remaining`;
		const seconds = Math.floor((ms % 60_000) / 1000);
		return `${minutes}m ${seconds}s remaining`;
	}, [expiresAt, now]);

	const usesText = useMemo(() => {
		const used = invite.uses_count ?? 0;
		return invite.max_uses === null
			? `${used} / ∞`
			: `${used} / ${invite.max_uses}`;
	}, [invite.uses_count, invite.max_uses]);

	const roleColour =
		invite.role === "owner"
			? "bg-indigo-100 text-indigo-800 border-indigo-200"
			: invite.role === "admin"
			? "bg-amber-100 text-amber-800 border-amber-200"
			: "bg-emerald-100 text-emerald-800 border-emerald-200";

	const statusChip = isRevoked ? (
		<span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
			<XCircle className="h-3.5 w-3.5" /> Revoked
		</span>
	) : isExpired ? (
		<span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-800">
			<XCircle className="h-3.5 w-3.5" /> Expired
		</span>
	) : isMaxed ? (
		<span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
			<XCircle className="h-3.5 w-3.5" /> Maxed
		</span>
	) : (
		<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
			<CheckCircle2 className="h-3.5 w-3.5" /> Active
		</span>
	);

	const inviteLink =
		revealed && appBaseUrl
			? `${appBaseUrl.replace(/\/$/, "")}/join?i=${
					invite.id
			  }&t=${encodeURIComponent(revealed)}`
			: null;

	async function handleReveal() {
		if (!canManage) {
			setRevealError("Only workspace owners or admins can reveal this invite.");
			return;
		}
		if (revealed) {
			setShowPlain((s) => !s);
			return;
		}
		setRevealError(null);
		setRevealing(true);
		try {
			const result = await revealTeamInviteAction(invite.id);
			if (!result?.token) throw new Error("No token returned");
			setRevealed(result.token);
			setShowPlain(true);
		} catch (err: any) {
			setRevealError(err?.message ?? String(err));
		} finally {
			setRevealing(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center justify-between gap-2 mt-4">
						<span className="flex items-center gap-2">
							Invite Details
						</span>
						<div className="flex items-center gap-2">
							{statusChip}
							<span
								className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${roleColour} capitalize`}
							>
								<Shield className="h-3.5 w-3.5" />
								{invite.role}
							</span>
							<span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
								<Clock className="h-3.5 w-3.5" />
								{expiresAt ? timeLeft : "No expiry"}
							</span>
						</div>
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					{/* Stats */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<Stat
							label="Created by"
							value={
								invite.users?.display_name ??
								invite.creator_user_id
							}
						/>
						<Stat
							label="Created"
							value={formatDate(createdAt) ?? ""}
						/>
						<Stat
							label="Expiry"
							value={
								expiresAt ? formatDate(expiresAt) : "No expiry"
							}
						/>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<Stat label="Uses">
							<span className="text-sm">
								{invite.uses_count ?? 0}
							</span>
						</Stat>
						<Stat label="Max uses">
							{invite.max_uses === null ? (
								<span className="inline-flex items-center gap-1 align-baseline leading-none">
									<span className="sr-only">Unlimited</span>
									<Infinity
										className="h-4 w-4"
										aria-hidden="true"
									/>{" "}
									<span>Unlimited</span>
								</span>
							) : (
								<span className="text-sm">
									{invite.max_uses}
								</span>
							)}
						</Stat>
						<Stat label="Usage" value={usesText} />
					</div>

					<Separator />

					{/* Token / Reveal */}
					<div className="space-y-2">
						<Label htmlFor="invite-token">Invite code</Label>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-start">
							<div
								id="invite-token"
								className="font-mono text-sm bg-muted px-3 py-2 rounded-md w-full sm:max-w-xl border focus-within:ring-2 focus-within:ring-offset-0 focus-within:ring-ring"
							>
								<span className="select-all break-all">
									{revealing
										? "Revealing…"
										: revealed
										? showPlain
											? revealed
											: "*".repeat(
													Math.min(
														10,
														revealed.length
													)
											  )
										: "*".repeat(10)}
								</span>
							</div>

							<div className="flex gap-2 items-center sm:flex-row">
								<TooltipProvider>
									<Tooltip defaultOpen={false}>
										<TooltipTrigger asChild>
											<Button
												type="button"
												variant="outline"
												onClick={handleReveal}
												disabled={revealing || !canManage}
											>
												{revealed ? (
													<>
														{showPlain ? (
															<EyeOff className="h-4 w-4" />
														) : (
															<Eye className="h-4 w-4" />
														)}
													</>
												) : (
													<>
														<Eye className="h-4 w-4" />
													</>
												)}
											</Button>
										</TooltipTrigger>
										<TooltipContent side="top">
											Click to{" "}
											{revealed
												? showPlain
													? "hide"
													: "show"
												: "reveal"}{" "}
											the full code
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>

								<CopyButton
									variant={"outline"}
									onClick={async () => {
										setCopyError(null);
										setCopying(true);
										try {
											const tokenToCopy =
												revealed ??
												(await (async () => {
													const res =
														await revealTeamInviteAction(
															invite.id
														);
													if (!res?.token)
														throw new Error(
															"No token returned"
														);
													return res.token;
												})());
											await navigator.clipboard.writeText(
												tokenToCopy
											);
										} catch (err: any) {
											setCopyError(
												err?.message ?? String(err)
											);
										} finally {
											setCopying(false);
										}
									}}
									content={revealed ?? invite.token_preview}
									size="default"
									disabled={copying}
								/>

								{copyError && (
									<div className="text-sm text-red-600 mt-1">
										{copyError}
									</div>
								)}

								{inviteLink && (
									<Button
										type="button"
										variant="outline"
										onClick={() =>
											navigator.clipboard.writeText(
												inviteLink
											)
										}
									>
										<LinkIcon className="mr-2 h-4 w-4" />
										Copy link
									</Button>
								)}
							</div>
						</div>

						{revealError && (
							<Alert variant="destructive" className="mt-2">
								<AlertTitle>
									Couldn’t reveal the code
								</AlertTitle>
								<AlertDescription>
									{revealError}
								</AlertDescription>
							</Alert>
						)}
					</div>

					{revokeError && (
						<Alert variant="destructive">
							<AlertTitle>Delete failed</AlertTitle>
							<AlertDescription>{revokeError}</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter className="mt-2">
					<div className="flex w-full items-center justify-between">
						<div>
							{canManage && (
								<Popover
									open={confirmOpen}
									onOpenChange={setConfirmOpen}
								>
									<PopoverTrigger asChild>
										<Button
											variant="destructive"
											type="button"
										>
											<Trash2 className="mr-2 h-4 w-4" />
											Delete
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-72">
										<div className="space-y-2">
											<p className="text-sm font-medium">
												Delete this invite?
											</p>
											<p className="text-sm text-muted-foreground">
												This will revoke the code
												immediately. This action can’t
												be undone.
											</p>
											<div className="flex justify-end gap-2">
												<Button
													variant="ghost"
													onClick={() =>
														setConfirmOpen(false)
													}
												>
													Cancel
												</Button>
												<Button
													variant="destructive"
													onClick={async () => {
														setRevokeError(null);
														setRevoking(true);
														try {
															await revokeTeamInviteAction(
																invite.id
															);
															setConfirmOpen(
																false
															);
															onOpenChange(false);
														} catch (err: any) {
															setRevokeError(
																err?.message ??
																	String(err)
															);
														} finally {
															setRevoking(false);
														}
													}}
													disabled={revoking}
												>
													{revoking
														? "Deleting…"
														: "Delete"}
												</Button>
											</div>
										</div>
									</PopoverContent>
								</Popover>
							)}
						</div>

						<div>
							<Button
								variant="ghost"
								onClick={() => onOpenChange(false)}
							>
								Close
							</Button>
						</div>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Stat({
	label,
	value,
	children,
}: {
	label: string;
	value?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<div className="rounded-lg border bg-card p-3">
			<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 text-sm font-medium">{value ?? children}</div>
		</div>
	);
}
