"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import * as React from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	updateTeamAction,
	deleteTeamAction,
	updateWorkspacePublisherHandleAction,
} from "@/app/(dashboard)/settings/teams/actions";
import WorkspaceIdentitySettings from "./WorkspaceIdentitySettings";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

type Team = { id: string; name: string; publisherHandle?: string | null; logoUrl?: string | null };
type MembersByTeam = Record<
	string,
	Array<{ user_id: string; role?: string; display_name?: string }>
>;

type Props = {
	teams: Team[];
	membersByTeam: MembersByTeam;
	workspaceId?: string | undefined | null;
	currentUserId?: string | null;
	personalTeamId?: string | null;
	walletBalances?: Record<string, number>;
	teamSsoSettingsByTeam?: Record<string, TeamSsoSettingsRow>;
	canConfigureEnterprise?: boolean;
};

type Settings = {
	teamName: string;
	publisherHandle: string;
};

const DEFAULTS: Settings = {
	teamName: "",
	publisherHandle: "",
};

function createSettingsSchema(requiredName: string, maxLength: string, handleFormat: string) {
	return z.object({
		teamName: z.string().trim().min(1, requiredName).max(60, maxLength),
		publisherHandle: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{2,39}$/, handleFormat),
	});
}
export default function TeamSettingsPanel({
	teams,
	membersByTeam,
	workspaceId,
	currentUserId,
	personalTeamId,
	walletBalances,
	teamSsoSettingsByTeam,
	canConfigureEnterprise = false,
}: Props) {
	const fallbackTeamId =
		(workspaceId && teams.some((t) => t.id === workspaceId)
			? workspaceId
			: teams[0]?.id) || undefined;

	const roleForCurrentUser = React.useMemo(() => {
		if (!fallbackTeamId || !currentUserId) return undefined;
		const membership = (membersByTeam[fallbackTeamId] ?? []).find(
			(entry) => entry.user_id === currentUserId,
		);
		return (membership?.role || "").toLowerCase();
	}, [fallbackTeamId, currentUserId, membersByTeam]);

	const isPersonalTeam = Boolean(
		fallbackTeamId && personalTeamId && fallbackTeamId === personalTeamId,
	);
	const hasTeamControl =
		roleForCurrentUser === "owner" || roleForCurrentUser === "admin";
	const canEdit = hasTeamControl && !isPersonalTeam;
	const canDeleteWorkspace = roleForCurrentUser === "owner" && !isPersonalTeam;
	const currentTeamBalance =
		fallbackTeamId && walletBalances ? walletBalances[fallbackTeamId] ?? 0 : 0;
	const initialTeamName =
		teams.find((entry) => entry.id === fallbackTeamId)?.name ??
		DEFAULTS.teamName;
	const initialPublisherHandle = teams.find((entry) => entry.id === fallbackTeamId)?.publisherHandle ?? "";
	const initialLogoUrl = teams.find((entry) => entry.id === fallbackTeamId)?.logoUrl ?? null;

	const [saving, setSaving] = React.useState(false);
	const invalidateSettings = useInvalidatePrivateSettings();
	const [deleting, setDeleting] = React.useState(false);
	const [logoUploading, setLogoUploading] = React.useState(false);
	const [logoUrl, setLogoUrl] = React.useState(initialLogoUrl);
	const logoInputRef = React.useRef<HTMLInputElement>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
	const t = useTranslations("SettingsUI");

	const [settings, setSettings] = React.useState<Settings>(() => ({
		teamName: initialTeamName,
		publisherHandle: initialPublisherHandle,
	}));
	const [initial, setInitial] = React.useState<Settings>(() => ({
		teamName: initialTeamName,
		publisherHandle: initialPublisherHandle,
	}));

	const hasChanges = initial.teamName.trim() !== settings.teamName.trim() || initial.publisherHandle.trim() !== settings.publisherHandle.trim();

	function update<K extends keyof Settings>(key: K, value: Settings[K]) {
		setSettings((prev) => ({ ...prev, [key]: value }));
	}

	async function handleSave() {
		if (!workspaceId) return;
		const parsed = createSettingsSchema(t("workspace.teamNameRequired"), t("workspace.teamNameMaxLength"), t("workspace.publisherHandleFormat")).safeParse({
			teamName: settings.teamName,
			publisherHandle: settings.publisherHandle,
		});

		if (!parsed.success) {
			toast.error(
				parsed.error.issues[0]?.message ?? t("workspace.inputValidationFallback"),
			);
			return;
		}

		setSaving(true);
		try {
			await toast.promise(
				(async () => {
					const normalizedName = settings.teamName.trim();
					const initialName = initial.teamName.trim();

					if (!isPersonalTeam && normalizedName !== initialName) {
						await updateTeamAction(workspaceId, normalizedName);
						void invalidateSettings();
					}
					const normalizedPublisherHandle = settings.publisherHandle.trim().toLowerCase();
					if (normalizedPublisherHandle !== initial.publisherHandle.trim()) {
						await updateWorkspacePublisherHandleAction(workspaceId, normalizedPublisherHandle);
						void invalidateSettings();
					}
					const normalized = { teamName: normalizedName, publisherHandle: normalizedPublisherHandle };
					setSettings(normalized);
					setInitial(normalized);
				})(),
				{
					loading: t("workspace.savingSettings"),
					success: t("workspace.savedSettings"),
					error: () => t("strings.Could not save settings" as never),
				},
			);
		} finally {
			setSaving(false);
		}
	}

	function handleReset() {
		setSettings(initial);
	}

	async function uploadLogo(file: File) {
		if (!workspaceId) return;
		setLogoUploading(true);
		try {
			const response = await fetch(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/logo`, { method: "POST", headers: { "content-type": file.type }, body: file });
			const payload = await response.json() as { logoUrl?: string; error?: string };
			if (!response.ok || !payload.logoUrl) throw new Error(payload.error ?? t("newMainSettingsCopy.logoUploadFailed"));
			setLogoUrl(payload.logoUrl);
			void invalidateSettings();
			toast.success(t("newMainSettingsCopy.logoUpdated"));
		} catch (error) { toast.error(localizedSettingsError(error, t, "Could not upload the workspace logo.", t("newMainSettingsCopy.logoUploadFailed"))); }
		finally { setLogoUploading(false); if (logoInputRef.current) logoInputRef.current.value = ""; }
	}

	async function removeLogo() {
		if (!workspaceId) return;
		setLogoUploading(true);
		try {
			const response = await fetch(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/logo`, { method: "DELETE" });
			const payload = await response.json() as { error?: string };
			if (!response.ok) throw new Error(payload.error ?? t("newMainSettingsCopy.logoRemoveFailed"));
			setLogoUrl(null);
			void invalidateSettings();
			toast.success(t("newMainSettingsCopy.logoRemoved"));
		} catch (error) { toast.error(localizedSettingsError(error, t, "Could not remove the workspace logo.", t("newMainSettingsCopy.logoRemoveFailed"))); }
		finally { setLogoUploading(false); }
	}

	async function handleDeleteTeam() {
		if (!workspaceId) return;
		if (isPersonalTeam) {
			toast.error(t("workspace.personalCannotDelete"));
			return;
		}
		setDeleting(true);
		try {
			await toast.promise(deleteTeamAction(workspaceId).then((result) => { void invalidateSettings(); return result; }), {
				loading: t("workspace.deletingWorkspace"),
				success: t("workspace.workspaceDeleted"),
				error: () => t("workspace.deleteError"),
			});
			setDeleteDialogOpen(false);
		} finally {
			setDeleting(false);
		}
	}

	if (!fallbackTeamId) return null;

	return (
		<section className="space-y-8">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void handleSave();
				}}
			className="overflow-hidden rounded-xl border bg-background/40"
			>
				<div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
					<div className="min-w-0">
						<Label className="text-sm font-medium">{t("newMainSettingsCopy.workspaceLogo")}</Label>
						<p className="mt-0.5 text-sm text-muted-foreground">{t("newMainSettingsCopy.logoHelp")}</p>
					</div>
					<div className="flex w-full shrink-0 items-center gap-3 sm:w-[min(32rem,55%)]">
						<Avatar className="size-12 rounded-md border bg-muted/30 after:rounded-md">
							{logoUrl ? <AvatarImage src={logoUrl} alt={t("newMainSettingsCopy.logoAlt", {workspace: initialTeamName})} className="rounded-md object-cover" /> : null}
							<AvatarFallback className="rounded-md text-sm font-semibold">{initialTeamName.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
						</Avatar>
						<input ref={logoInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); }} />
						<Button type="button" variant="outline" size="sm" disabled={!hasTeamControl || logoUploading} onClick={() => logoInputRef.current?.click()}>
							{logoUploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {t("newMainSettingsCopy.upload")}
						</Button>
						{logoUrl ? <Button type="button" variant="ghost" size="sm" disabled={!hasTeamControl || logoUploading} onClick={() => void removeLogo()}>{t("newMainSettingsCopy.remove")}</Button> : null}
					</div>
				</div>
				<div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
					<div className="min-w-0">
						<Label htmlFor="teamName" className="text-sm font-medium">
							{t("workspace.name")}
						</Label>
						<p className="mt-0.5 text-sm text-muted-foreground">
							{t("workspace.teamNameHelp")}
						</p>
					</div>
					<div className="w-full shrink-0 sm:w-[min(32rem,55%)]">
						<Input
							id="teamName"
							value={settings.teamName}
							onChange={(event) => update("teamName", event.target.value)}
							disabled={!canEdit}
							placeholder={t("workspace.namePlaceholder")}
							maxLength={60}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
					<div className="min-w-0">
						<Label htmlFor="publisherHandle" className="text-sm font-medium">{t("workspace.publisherHandle")}</Label>
						<p className="mt-0.5 text-sm text-muted-foreground">{t("workspace.publisherHandleHelp", { example: "@" + (settings.publisherHandle || "workspace") + "/preset" })}</p>
					</div>
					<div className="w-full shrink-0 sm:w-[min(32rem,55%)]">
						<Input id="publisherHandle" value={settings.publisherHandle} onChange={(event) => update("publisherHandle", event.target.value.toLowerCase())} disabled={!hasTeamControl} placeholder={t("workspace.handlePlaceholder")} maxLength={40} />
					</div>
				</div>

				<div className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-muted-foreground">
						{isPersonalTeam
							? t("workspace.personalWorkspacePermanent")
							: canEdit
								? t("workspace.workspaceNameChangeHelp")
								: t("workspace.workspaceChangePermissionHelp")}
					</p>
					<div className="flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={handleReset}
							disabled={!hasChanges || saving}
						>
							{t("strings.Reset" as never)}
						</Button>
						<Button
							type="submit"
							disabled={!hasChanges || saving || !hasTeamControl}
						>
							{saving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{t("strings.phraseSaving" as never)}
								</>
							) : (
								t("strings.Save" as never)
							)}
						</Button>
					</div>
				</div>
			</form>

			{!isPersonalTeam ? (
				<WorkspaceIdentitySettings
					key={fallbackTeamId}
					workspaceId={fallbackTeamId}
					initialSettings={teamSsoSettingsByTeam?.[fallbackTeamId]}
					canEdit={canEdit}
					canConfigureEnterprise={canConfigureEnterprise}
					mode="banner"
				/>
			) : null}

			<section
				aria-labelledby="workspace-danger-zone-title"
				className="space-y-3 border-t border-border/60 pt-6"
			>
				<h3
					id="workspace-danger-zone-title"
					className="font-heading text-base font-medium"
				>
					{t("strings.Danger Zone" as never)}
				</h3>
				<div className="overflow-hidden rounded-xl border border-destructive/30 bg-background/40">
					<div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
						<div className="min-w-0">
							<p className="text-sm font-medium">{t("workspace.deleteWorkspace")}</p>
							<p className="mt-0.5 text-sm text-muted-foreground">
								{isPersonalTeam
									? t("workspace.personalCannotDelete")
									: t("workspace.deleteWorkspaceHelp")}
							</p>
						</div>
						<AlertDialog
							open={deleteDialogOpen}
							onOpenChange={setDeleteDialogOpen}
						>
							<AlertDialogTrigger asChild>
								<Button
									variant="destructive"
									disabled={!canDeleteWorkspace}
									className="shrink-0"
								>
									<Trash2 className="mr-2 h-4 w-4" />
									{t("workspace.deleteWorkspace")}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>{t("workspace.deleteWorkspaceQuestion")}</AlertDialogTitle>
									<AlertDialogDescription>
										{t("workspace.deleteConfirmationDescription", { phrase: t("workspace.deleteConfirmationPhrase") })}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<ConfirmDeleteTeam
									onConfirm={handleDeleteTeam}
									deleting={deleting}
									remainingBalance={currentTeamBalance}
									translate={(key, values) => t(key as never, values as never)}
								/>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</div>
			</section>
		</section>
	);
}

