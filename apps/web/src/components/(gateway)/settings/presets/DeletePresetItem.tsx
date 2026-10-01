"use client";
import { useSettingsWrite } from "../PrivateSettingsQuery";

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
import { Trash2, Sparkles } from "lucide-react";
import { deletePresetAction } from "@/app/(dashboard)/settings/presets/actions";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function DeletePresetItem({ p, open: controlledOpen, onOpenChange, showTrigger = true }: any) {
	const write = useSettingsWrite();
	const [internalOpen, setInternalOpen] = useState(false);
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const t = useTranslations("SettingsUI");

	async function onDelete(e?: React.FormEvent) {
		e?.preventDefault();
		if (confirm !== p.name) return;
		setLoading(true);
		const promise = write(deletePresetAction(p.id, confirm));
		try {
			await toast.promise(promise, {
				loading: t("strings.Deleting preset..." as never),
				success: t("strings.Preset deleted" as never),
				error: (err) => {
					return (
						(err && (err as any).message) || t("strings.Failed to delete preset" as never)
					);
				},
			});
			setOpen(false);
		} finally {
			setLoading(false);
		}
	}

	return (
		<>
			{showTrigger ? <DropdownMenuItem
				variant="destructive"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}}
			>

					<Trash2 className="mr-2" />
					{t("labels.delete")}

			</DropdownMenuItem> : null}

			<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="h-5 w-5 text-blue-600" />
						{t("strings.Delete Preset" as never)}
					</DialogTitle>
					<DialogDescription>
						{t("strings.This action is permanent and cannot be undone." as never)}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onDelete} className="space-y-4">
					<div className="space-y-2">
						<p className="text-sm">
							{t("settingsPageCopy.confirmPresetName" as never, { name: p.name } as never)}
						</p>
						<Input
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							placeholder={t("strings.Type preset name to confirm" as never)}
						/>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">{t("labels.cancel")}</Button>
						</DialogClose>
						<Button
							type="submit"
							variant="destructive"
							disabled={loading || confirm !== p.name}
						>
							{loading ? t("labels.deleting") : t("strings.Delete Preset" as never)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
			</Dialog>
		</>
	);
}
