"use client";

import * as React from "react";
import { z } from "zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardFooter,
	CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
} from "@/app/(dashboard)/settings/teams/actions";
import type { TeamSsoSettingsRow } from "@/lib/auth/teamSsoSettings";

type Team = { id: string; name: string };
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
};

type Settings = {
	teamName: string;
};

const DEFAULTS: Settings = {
	teamName: "",
};

const schema = z.object({
	teamName: z.string().trim().min(1, "Workspace name is required").max(60),
});

export default function TeamSettingsPanel({
	teams,
	membersByTeam,
	workspaceId,
	currentUserId,
	personalTeamId,
	walletBalances,
	teamSsoSettingsByTeam,
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

	const [loading, setLoading] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

	const [settings, setSettings] = React.useState<Settings>(DEFAULTS);
	const [initial, setInitial] = React.useState<Settings>(DEFAULTS);

	const hasChanges = initial.teamName.trim() !== settings.teamName.trim();

	React.useEffect(() => {
		if (!workspaceId) return;
		const team = teams.find((entry) => entry.id === workspaceId);
		const next: Settings = {
		teamName: team?.name ?? DEFAULTS.teamName,
		};
		setSettings(next);
		setInitial(next);
		setLoading(false);
	}, [workspaceId, teams]);

	function update<K extends keyof Settings>(key: K, value: Settings[K]) {
		setSettings((prev) => ({ ...prev, [key]: value }));
	}

	async function handleSave() {
		if (!workspaceId) return;
		if (isPersonalTeam) {
			toast.error("Personal workspace settings cannot be edited.");
			return;
		}

		const parsed = schema.safeParse({
			teamName: settings.teamName,
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

					if (normalizedName !== initialName) {
						await updateTeamAction(workspaceId, normalizedName);
					}
					const normalized = { teamName: normalizedName };
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
		<section className="space-y-4">
			<Card className={cn(!canEdit && "opacity-90")}>
				<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							General
							{isPersonalTeam ? (
								<Badge
									variant="secondary"
									className="text-[0.6rem] font-semibold uppercase"
								>
									Personal
								</Badge>
							) : null}
						</CardTitle>
						<CardDescription>
							Configure your workspace basics.
							{isPersonalTeam ? (
								<span className="mt-1 block text-xs text-muted-foreground">
									Your personal workspace is immutable and always serves as your
									default.
								</span>
							) : null}
						</CardDescription>
					</div>
					<Badge variant="outline" className="w-fit">
						{teams.find((team) => team.id === fallbackTeamId)?.name ??
							"Selected workspace"}
					</Badge>
				</CardHeader>

				<Separator />

				<CardContent className="grid max-w-2xl gap-6 pt-6">
					<div className="grid gap-2">
						<Label htmlFor="teamName">Workspace name</Label>
						<Input
							id="teamName"
							value={settings.teamName}
							onChange={(event) => update("teamName", event.target.value)}
							disabled={!canEdit || loading}
							placeholder="e.g. Personal, Engineering, Growth"
							maxLength={60}
						/>
					</div>
				</CardContent>

				<CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<AlertDialog
							open={deleteDialogOpen}
							onOpenChange={setDeleteDialogOpen}
						>
							<AlertDialogTrigger asChild>
								<Button
									variant="destructive"
									disabled={!canDeleteWorkspace || loading}
								>
									<Trash2 className="mr-2 h-4 w-4" />
									Delete workspace
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

					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={handleReset}
							disabled={!hasChanges || saving || loading}
						>
							Reset
						</Button>
						<Button
							onClick={handleSave}
							disabled={!hasChanges || saving || loading || !canEdit}
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
				</CardFooter>
			</Card>
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
						I understand these credits can't be recovered.
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
