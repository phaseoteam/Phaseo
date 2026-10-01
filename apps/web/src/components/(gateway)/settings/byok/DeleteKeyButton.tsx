"use client";

import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogTrigger,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogAction,
	AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { deleteByokKeyAction } from "@/app/(dashboard)/settings/byok/actions";
import { localizedSettingsError } from "@/i18n/error-messages";

export default function DeleteKeyButton({ id }: { id: string }) {
	const t = useTranslations("SettingsUI");
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);

	async function onConfirmDelete() {
		try {
			setLoading(true);
			await deleteByokKeyAction(id);
		toast.success(t("strings.Key deleted" as never));
			setOpen(false);
		} catch (err: any) {
			console.error(err);
			toast.error(
				localizedSettingsError(
					err,
					t,
					"Action failed",
					t("keys.failedDelete" as never),
				),
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={(v) => setOpen(v)}>
			<AlertDialogTrigger asChild>
				<Button
					aria-label={t("settingsCopy.byok.deleteAccessibleLabel")}
					variant="ghost"
					size="sm"
					className="rounded-full p-1 hover:text-red-600"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</AlertDialogTrigger>

			<AlertDialogContent>
				<AlertDialogHeader>
				<AlertDialogTitle>{t("strings.Delete key?" as never)}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("settingsCopy.byok.deleteConfirmation")}
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="flex gap-2 justify-end mt-4">
			<AlertDialogCancel>{t("labels.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => onConfirmDelete()}
						disabled={loading}
						className="bg-red-600 hover:bg-red-700"
					>
						{loading ? t("keys.deletingKey") : t("keys.deleteKey")}
					</AlertDialogAction>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	);
}
