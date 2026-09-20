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

export default function DeletePresetItem({ p, open: controlledOpen, onOpenChange, showTrigger = true }: any) {
	const write = useSettingsWrite();
	const [internalOpen, setInternalOpen] = useState(false);
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);

	async function onDelete(e?: React.FormEvent) {
		e?.preventDefault();
		if (confirm !== p.name) return;
		setLoading(true);
		const promise = write(deletePresetAction(p.id, confirm));
		try {
			await toast.promise(promise, {
				loading: `Deleting preset...`,
				success: `Preset deleted`,
				error: (err) => {
					return (
						(err && (err as any).message) || "Failed to delete preset"
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
					Delete

			</DropdownMenuItem> : null}

			<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="h-5 w-5 text-blue-600" />
						Delete Preset
					</DialogTitle>
					<DialogDescription>
						This action is permanent and cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onDelete} className="space-y-4">
					<div className="space-y-2">
						<p className="text-sm">
							To confirm, type the preset name{" "}
							<strong>{p.name}</strong> below.
						</p>
						<Input
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							placeholder="Type preset name to confirm"
						/>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">Cancel</Button>
						</DialogClose>
						<Button
							type="submit"
							variant="destructive"
							disabled={loading || confirm !== p.name}
						>
							{loading ? "Deleting..." : "Delete Preset"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
			</Dialog>
		</>
	);
}
