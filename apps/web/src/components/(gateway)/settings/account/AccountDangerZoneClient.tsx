"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { deleteAccount } from "@/app/(dashboard)/settings/account/actions";
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
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";

export default function AccountDangerZoneClient() {
	const t = useTranslations("SettingsUI");
	const s = (key: string) => t(settingsStringKey(key) as never);
	const router = useRouter();
	const [deleting, setDeleting] = React.useState(false);

	async function handleDeleteAccount(confirmation: string, currentPassword: string) {
		setDeleting(true);
		try {
			await toast.promise(deleteAccount(confirmation, currentPassword || undefined), {
				loading: s("phraseStartingAccountDeletion"),
				success: s("phraseAccountAccessRemovedDeletionIsInProgress"),
				error: (error: unknown) =>
					localizedSettingsError(error, t, "Could not delete account"),
			});
			router.replace("/");
			router.refresh();
		} catch (e) {
			void e;
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="rounded-lg border border-destructive/30 bg-destructive/[0.02] p-4 sm:p-5 space-y-4">
			<div className="min-w-0">
				<h3 className="text-sm font-medium flex items-center gap-2 text-destructive">
					<ShieldAlert className="h-4 w-4" />
					{s("Danger Zone")}
				</h3>
				<p className="text-sm text-muted-foreground mt-1">
					{s("phraseDeletingYourAccountImmediatelyRemovesAccessAndStartsPermanentDeletionFromPhaseoSActiveSystemsTheProcessMustCompleteWithin30DaysAndCannotBeUndone")}
				</p>
			</div>

			<div className="flex items-center justify-end">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">
							<Trash2 className="mr-2 h-4 w-4" />
							{s("Delete account")}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{s("Delete account?")}</AlertDialogTitle>
							<AlertDialogDescription>
								{s("phraseThisRemovesYourAccountOwnedWorkspacesKeysStoredGatewayDataAndLinkedStripeCustomerRecordsOtherMembersWillLoseAccessToAnyWorkspaceYouOwnDatabaseBackupsExpireThroughTheSevenDayBackupCycleRecordsThatMustBeRetainedByLawAndDataHeldByCustomerDirectedProvidersAreHandledSeparatelyType")}{" "}
						<span className="font-semibold">DELETE</span> {s("phraseToConfirm")}
							</AlertDialogDescription>
						</AlertDialogHeader>

						<ConfirmDelete onConfirm={handleDeleteAccount} deleting={deleting} translate={s} />
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}

function ConfirmDelete({
	onConfirm,
	deleting,
	translate,
}: {
	onConfirm: (confirmation: string, currentPassword: string) => void;
	deleting: boolean;
	translate: (key: string) => string;
}) {
	const s = translate;
	const [text, setText] = React.useState("");
	const [currentPassword, setCurrentPassword] = React.useState("");
	const ok = text.trim().toUpperCase() === "DELETE";
	return (
		<div className="grid gap-3">
			<div className="grid gap-2">
						<Label htmlFor="confirmDelete">{s("Confirmation")}</Label>
				<Input
					id="confirmDelete"
						placeholder={s('Type "DELETE" to confirm')}
					value={text}
					onChange={(e) => setText(e.target.value)}
					autoFocus
				/>
			</div>
			<div className="grid gap-2">
						<Label htmlFor="deleteCurrentPassword">{s("Current password")}</Label>
				<Input id="deleteCurrentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
					<p className="text-xs text-muted-foreground">{s("phrasePasswordlessAccountsRequireARecentProviderSignIn")}</p>
			</div>
			<AlertDialogFooter>
				<div className="flex w-full items-center justify-end gap-2">
					<AlertDialogCancel className="w-auto" disabled={deleting}>
						{s("Cancel")}
					</AlertDialogCancel>

					<Button variant="destructive" onClick={() => onConfirm(text, currentPassword)} disabled={!ok || deleting}>
						{deleting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{s("phraseDeleting")}
							</>
						) : (
							s("Yes, delete my account")
						)}
					</Button>

					<AlertDialogAction className="hidden" />
				</div>
			</AlertDialogFooter>
		</div>
	);
}
