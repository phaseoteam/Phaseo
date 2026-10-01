"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

interface DeleteOAuthAppDialogProps {
	clientId: string;
	appName: string;
}

export default function DeleteOAuthAppDialog({
	clientId,
	appName,
}: DeleteOAuthAppDialogProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmation, setConfirmation] = useState("");
	const router = useRouter();
	const t = useTranslations("SettingsUI");

	const handleDelete = async () => {
		if (confirmation !== appName) {
			setError(t("strings.App name doesn't match" as never));
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const { deleteOAuthAppAction } = await import(
				"@/app/(dashboard)/settings/oauth-apps/actions"
			);

			const result = await deleteOAuthAppAction(clientId);

			if (result.error) {
				setError(localizedSettingsError(result.error, t, "Failed to delete OAuth app"));
				return;
			}

			toast.success(`${t("strings.OAuth app" as never)} "${appName}" ${t("strings.deleted successfully" as never)}`);

			// Navigate back to the list
			router.push("/settings/oauth-apps");
			router.refresh();
		} catch (err: any) {
			setError(localizedSettingsError(err, t, "Failed to delete OAuth app"));
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setConfirmation("");
		setError(null);
	};

	return (
		<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
			<DialogTrigger asChild>
				<Button variant="destructive" size="sm">
					<Trash2 className="h-4 w-4 mr-2" />
					{t("oauthCardCopy.deleteApp" as never)}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("strings.Delete OAuth App" as never)}</DialogTitle>
					<DialogDescription>
						{t("strings.This will permanently delete" as never)} <strong>{appName}</strong> {t("strings.and revoke all user authorizations." as never)}
					</DialogDescription>
				</DialogHeader>

				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						<strong>{t("strings.Warning:" as never)}</strong> {t("strings.This action cannot be undone. All users who authorized this app will lose access immediately." as never)}
					</AlertDescription>
				</Alert>

				<div className="space-y-2">
					<Label htmlFor="confirmation">
						{t("strings.Type" as never)} <strong>{appName}</strong> {t("strings.to confirm" as never)}
					</Label>
					<Input
						id="confirmation"
						value={confirmation}
						onChange={(e) => {
							setConfirmation(e.target.value);
							setError(null);
						}}
						placeholder={appName}
					/>
				</div>

				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={handleClose}>
						{t("strings.Cancel" as never)}
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={loading || confirmation !== appName}
					>
						{loading ? t("strings.Deleting..." as never) : t("oauthCardCopy.deleteApp" as never)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
