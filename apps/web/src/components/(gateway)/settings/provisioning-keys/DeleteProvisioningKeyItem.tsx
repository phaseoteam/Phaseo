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
import { Trash2, ShieldAlert } from "lucide-react";
import { deleteProvisioningKeyAction } from "@/app/(dashboard)/settings/provisioning-keys/actions";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

export default function DeleteProvisioningKeyItem({ k }: any) {
	const [open, setOpen] = useState(false);
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);

	async function onDelete(e?: React.FormEvent) {
		e?.preventDefault();
		if (confirm !== k.name) return;
		setLoading(true);
		const promise = deleteProvisioningKeyAction(k.id, confirm);
		try {
			await toast.promise(promise, {
				loading: `Deleting management API key...`,
				success: `Management API key deleted`,
				error: (err) => {
					return (
						(err && (err as any).message) || "Failed to delete key"
					);
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
					className="w-full text-left flex items-center gap-2 text-red-600"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}}
				>
					<Trash2 className="mr-2" />
					Delete
				</button>
			</DropdownMenuItem>

			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-red-600">
						<ShieldAlert className="h-5 w-5" />
						Delete Management API Key
					</DialogTitle>
					<DialogDescription>
						This action is permanent. This key has elevated privileges.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onDelete} className="space-y-4">
					<div className="space-y-2">
						<p className="text-sm">
							To confirm, type the key name{" "}
							<strong>{k.name}</strong> below.
						</p>
						<Input
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							placeholder="Type key name to confirm"
						/>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">Cancel</Button>
						</DialogClose>
						<Button
							type="submit"
							variant="destructive"
							disabled={loading || confirm !== k.name}
						>
							{loading ? "Deleting..." : "Delete Key"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
