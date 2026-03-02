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
// removed Textarea and Switch imports
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
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
import { Loader2, Trash2, UserCog } from "lucide-react";
import {
	updateTeamAction,
	deleteTeamAction,
} from "@/app/(dashboard)/settings/teams/actions";

/* ──────────────────────────────────────────────────────────────────────────── */

type Team = { id: string; name: string };
type MembersByTeam = Record<
	string,
	Array<{ user_id: string; role?: string; display_name?: string }>
>;

type Props = {
	teams: Team[];
	membersByTeam: MembersByTeam;
	teamId?: string | undefined | null; // controlled team id
	onTeamChange?: (id?: string) => void;
	currentUserId?: string | null;
	personalTeamId?: string | null;
	walletBalances?: Record<string, number>;
};

type Settings = {
	teamName: string;
};

const DEFAULTS: Settings = {
	teamName: "",
};

const schema = z.object({
	teamName: z.string().trim().min(1, "Team name is required").max(60),
	// only keep teamName
});

/* Helper: normalise empty string -> null for nullable fields */
function normalise(settings: Settings): Settings {
	return {
		...settings,
	};
}

export default function TeamSettingsPanel({
	teams,
	membersByTeam,
	teamId,
	onTeamChange,
	currentUserId,
	personalTeamId,
	walletBalances,
}: Props) {
	// teamId is controlled by parent; ensure we compute a fallback for internal use
	const fallbackTeamId =
		(teamId && teams.some((t) => t.id === teamId)
			? teamId
			: teams[0]?.id) || undefined;

	// currentTeam not currently used

	const roleForCurrentUser = React.useMemo(() => {
		if (!fallbackTeamId || !currentUserId) return undefined;
		const m = (membersByTeam[fallbackTeamId] ?? []).find(
			(x) => x.user_id === currentUserId
		);
		return (m?.role || "").toLowerCase();
	}, [fallbackTeamId, currentUserId, membersByTeam]);

	const isPersonalTeam = Boolean(
		fallbackTeamId && personalTeamId && fallbackTeamId === personalTeamId
	);

	const hasTeamControl =
		roleForCurrentUser === "owner" || roleForCurrentUser === "admin";

	const canEdit = hasTeamControl && !isPersonalTeam;
	const currentTeamBalance =
		fallbackTeamId && walletBalances
			? walletBalances[fallbackTeamId] ?? 0
			: 0;

	const [loading, setLoading] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

	const [settings, setSettings] = React.useState<Settings>(DEFAULTS);
	const [initial, setInitial] = React.useState<Settings>(DEFAULTS);

	const hasChanges =
		JSON.stringify(normalise(initial)) ===
		JSON.stringify(normalise(settings))
			? false
			: true;

	// Initialize settings from props (no network fetches)
	React.useEffect(() => {
		if (!teamId) return;
		const t = teams.find((x) => x.id === teamId);
		const next: Settings = {
			teamName: t?.name ?? DEFAULTS.teamName,
		};
		setSettings(next);
		setInitial(next);
		// ensure loading is false when using props
		setLoading(false);
	}, [teamId, teams]);

	function update<K extends keyof Settings>(key: K, val: Settings[K]) {
		setSettings((prev) => ({ ...prev, [key]: val }));
	}

	async function handleSave() {
		if (!teamId) return;
		if (isPersonalTeam) {
			toast.error("Personal team name cannot be changed.");
			return;
		}

		const parsed = schema.safeParse({
			...settings,
		});

		if (!parsed.success) {
			toast.error(
				parsed.error.issues[0]?.message ?? "Please check your inputs."
			);
			return;
		}

		setSaving(true);
		try {
			await toast.promise(updateTeamAction(teamId, settings.teamName), {
				loading: "Saving team settings…",
				success: "Saved ✅",
				error: (err: any) => err?.message || "Could not save settings",
			});
			setInitial(settings);
		} finally {
			setSaving(false);
		}
	}

	function handleReset() {
		setSettings(initial);
	}

	async function handleDeleteTeam() {
		if (!teamId) return;
		if (isPersonalTeam) {
			toast.error("Personal team cannot be deleted.");
			return;
		}
		setDeleting(true);
		try {
			await toast.promise(deleteTeamAction(teamId), {
				loading: "Deleting team…",
				success: "Team deleted",
				error: (e: any) => e?.message || "Could not delete team",
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
							{isPersonalTeam && (
								<Badge
									variant="secondary"
									className="text-[0.6rem] font-semibold uppercase"
								>
									Personal
								</Badge>
							)}
						</CardTitle>
						<CardDescription>
							Configure your team’s basics and defaults.
							{isPersonalTeam && (
								<span className="mt-1 block text-xs text-muted-foreground">
									Your personal team is immutable and always
									serves as your default.
								</span>
							)}
						</CardDescription>
					</div>
					<Select
						value={fallbackTeamId}
						onValueChange={(v) => onTeamChange?.(v)}
					>
						<SelectTrigger className="w-full sm:w-[240px]">
							<SelectValue placeholder="Select team…" />
						</SelectTrigger>
						<SelectContent>
							{teams.map((t) => (
								<SelectItem key={t.id} value={t.id}>
									{t.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</CardHeader>

				<Separator />

				<CardContent className="pt-6 grid gap-6 max-w-2xl">
					{/* Team name */}
					<div className="grid gap-4">
						<div className="space-y-2">
							<Label htmlFor="teamName">Team name</Label>
							<Input
								id="teamName"
								value={settings.teamName}
								onChange={(e) =>
									update("teamName", e.target.value)
								}
								disabled={!canEdit || loading}
								placeholder="e.g. Personal, Engineering, Growth"
								maxLength={60}
							/>
						</div>
					</div>
				</CardContent>

				<CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="text-xs text-muted-foreground flex items-center gap-2">
						{/* Delete team trigger */}
						<AlertDialog
							open={deleteDialogOpen}
							onOpenChange={setDeleteDialogOpen}
						>
							<AlertDialogTrigger asChild>
								<Button
									variant="destructive"
									disabled={!canEdit || loading}
								>
									<Trash2 className="mr-2 h-4 w-4" />
									Delete team
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										Delete team?
									</AlertDialogTitle>
									<AlertDialogDescription>
										This will permanently remove the team
										and all related data. Type{" "}
										<span className="font-semibold">
											DELETE TEAM
										</span>{" "}
										to confirm.
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
							disabled={
								!hasChanges || saving || loading || !canEdit
							}
						>
							{saving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving…
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

/** Inline confirmation block for destructive action */
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
	const ok = text.trim().toUpperCase() === "DELETE TEAM";
	const balance =
		typeof remainingBalance === "number" ? Math.max(remainingBalance, 0) : 0;
	const hasCredits = balance > 0.001;
	const [ackCredits, setAckCredits] = React.useState(false);
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
					placeholder='Type "DELETE TEAM" to confirm'
					value={text}
					onChange={(e) => setText(e.target.value)}
					autoFocus
				/>
			</div>
			{hasCredits ? (
				<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950 dark:text-amber-200 space-y-3">
					<p>
						This team still has{" "}
						<span className="font-semibold">
							{formattedBalance}
						</span>{" "}
						in credits. Deleting the team will permanently forfeit
						this balance.
					</p>
					<label className="flex items-center gap-2 text-xs font-medium">
						<input
							type="checkbox"
							className="h-4 w-4 rounded border-muted-foreground"
							checked={ackCredits}
							onChange={(e) => setAckCredits(e.target.checked)}
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
						disabled={
							!ok || deleting || (hasCredits && !ackCredits)
						}
					>
						{deleting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Deleting…
							</>
						) : (
							"Yes, delete this team"
						)}
					</Button>
					<AlertDialogAction className="hidden" />
				</div>
			</AlertDialogFooter>
		</div>
	);
}
