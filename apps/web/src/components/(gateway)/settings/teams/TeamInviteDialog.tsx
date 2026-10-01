// TeamInviteDialog.tsx (client) — unchanged except for minor tidy comments
"use client";

import React, { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const router = useRouter();
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
		return new Intl.DateTimeFormat(locale, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(d);
	}

	const now = useMemo(() => new Date(), []);
	const isExpired = !!expiresAt && now >= expiresAt;
	const isRevoked = !!invite.revoked;
	const isMaxed =
		invite.max_uses !== null && (invite.uses_count ?? 0) >= invite.max_uses;

	const timeLeft = useMemo(() => {
		if (!expiresAt) return t("labels.noExpiry");
		const ms = expiresAt.getTime() - now.getTime();
		if (ms <= 0) return t("teams.statusExpired");
		const relative = new Intl.RelativeTimeFormat(locale, {
			numeric: "always",
			style: "short",
		});
		const days = Math.floor(ms / 86_400_000);
		if (days > 0) return relative.format(days, "day");
		const hours = Math.floor(ms / 3_600_000);
		if (hours > 0) return relative.format(hours, "hour");
		const minutes = Math.floor(ms / 60_000);
		if (minutes > 0) return relative.format(minutes, "minute");
		return relative.format(Math.max(1, Math.ceil(ms / 1000)), "second");
	}, [expiresAt, locale, now, t]);

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
			<XCircle className="h-3.5 w-3.5" /> {t("teams.statusRevoked")}
		</span>
	) : isExpired ? (
		<span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-800">
			<XCircle className="h-3.5 w-3.5" /> {t("teams.statusExpired")}
		</span>
	) : isMaxed ? (
		<span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
			<XCircle className="h-3.5 w-3.5" /> {t("teams.statusMaxed")}
		</span>
	) : (
		<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
			<CheckCircle2 className="h-3.5 w-3.5" /> {t("teams.statusActive")}
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
			setRevealError(t("teams.revealAccessError"));
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
			if (!result?.token) {
				setRevealError(t("teams.revealFailed"));
				return;
			}
			setRevealed(result.token);
			setShowPlain(true);
		} catch {
			setRevealError(t("teams.revealFailed"));
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
							{t("teams.inviteDetails")}
						</span>
						<div className="flex items-center gap-2">
							{statusChip}
							<span
								className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${roleColour} capitalize`}
							>
								<Shield className="h-3.5 w-3.5" />
								{invite.role === "owner"
									? t("labels.owner")
									: invite.role === "admin"
										? t("labels.admin")
										: invite.role === "member"
											? t("labels.member")
											: invite.role}
							</span>
							<span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
								<Clock className="h-3.5 w-3.5" />
								{expiresAt ? timeLeft : t("labels.noExpiry")}
							</span>
						</div>
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					{/* Stats */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<Stat
							label={t("teams.createdBy")}
							value={
								invite.users?.display_name ??
								invite.creator_user_id
							}
						/>
						<Stat
							label={t("teams.created")}
							value={formatDate(createdAt) ?? ""}
						/>
						<Stat
							label={t("teams.expiry")}
							value={
								expiresAt ? formatDate(expiresAt) : t("labels.noExpiry")
							}
						/>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<Stat label={t("teams.uses")}>
							<span className="text-sm">
								{invite.uses_count ?? 0}
							</span>
						</Stat>
						<Stat label={t("teams.maxUses")}>
							{invite.max_uses === null ? (
								<span className="inline-flex items-center gap-1 align-baseline leading-none">
									<span className="sr-only">{t("teams.unlimited")}</span>
									<Infinity
										className="h-4 w-4"
										aria-hidden="true"
									/>{" "}
										<span>{t("teams.unlimited")}</span>
								</span>
							) : (
								<span className="text-sm">
									{invite.max_uses}
								</span>
							)}
						</Stat>
						<Stat label={t("teams.usage")} value={usesText} />
					</div>

					<Separator />

					{/* Token / Reveal */}
					<div className="space-y-2">
						<Label htmlFor="invite-token">{t("teams.inviteCode")}</Label>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-start">
							<div
								id="invite-token"
								className="font-mono text-sm bg-muted px-3 py-2 rounded-md w-full sm:max-w-xl border focus-within:ring-2 focus-within:ring-offset-0 focus-within:ring-ring"
							>
								<span className="select-all break-all">
										{revealing
										? t("teams.revealing")
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
												aria-label={revealed
													? showPlain
														? t("teams.hideCodeAria")
														: t("teams.showCodeAria")
													: t("teams.revealCodeAria")}
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
											{t("teams.clickToAction", {
												action: revealed
													? showPlain
														? t("teams.hideCode")
														: t("teams.showCode")
													: t("teams.revealCode"),
											})}
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
													if (!res?.token) throw new Error();
													return res.token;
												})());
											await navigator.clipboard.writeText(
												tokenToCopy
											);
										} catch {
											setCopyError(t("teams.copyFailed"));
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
										{t("teams.copyLink")}
									</Button>
								)}
							</div>
						</div>

						{revealError && (
							<Alert variant="destructive" className="mt-2">
								<AlertTitle>
								{t("teams.revealFailedTitle")}
								</AlertTitle>
								<AlertDescription>
									{revealError}
								</AlertDescription>
							</Alert>
						)}
					</div>

					{revokeError && (
						<Alert variant="destructive">
							<AlertTitle>{t("teams.deleteFailed")}</AlertTitle>
									<AlertDescription>{t("teams.revokeFailedDescription")}</AlertDescription>
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
											{t("labels.delete")}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-72">
										<div className="space-y-2">
											<p className="text-sm font-medium">
												{t("teams.deleteInviteConfirmTitle")}
											</p>
											<p className="text-sm text-muted-foreground">
												{t("teams.deleteInviteConfirmDescription")}
											</p>
											<div className="flex justify-end gap-2">
												<Button
													variant="ghost"
													onClick={() =>
														setConfirmOpen(false)
													}
												>
													{t("labels.cancel")}
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
															router.refresh();
														} catch {
															setRevokeError(t("teams.revokeFailedDescription"));
														} finally {
															setRevoking(false);
														}
													}}
													disabled={revoking}
												>
													{revoking
														? t("labels.deleting")
														: t("labels.delete")}
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
								{t("labels.close")}
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
