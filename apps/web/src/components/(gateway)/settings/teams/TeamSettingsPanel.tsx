"use client";

import * as React from "react";
import { z } from "zod";
import { toast } from "sonner";
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
import { Loader2, Trash2 } from "lucide-react";
import {
	updateTeamAction,
	deleteTeamAction,
	updateWorkspacePublisherHandleAction,
} from "@/app/(dashboard)/settings/teams/actions";
import WorkspaceIdentitySettings from "./WorkspaceIdentitySettings";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";

type Team = { id: string; name: string; publisherHandle?: string | null };
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
	samlSsoEnabled?: boolean;
};

type Settings = {
	teamName: string;
	publisherHandle: string;
};

const DEFAULTS: Settings = {
	teamName: "",
	publisherHandle: "",
};

const schema = z.object({
	teamName: z.string().trim().min(1, "Workspace name is required").max(60),
	publisherHandle: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{2,39}$/, "Use 3–40 lowercase letters, numbers, underscores, or hyphens."),
});

export default function TeamSettingsPanel({
	teams,
	membersByTeam,
	workspaceId,
	currentUserId,
	personalTeamId,
	walletBalances,
	teamSsoSettingsByTeam,
	samlSsoEnabled = false,
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

	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

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
		const parsed = schema.safeParse({
			teamName: settings.teamName,
			publisherHandle: settings.publisherHandle,
		});

		if (!parsed.success) {
			toast.error(
				parsed.error.issues[0]?.message ?? "Please check your inputs.",
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
					}
					const normalizedPublisherHandle = settings.publisherHandle.trim().toLowerCase();
					if (normalizedPublisherHandle !== initial.publisherHandle.trim()) {
						await updateWorkspacePublisherHandleAction(workspaceId, normalizedPublisherHandle);
					}
					const normalized = { teamName: normalizedName, publisherHandle: normalizedPublisherHandle };
					setSettings(normalized);
					setInitial(normalized);
				})(),
				{
					loading: "Saving workspace settings...",
					success: "Saved.",
					error: (error: any) =>
						error?.message || "Could not save settings",
				},
			);
		} finally {
			setSaving(false);
		}
	}

	function handleReset() {
		setSettings(initial);
	}

	async function handleDeleteTeam() {
		if (!workspaceId) return;
		if (isPersonalTeam) {
			toast.error("Personal workspace cannot be deleted.");
			return;
		}
		setDeleting(true);
		try {
			await toast.promise(deleteTeamAction(workspaceId), {
				loading: "Deleting workspace...",
				success: "Workspace deleted",
				error: (error: any) => error?.message || "Could not delete workspace",
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
				<div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
					<div className="min-w-0">
						<Label htmlFor="teamName" className="text-sm font-medium">
							Workspace Name
						</Label>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Used throughout the dashboard, API keys, and invitations.
						</p>
					</div>
					<div className="w-full shrink-0 sm:w-[min(32rem,55%)]">
						<Input
							id="teamName"
							value={settings.teamName}
							onChange={(event) => update("teamName", event.target.value)}
							disabled={!canEdit}
							placeholder="e.g. Engineering"
							maxLength={60}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
					<div className="min-w-0">
						<Label htmlFor="publisherHandle" className="text-sm font-medium">Publisher Handle</Label>
						<p className="mt-0.5 text-sm text-muted-foreground">Used in public preset names such as @{settings.publisherHandle || "workspace"}/preset.</p>
					</div>
					<div className="w-full shrink-0 sm:w-[min(32rem,55%)]">
						<Input id="publisherHandle" value={settings.publisherHandle} onChange={(event) => update("publisherHandle", event.target.value.toLowerCase())} disabled={!hasTeamControl} placeholder="workspace-handle" maxLength={40} />
					</div>
				</div>

				<div className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-muted-foreground">
						{isPersonalTeam
							? "Your personal workspace is permanent; its publisher handle can still be changed."
							: canEdit
								? "Changes apply everywhere this workspace name is shown."
								: "Owner or admin access is required to change this workspace."}
					</p>
					<div className="flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={handleReset}
							disabled={!hasChanges || saving}
						>
							Reset
						</Button>
						<Button
							type="submit"
							disabled={!hasChanges || saving || !hasTeamControl}
						>
							{saving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving...
								</>
							) : (
								"Save changes"
							)}
						</Button>
					</div>
				</div>
			</form>

			{samlSsoEnabled && !isPersonalTeam ? (
				<WorkspaceIdentitySettings
					key={fallbackTeamId}
					workspaceId={fallbackTeamId}
					initialSettings={teamSsoSettingsByTeam?.[fallbackTeamId]}
					canEdit={canEdit}
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
					Danger Zone
				</h3>
				<div className="overflow-hidden rounded-xl border border-destructive/30 bg-background/40">
					<div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
						<div className="min-w-0">
							<p className="text-sm font-medium">Delete Workspace</p>
							<p className="mt-0.5 text-sm text-muted-foreground">
								{isPersonalTeam
									? "Personal workspaces cannot be deleted."
									: "Permanently remove this workspace and all related data."}
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
									Delete Workspace
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete workspace?</AlertDialogTitle>
									<AlertDialogDescription>
										This will permanently remove the workspace and all related data.
										Type <span className="font-semibold">DELETE WORKSPACE</span> to
										confirm.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<ConfirmDeleteTeam
									onConfirm={handleDeleteTeam}
									deleting={deleting}
									remainingBalance={currentTeamBalance}
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
}: {
	onConfirm: () => void;
	deleting: boolean;
	remainingBalance?: number;
}) {
	const [text, setText] = React.useState("");
	const [ackCredits, setAckCredits] = React.useState(false);
	const ok = text.trim().toUpperCase() === "DELETE WORKSPACE";
	const balance =
		typeof remainingBalance === "number" ? Math.max(remainingBalance, 0) : 0;
	const hasCredits = balance > 0.001;
	const formattedBalance = hasCredits
		? new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
				maximumFractionDigits: 2,
			}).format(balance)
		: null;

	return (
		<div className="grid gap-3">
			<div className="grid gap-2">
				<Label htmlFor="confirmDeleteTeam">Confirmation</Label>
				<Input
					id="confirmDeleteTeam"
					placeholder='Type "DELETE WORKSPACE" to confirm'
					value={text}
					onChange={(event) => setText(event.target.value)}
					autoFocus
				/>
			</div>
			{hasCredits ? (
				<div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950 dark:text-amber-200">
					<p>
						This workspace still has{" "}
						<span className="font-semibold">{formattedBalance}</span> in credits.
						Deleting the workspace will permanently forfeit this balance.
					</p>
					<label className="flex items-center gap-2 text-xs font-medium">
						<input
							type="checkbox"
							className="h-4 w-4 rounded border-muted-foreground"
							checked={ackCredits}
							onChange={(event) =>
								setAckCredits(event.target.checked)
							}
						/>
						I understand these credits can&apos;t be recovered.
					</label>
				</div>
			) : null}
			<AlertDialogFooter>
				<div className="flex w-full items-center justify-end gap-2">
					<AlertDialogCancel className="w-auto" disabled={deleting}>
						Cancel
					</AlertDialogCancel>
					<Button
						variant="destructive"
						onClick={onConfirm}
						disabled={!ok || deleting || (hasCredits && !ackCredits)}
					>
						{deleting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Deleting...
							</>
						) : (
							"Yes, delete this workspace"
						)}
					</Button>
					<AlertDialogAction className="hidden" />
				</div>
			</AlertDialogFooter>
		</div>
	);
}
