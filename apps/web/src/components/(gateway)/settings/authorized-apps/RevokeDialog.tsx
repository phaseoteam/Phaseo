"use client";

import React, { useState } from "react";
import { useSettingsRouter as useRouter } from "../PrivateSettingsQuery";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useTranslations } from "next-intl";

interface RevokeDialogProps {
	authorizationId: string;
	appName: string;
}

export default function RevokeDialog({
	authorizationId,
	appName,
}: RevokeDialogProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const t = useTranslations("SettingsUI");

	const handleRevoke = async () => {
		setLoading(true);
		setError(null);

		try {
			const { revokeAuthorizationAction } = await import(
				"@/app/(dashboard)/settings/authorized-apps/actions"
			);

			const result = await revokeAuthorizationAction(authorizationId);

			if (result.error) {
				setError(localizedSettingsError(result.error, t, "Failed to revoke access"));
				return;
			}

			toast.success((t as unknown as (key: string, values?: Record<string, string>) => string)("strings.Access revoked for app", { appName }));

			setOpen(false);
			router.refresh();
		} catch (err: any) {
			setError(localizedSettingsError(err, t, "Failed to revoke access"));
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setError(null);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) {
					setOpen(true);
					return;
				}
				handleClose();
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="w-full shrink-0 rounded-md sm:w-auto">
					<X className="h-4 w-4 mr-1" />
					{t("strings.Revoke Access" as never)}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("strings.Revoke Access?" as never)}</DialogTitle>
					<DialogDescription>
						{(t as unknown as (key: string, values?: Record<string, string>) => string)("strings.This will immediately prevent {appName} from accessing your Phaseo account. Any active tokens will be invalidated.", { appName })}
					</DialogDescription>
				</DialogHeader>

				<Alert>
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						{t("strings.The application will no longer be able to make API requests on your behalf. You can re-authorize the app later if needed." as never)}
					</AlertDescription>
				</Alert>

				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<Button variant="outline" className="rounded-md" onClick={handleClose}>
						{t("strings.Cancel" as never)}
					</Button>
					<Button
						variant="destructive"
						className="rounded-md"
						onClick={handleRevoke}
						disabled={loading}
					>
						{loading ? t("strings.Revoking..." as never) : t("strings.Revoke Access" as never)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
