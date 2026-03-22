"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
	buildExpirySelectionPreview,
	buildExpiryUtcIso,
	getBrowserTimeZone,
} from "@/lib/credits/expiryDateTime";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { disableCreditGrantAction, updateCreditGrantAction } from "./actions";

type Props = {
	grantId: string;
	code: string;
	maxRedemptions: number;
	redemptionsCount: number;
	expiresAt: string | null;
	isActive: boolean;
	note: string | null;
};

function toDateTimeLocalInput(value: string | null): string {
	if (!value) return "";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return fallback;
}

export default function CreditGrantEditDialog(props: Props) {
	const {
		grantId,
		code,
		maxRedemptions,
		redemptionsCount,
		expiresAt,
		isActive,
		note,
	} = props;

	const router = useRouter();
	const formRef = useRef<HTMLFormElement>(null);
	const [open, setOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isDisabling, setIsDisabling] = useState(false);
	const [expiryLocalValue, setExpiryLocalValue] = useState(() =>
		toDateTimeLocalInput(expiresAt)
	);
	const isBusy = isSaving || isDisabling;
	const hiddenExpiresAt = useMemo(() => {
		if (!expiryLocalValue) return "";
		const [datePart, timePart] = expiryLocalValue.split("T");
		return buildExpiryUtcIso(datePart ?? "", timePart ?? "", "23:59");
	}, [expiryLocalValue]);
	const expiryPreview = useMemo(() => {
		if (!expiryLocalValue) return null;
		const [datePart, timePart] = expiryLocalValue.split("T");
		return buildExpirySelectionPreview(datePart ?? "", timePart ?? "", "23:59");
	}, [expiryLocalValue]);
	const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);

	async function handleSave() {
		if (!formRef.current || isBusy) return;
		const formData = new FormData(formRef.current);
		setIsSaving(true);
		try {
			await toast.promise(updateCreditGrantAction(formData), {
				loading: "Saving promo code...",
				success: "Promo code updated.",
				error: (error) => getErrorMessage(error, "Failed to update promo code."),
			});
			router.refresh();
			setOpen(false);
		} finally {
			setIsSaving(false);
		}
	}

	async function handleDisable() {
		if (isBusy) return;
		const formData = new FormData();
		formData.set("grant_id", grantId);
		setIsDisabling(true);
		try {
			await toast.promise(disableCreditGrantAction(formData), {
				loading: "Disabling promo code...",
				success: "Promo code disabled.",
				error: (error) => getErrorMessage(error, "Failed to disable promo code."),
			});
			router.refresh();
			setOpen(false);
		} finally {
			setIsDisabling(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					Edit
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Promo Code</DialogTitle>
					<DialogDescription>
						Update redemption limits, expiry, active status, and note for{" "}
						<span className="font-medium text-foreground">{code}</span>.
					</DialogDescription>
				</DialogHeader>
				<form
					ref={formRef}
					className="space-y-3"
					onSubmit={(event) => {
						event.preventDefault();
						void handleSave();
					}}
				>
					<input type="hidden" name="grant_id" value={grantId} />
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1">
							<Label htmlFor={`max-redemptions-${grantId}`}>Max Redemptions</Label>
							<Input
								id={`max-redemptions-${grantId}`}
								name="max_redemptions"
								type="number"
								min="1"
								step="1"
								defaultValue={String(maxRedemptions)}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor={`redemptions-count-${grantId}`}>Redemptions Used</Label>
							<Input
								id={`redemptions-count-${grantId}`}
								name="redemptions_count"
								type="number"
								min="0"
								step="1"
								defaultValue={String(redemptionsCount)}
							/>
						</div>
					</div>
					<div className="space-y-1">
						<Label htmlFor={`expires-at-${grantId}`}>Expires At</Label>
						<Input
							id={`expires-at-${grantId}`}
							name="expires_at_local"
							type="datetime-local"
							value={expiryLocalValue}
							onChange={(event) => setExpiryLocalValue(event.target.value)}
						/>
						{expiryPreview ? (
							<div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
								<p>
									Timezone:{" "}
									<span className="font-medium text-foreground">
										{expiryPreview.timezoneDisplay}
									</span>
								</p>
								<p>Local expiry: {expiryPreview.localDisplay}</p>
								<p>
									Stored as UTC:{" "}
									<span className="font-mono text-foreground">
										{expiryPreview.utcDisplay}
									</span>
								</p>
							</div>
						) : (
							<p className="text-xs text-muted-foreground">
								Uses your browser timezone ({browserTimeZone}). Pick a date/time
								to preview the UTC value that will be stored.
							</p>
						)}
						<input type="hidden" name="expires_at" value={hiddenExpiresAt} />
					</div>
					<div className="space-y-1">
						<Label htmlFor={`note-${grantId}`}>Note</Label>
						<Input
							id={`note-${grantId}`}
							name="note"
							defaultValue={note ?? ""}
							placeholder="Internal note"
						/>
					</div>
					<label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
						<input type="hidden" name="is_active" value="false" />
						<input
							type="checkbox"
							name="is_active"
							value="true"
							defaultChecked={isActive}
							className="h-4 w-4"
						/>
						Active
					</label>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={!isActive || isBusy}
							onClick={() => {
								void handleDisable();
							}}
						>
							Disable
						</Button>
						<Button type="submit" disabled={isBusy}>
							Save Changes
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
