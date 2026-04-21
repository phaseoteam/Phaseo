"use client";

import React, { useMemo, useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/ui/copy-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { rotateApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";

type ExpiryMode = "immediate" | "1h" | "24h" | "7d" | "custom" | "never";

function toIsoFromMode(mode: ExpiryMode, customValue: string): string | null {
	if (mode === "never") return null;
	const now = Date.now();
	if (mode === "immediate") return new Date(now).toISOString();
	if (mode === "1h") return new Date(now + 60 * 60 * 1000).toISOString();
	if (mode === "24h") return new Date(now + 24 * 60 * 60 * 1000).toISOString();
	if (mode === "7d") return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
	if (mode === "custom") {
		if (!customValue.trim()) throw new Error("Select a custom expiry date/time");
		const parsed = new Date(customValue);
		if (Number.isNaN(parsed.getTime())) throw new Error("Invalid custom expiry date/time");
		return parsed.toISOString();
	}
	return null;
}

function formatExpiryLabel(iso: string | null | undefined): string {
	if (!iso) return "Never";
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime())) return "Never";
	return parsed.toLocaleString();
}

export default function RotateKeyItem({ k }: { k: any }) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [newName, setNewName] = useState(String(k?.name ?? ""));
	const [expiryMode, setExpiryMode] = useState<ExpiryMode>("24h");
	const [customExpiry, setCustomExpiry] = useState("");
	const [newPlaintext, setNewPlaintext] = useState<string | null>(null);
	const [oldExpiryApplied, setOldExpiryApplied] = useState<string | null>(null);

	const canSubmit = useMemo(() => {
		if (!newName.trim()) return false;
		if (expiryMode === "custom" && !customExpiry.trim()) return false;
		return !loading;
	}, [newName, expiryMode, customExpiry, loading]);

	const reset = () => {
		setLoading(false);
		setNewName(String(k?.name ?? ""));
		setExpiryMode("24h");
		setCustomExpiry("");
		setNewPlaintext(null);
		setOldExpiryApplied(null);
	};

	const onRotate = async (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!canSubmit) return;

		let expiresAtIso: string | null = null;
		try {
			expiresAtIso = toIsoFromMode(expiryMode, customExpiry);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Invalid expiry settings";
			toast.error(message);
			return;
		}

		setLoading(true);
		const toastId = toast.loading("Rotating key...");
		try {
			const result = await rotateApiKeyAction({
				id: String(k.id),
				newName: newName.trim(),
				previousKeyExpiresAt: expiresAtIso,
			});
			setNewPlaintext(result?.plaintext ?? null);
			setOldExpiryApplied(result?.previousKeyExpiresAt ?? expiresAtIso);
			toast.success("Key rotated", { id: toastId });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to rotate key";
			toast.error(message, { id: toastId });
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DropdownMenuItem asChild>
				<button
					className="w-full text-left flex items-center gap-2"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}}
				>
					<RefreshCw className="mr-2 h-4 w-4" />
					Rotate
				</button>
			</DropdownMenuItem>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rotate API key</DialogTitle>
					<DialogDescription>
						Create a replacement key and choose when the current key expires.
					</DialogDescription>
				</DialogHeader>

				{!newPlaintext ? (
					<form onSubmit={onRotate} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="rotate-new-name">New key name</Label>
							<Input
								id="rotate-new-name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="Key name"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="rotate-old-expiry">Previous key expiry</Label>
							<Select
								value={expiryMode}
								onValueChange={(value) => setExpiryMode(value as ExpiryMode)}
							>
								<SelectTrigger id="rotate-old-expiry" className="w-full">
									<SelectValue placeholder="Select expiry timing" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="immediate">Expire immediately</SelectItem>
									<SelectItem value="1h">Expire in 1 hour</SelectItem>
									<SelectItem value="24h">Expire in 24 hours</SelectItem>
									<SelectItem value="7d">Expire in 7 days</SelectItem>
									<SelectItem value="custom">Custom date/time</SelectItem>
									<SelectItem value="never">Do not expire automatically</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{expiryMode === "custom" ? (
							<div className="space-y-2">
								<Label htmlFor="rotate-custom-expiry">Custom expiry</Label>
								<Input
									id="rotate-custom-expiry"
									type="datetime-local"
									value={customExpiry}
									onChange={(e) => setCustomExpiry(e.target.value)}
								/>
							</div>
						) : null}

						<div className="text-xs text-muted-foreground">
							The new key is shown once. Copy and update your clients before the previous key expires.
						</div>

						<DialogFooter>
							<DialogClose asChild>
								<Button type="button" variant="ghost">
									Cancel
								</Button>
							</DialogClose>
							<Button type="submit" disabled={!canSubmit}>
								{loading ? "Rotating..." : "Rotate key"}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<div className="space-y-4">
						<div className="font-mono break-all select-all rounded-lg p-4 bg-gray-100 dark:bg-gray-800">
							{newPlaintext}
						</div>
						<div className="text-sm text-muted-foreground">
							Previous key expiry: {formatExpiryLabel(oldExpiryApplied)}
						</div>
						<div className="text-sm text-muted-foreground font-semibold">
							Store this key now. It will not be shown again.
						</div>
						<DialogFooter>
							<CopyButton
								content={newPlaintext}
								size="default"
								variant="outline"
								aria-label="Copy rotated API key"
							/>
							<DialogClose asChild>
								<Button>Done</Button>
							</DialogClose>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