function ConfirmDeleteTeam({
	onConfirm,
	deleting,
	remainingBalance,
	translate,
}: {
	onConfirm: () => void;
	deleting: boolean;
	remainingBalance?: number;
	translate: (key: string, values?: Record<string, string | number>) => string;
}) {
	const t = translate;
	const format = useDisplayFormatters();
	const [text, setText] = React.useState("");
	const [ackCredits, setAckCredits] = React.useState(false);
	const phrase = t("workspace.deleteConfirmationPhrase");
	const ok = text.trim() === phrase;
	const balance =
		typeof remainingBalance === "number" ? Math.max(remainingBalance, 0) : 0;
	const hasCredits = balance > 0.001;
	const formattedBalance = hasCredits
		? format.number(balance, {
				style: "currency",
				currency: "USD",
				maximumFractionDigits: 2,
				notation: "standard",
			})
		: null;

	return (
		<div className="grid gap-3">
			<div className="grid gap-2">
				<Label htmlFor="confirmDeleteTeam">{t("workspace.confirmation")}</Label>
				<Input
					id="confirmDeleteTeam"
					placeholder={t("workspace.typeDeleteWorkspacePrompt", { phrase })}
					value={text}
					onChange={(event) => setText(event.target.value)}
					autoFocus
				/>
			</div>
			{hasCredits ? (
				<div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950 dark:text-amber-200">
					<div><p>{t("workspace.deleteCreditsWarning", { balance: formattedBalance ?? "" })}</p><p className="mt-1">{t("workspace.deleteCreditsForfeit")}</p></div>
					<label className="flex items-center gap-2 text-xs font-medium">
						<input
							type="checkbox"
							className="h-4 w-4 rounded border-muted-foreground"
							checked={ackCredits}
							onChange={(event) =>
								setAckCredits(event.target.checked)
							}
						/>
						{t("workspace.deleteCreditsAcknowledgement")}
					</label>
				</div>
			) : null}
			<AlertDialogFooter>
				<div className="flex w-full items-center justify-end gap-2">
					<AlertDialogCancel className="w-auto" disabled={deleting}>
						{t("strings.Cancel" as never)}
					</AlertDialogCancel>
					<Button
						variant="destructive"
						onClick={onConfirm}
						disabled={!ok || deleting || (hasCredits && !ackCredits)}
					>
						{deleting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{t("strings.phraseDeleting" as never)}
							</>
						) : (
							t("workspace.confirmDeleteWorkspaceButton")
						)}
					</Button>
					<AlertDialogAction className="hidden" />
				</div>
			</AlertDialogFooter>
		</div>
	);
}
