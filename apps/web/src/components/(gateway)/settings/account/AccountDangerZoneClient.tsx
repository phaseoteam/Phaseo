"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteAccount } from "@/app/(dashboard)/settings/account/actions";

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
	const [deleting, setDeleting] = React.useState(false);

	async function handleDeleteAccount() {
		setDeleting(true);
		try {
			await toast.promise(deleteAccount(), {
				loading: "Deleting your account...",
				success: "Account deleted.",
				error: (err: any) => err?.message || "Could not delete account",
			});
			window.location.href = "/";
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
					Danger Zone
				</h3>
				<p className="text-sm text-muted-foreground mt-1">
					Deleting your account permanently removes all your data. This cannot be
					undone.
				</p>
			</div>

			<div className="flex items-center justify-end">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">
							<Trash2 className="mr-2 h-4 w-4" />
							Delete account
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete account?</AlertDialogTitle>
							<AlertDialogDescription>
								This will permanently remove your account and all associated data.
								Type <span className="font-semibold">DELETE</span> to confirm.
							</AlertDialogDescription>
						</AlertDialogHeader>

						<ConfirmDelete onConfirm={handleDeleteAccount} deleting={deleting} />
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}

function ConfirmDelete({
	onConfirm,
	deleting,
}: {
	onConfirm: () => void;
	deleting: boolean;
}) {
	const [text, setText] = React.useState("");
	const ok = text.trim().toUpperCase() === "DELETE";
	return (
		<div className="grid gap-3">
			<div className="grid gap-2">
				<Label htmlFor="confirmDelete">Confirmation</Label>
				<Input
					id="confirmDelete"
					placeholder='Type "DELETE" to confirm'
					value={text}
					onChange={(e) => setText(e.target.value)}
					autoFocus
				/>
			</div>
			<AlertDialogFooter>
				<div className="flex w-full items-center justify-end gap-2">
					<AlertDialogCancel className="w-auto" disabled={deleting}>
						Cancel
					</AlertDialogCancel>

					<Button variant="destructive" onClick={onConfirm} disabled={!ok || deleting}>
						{deleting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Deleting...
							</>
						) : (
							"Yes, delete my account"
						)}
					</Button>

					<AlertDialogAction className="hidden" />
				</div>
			</AlertDialogFooter>
		</div>
	);
}

