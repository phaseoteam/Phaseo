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
import { updateManagementKeyAction } from "@/app/(dashboard)/settings/management-api-keys/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function toDateTimeLocalInput(value: string | null): string {
	if (!value) return "";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoFromDateTimeLocalInput(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	return date.toISOString();
}

export default function EditManagementKeyItem({
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
	const dialogOpen = controlledOpen ?? open;
	const setDialogOpen = onOpenChange ?? setOpen;
	const [name, setName] = useState(k.name || "");
	const [paused, setPaused] = useState(k.status !== "active");
	const [expiresAtLocal, setExpiresAtLocal] = useState(() =>
		toDateTimeLocalInput(
			typeof k?.expires_at === "string" ? k.expires_at : null
		)
	);
	const [loading, setLoading] = useState(false);

	async function onSave(e?: React.FormEvent) {
		e?.preventDefault();
		setLoading(true);
		const promise = updateManagementKeyAction(k.id, {
			name,
			paused,
			expiresAt: toIsoFromDateTimeLocalInput(expiresAtLocal),
		});
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
			setDialogOpen(false);
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? (
				<DropdownMenuItem asChild>
					<div
						role="button"
						tabIndex={0}
						className="w-full text-left flex items-center gap-2"
						onClick={(e) => {
							e.preventDefault();
							setTimeout(() => setDialogOpen(true), 0);
						}}
					>
						<Edit2 className="mr-2" />
						Edit
					</div>
				</DropdownMenuItem>
			) : null}
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
					<div className="space-y-2">
						<Label>Expiry</Label>
						<Input
							type="datetime-local"
							value={expiresAtLocal}
							onChange={(e) => setExpiresAtLocal(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Optional. Clear this field to remove the expiry date.
						</p>
					</div>
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

