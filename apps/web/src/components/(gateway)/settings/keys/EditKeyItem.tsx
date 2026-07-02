"use client";

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
import { Edit2 } from "lucide-react";
import { toast } from "sonner";
import { updateApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function EditKeyItem({
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
	const [internalOpen, setInternalOpen] = useState(false);
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const [name, setName] = useState(k.name || "");
	const [paused, setPaused] = useState(k.status !== "active");
	const [loading, setLoading] = useState(false);

	async function onSave(e?: React.FormEvent) {
		e?.preventDefault();
		setLoading(true);
		const promise = updateApiKeyAction(k.id, { name, paused });
		try {
			await toast.promise(promise, {
				loading: "Saving key...",
				success: "Key updated",
				error: (err) => {
					// prefer message from thrown error if available
					const message =
						(err && (err as any).message) || "Failed to update key";
					return message;
				},
			});
			setOpen(false);
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{trigger ? (
				<DropdownMenuItem asChild>
					<div
						className="w-full text-left flex items-center gap-2"
						onClick={() => {
							// open after menu closes
							setTimeout(() => setOpen(true), 0);
						}}
					>
						<Edit2 className="mr-2" />
						Edit
					</div>
				</DropdownMenuItem>
			) : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit API Key</DialogTitle>
					<DialogDescription>
						Update name or pause the key.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSave} className="space-y-4">
					<Label>Key Name</Label>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<div className="flex items-center justify-between">
						<div className="text-sm">Paused</div>
						<Switch
							checked={paused}
							onCheckedChange={(v: any) => setPaused(Boolean(v))}
						/>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">Cancel</Button>
						</DialogClose>
						<Button type="submit" disabled={loading}>
							{loading ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
