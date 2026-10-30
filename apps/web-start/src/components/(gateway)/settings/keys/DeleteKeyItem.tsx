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
import { Trash2 } from "lucide-react";
import { deleteApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function DeleteKeyItem({
	k,
	trigger = true,
	open: controlledOpen,
	onOpenChange,
	onDeleted,
}: {
	k: any;
	trigger?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onDeleted?: () => void;
}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const invalidateSettings = useInvalidatePrivateSettings();
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const t = useTranslations("SettingsUI");

	async function onDelete(e?: React.FormEvent) {
		e?.preventDefault();
		if (confirm !== k.name) return;
		setLoading(true);
		const promise = deleteApiKeyAction(k.id, confirm);
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
			setOpen(false);
			onDeleted?.();
		} catch {
			// The toast reports the mutation error; keep the dialog open.
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{trigger ? (
				<DropdownMenuItem variant="destructive" render={<div
						className="w-full text-left flex items-center gap-2"
						onClick={() => {
							setTimeout(() => setOpen(true), 0);
						}} />}>

						<Trash2 className="mr-2" />
						{t("labels.delete")}

				</DropdownMenuItem>
			) : null}

			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("keys.deleteApiKey")}</DialogTitle>
					<DialogDescription>
						{t("settingsCopy.keyDelete.permanent")}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onDelete} className="space-y-4">
					<div className="space-y-2">
						<p className="text-sm">
							{t("settingsCopy.keyDelete.confirmName", { name: k.name })}
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
