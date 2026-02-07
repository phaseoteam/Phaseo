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
import { Edit2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { updateProvisioningKeyAction } from "@/app/(dashboard)/settings/provisioning-keys/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function EditProvisioningKeyItem({ k }: any) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(k.name || "");
	const [paused, setPaused] = useState(k.status !== "active");
	const [loading, setLoading] = useState(false);

	async function onSave(e?: React.FormEvent) {
		e?.preventDefault();
		setLoading(true);
		const promise = updateProvisioningKeyAction(k.id, { name, paused });
		try {
			await toast.promise(promise, {
				loading: "Saving management API key...",
				success: "Management API key updated",
				error: (err) => {
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
			<DropdownMenuItem asChild>
				<button
					className="w-full text-left flex items-center gap-2"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}}
				>
					<Edit2 className="mr-2" />
					Edit
				</button>
			</DropdownMenuItem>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldAlert className="h-5 w-5 text-amber-600" />
						Edit Management API Key
					</DialogTitle>
					<DialogDescription>
						Update name or pause this elevated-privilege key.
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
