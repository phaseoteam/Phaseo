"use client";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Trash2, ShieldAlert } from "lucide-react";
import { deleteManagementKeyAction } from "@/app/(dashboard)/settings/management-api-keys/actions";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function DeleteManagementKeyItem({
	k,
	trigger = true,
	open: controlledOpen,
	onOpenChange,
}: {
	k: any;
	trigger?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	const invalidateSettings = useInvalidatePrivateSettings();
	const dialogOpen = controlledOpen ?? open;
	const setDialogOpen = onOpenChange ?? setOpen;
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const t = useTranslations("SettingsUI");

	async function onDelete(e?: React.FormEvent) {
		e?.preventDefault();
		if (confirm !== k.name) return;
		setLoading(true);
		const promise = deleteManagementKeyAction(k.id, confirm);
		try {
			await toast.promise(promise, {
					loading: t("keys.deletingKey"),
					success: t("keys.deleted"),
				error: (err) => {
					return (
						localizedSettingsError(err, t, "Action failed", t("keys.failedDelete"))
					);
				},
			});
			await promise;
			void invalidateSettings();
			setDialogOpen(false);
		} catch {
			// The toast reports the mutation error; keep the dialog open.
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? (
				<DropdownMenuItem render={<div
						role="button"
						tabIndex={0}
						className="w-full text-left flex items-center gap-2 text-red-600"
						onClick={(e) => {
							e.preventDefault();
							setTimeout(() => setDialogOpen(true), 0);
						}} />}>

						<Trash2 className="mr-2" />
						{t("labels.delete")}

				</DropdownMenuItem>
			) : null}

			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-red-600">
						<ShieldAlert className="h-5 w-5" />
						{t("keys.deleteApiKey")}
					</DialogTitle>
					<DialogDescription>
						{t("strings.phraseThisActionIsPermanentThisKeyHasElevatedPrivileges" as never)}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onDelete} className="space-y-4">
					<div className="space-y-2">
						<p className="text-sm">
							{t("settingsPageCopy.confirmKeyName" as never, { name: k.name } as never)}
						</p>
						<Input
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							placeholder={t("keys.typeKeyName")}
						/>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">{t("labels.cancel")}</Button>
						</DialogClose>
						<Button
							type="submit"
							variant="destructive"
							disabled={loading || confirm !== k.name}
						>
							{loading ? t("keys.deletingKey") : t("keys.deleteKey")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
