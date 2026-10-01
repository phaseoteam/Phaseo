"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useLocale } from "next-intl";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { rotateApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";
import { SecretRevealActions } from "./SecretRevealActions";

type ExpiryMode = "immediate" | "1h" | "24h" | "7d" | "custom" | "never";

function toIsoFromMode(mode: ExpiryMode, customValue: string): string | null {
	if (mode === "never") return null;
	const now = Date.now();
	if (mode === "immediate") return new Date(now).toISOString();
	if (mode === "1h") return new Date(now + 60 * 60 * 1000).toISOString();
	if (mode === "24h") return new Date(now + 24 * 60 * 60 * 1000).toISOString();
	if (mode === "7d") return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
	if (mode === "custom") {
		if (!customValue.trim()) throw new Error("custom-expiry-required");
		const parsed = new Date(customValue);
		if (Number.isNaN(parsed.getTime())) throw new Error("invalid-custom-expiry");
		return parsed.toISOString();
	}
	return null;
}

export default function RotateKeyItem({
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
	const format = useDisplayFormatters();
	const [internalOpen, setInternalOpen] = useState(false);
	const invalidateSettings = useInvalidatePrivateSettings();
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const [loading, setLoading] = useState(false);
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
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
			const errorCode = error instanceof Error ? error.message : "";
			const message =
				errorCode === "custom-expiry-required"
					? t("keys.customExpiryRequired")
					: errorCode === "invalid-custom-expiry"
						? t("keys.invalidCustomExpiry")
						: t("keys.invalidExpirySettings");
			toast.error(message);
			return;
		}

		setLoading(true);
		const toastId = toast.loading(t("keys.rotating"));
		try {
			const result = await rotateApiKeyAction({
				id: String(k.id),
				newName: newName.trim(),
				previousKeyExpiresAt: expiresAtIso,
			});
			setNewPlaintext(result?.plaintext ?? null);
			void invalidateSettings();
			setOldExpiryApplied(result?.previousKeyExpiresAt ?? expiresAtIso);
			toast.success(t("keys.rotated"), { id: toastId });
		} catch (error) {
			const message = localizedSettingsError(error, t, "Action failed", t("keys.failedRotate"));
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
			{trigger ? (
				<DropdownMenuItem render={<div
						className="w-full text-left flex items-center gap-2"
						onClick={() => {
							setTimeout(() => setOpen(true), 0);
						}} />}>

						<RefreshCw className="mr-2 h-4 w-4" />
						{t("keys.rotate")}

				</DropdownMenuItem>
			) : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("keys.rotateApiKey")}</DialogTitle>
					<DialogDescription>
						{t("keys.rotateDescription")}
					</DialogDescription>
				</DialogHeader>

				{!newPlaintext ? (
					<form onSubmit={onRotate} className="space-y-4">
						<div className="space-y-2">
								<Label htmlFor="rotate-new-name">{t("keys.newKeyName")}</Label>
							<Input
								id="rotate-new-name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
									placeholder={t("keys.keyName")}
							/>
						</div>

						<div className="space-y-2">
			<Label htmlFor="rotate-old-expiry">{t("keys.previousKeyExpiry")}</Label>
							<Select
								value={expiryMode}
								onValueChange={(value) => setExpiryMode(value as ExpiryMode)}
							>
								<SelectTrigger id="rotate-old-expiry" className="w-full">
									<SelectValue placeholder={t("keys.selectExpiry")} />
								</SelectTrigger>
								<SelectContent>
								<SelectItem value="immediate">{t("keys.expireImmediately")}</SelectItem>
								<SelectItem value="1h">{t("keys.expireOneHour")}</SelectItem>
								<SelectItem value="24h">{t("keys.expireOneDay")}</SelectItem>
								<SelectItem value="7d">{t("keys.expireSevenDays")}</SelectItem>
								<SelectItem value="custom">{t("keys.customDateTime")}</SelectItem>
								<SelectItem value="never">{t("keys.neverExpire")}</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{expiryMode === "custom" ? (
							<div className="space-y-2">
								<Label htmlFor="rotate-custom-expiry">{t("keys.customDateTime")}</Label>
								<Input
									id="rotate-custom-expiry"
									type="datetime-local"
									value={customExpiry}
									onChange={(e) => setCustomExpiry(e.target.value)}
								/>
							</div>
						) : null}

						<div className="text-xs text-muted-foreground">
							{t("keys.updateClientsBeforeExpiry")}
						</div>

						<DialogFooter>
							<DialogClose asChild>
								<Button type="button" variant="ghost">
									{t("labels.cancel")}
								</Button>
							</DialogClose>
							<Button type="submit" disabled={!canSubmit}>
								{loading ? t("keys.rotating") : t("keys.rotate")}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<div className="space-y-4">
						<div className="font-mono break-all select-all rounded-lg p-4 bg-gray-100 dark:bg-gray-800">
							{newPlaintext}
						</div>
						<div className="text-sm text-muted-foreground">
							{t("keys.previousKeyExpiry")}: {oldExpiryApplied ? format.dateTime(oldExpiryApplied) : t("labels.never")}
						</div>
						<div className="text-sm text-muted-foreground font-semibold">
							{t("keys.storeThisKeyNow")}
						</div>
						<SecretRevealActions
							secret={newPlaintext}
							name={newName || t("keys.rotatedKeyDefaultName")}
							kind="api-key"
						/>
						<DialogFooter>
							<DialogClose asChild>
								<Button>{t("labels.done")}</Button>
							</DialogClose>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
