"use client";

import React, { useState } from "react";
import { useSettingsWrite } from "../PrivateSettingsQuery";
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
import { Card } from "@/components/ui/card";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

interface RegenerateSecretDialogProps {
	clientId: string;
	appName: string;
}

export default function RegenerateSecretDialog({
	clientId,
	appName,
}: RegenerateSecretDialogProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const t = useTranslations("SettingsUI");
	const write = useSettingsWrite();

	const handleRegenerate = async () => {
		setLoading(true);
		setError(null);

		try {
			const { regenerateClientSecretAction } = await import(
				"@/app/(dashboard)/settings/oauth-apps/actions"
			);

			const result = await write(regenerateClientSecretAction(clientId));

			if (result.error) {
				setError(localizedSettingsError(result.error, t, "Failed to regenerate secret"));
				return;
			}

			setNewSecret(result.data.client_secret);

			toast.success(t("credits.Client secret regenerated successfully" as never));

		} catch (err: any) {
			setError(localizedSettingsError(err, t, "Failed to regenerate secret"));
		} finally {
			setLoading(false);
		}
	};

	const copySecret = () => {
		if (newSecret) {
			navigator.clipboard.writeText(newSecret);
			setCopied(true);
			toast.success(t("credits.New client secret copied to clipboard" as never));
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const handleClose = () => {
		setOpen(false);
		setNewSecret(null);
		setError(null);
		setCopied(false);
	};

	// If secret was regenerated, show it
	if (newSecret) {
		return (
			<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
				<DialogTrigger asChild>
					<Button variant="outline" size="sm">
						{t("credits.Regenerate" as never)}
					</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("credits.New Client Secret" as never)}</DialogTitle>
						<DialogDescription>
							{t("strings.phraseSaveYourNewSecretNowItWillNotBeShownAgain" as never)}
						</DialogDescription>
					</DialogHeader>

					<Alert>
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>{t("credits.Important:" as never)}</strong> {t("strings.phraseCopyYourNewSecretNowTheOldSecretHasBeenInvalidated" as never)}
						</AlertDescription>
					</Alert>

					<div>
						<label className="text-sm font-medium">{t("credits.New Client Secret" as never)}</label>
						<Card className="p-3 mt-1 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
							<div className="flex items-center justify-between gap-2">
								<code className="text-xs break-all flex-1">{newSecret}</code>
								<Button
									size="sm"
									variant="outline"
									onClick={copySecret}
									className="shrink-0"
								>
									{copied ? (
										<Check className="h-4 w-4" />
									) : (
										<Copy className="h-4 w-4" />
									)}
								</Button>
							</div>
						</Card>
					</div>

					<DialogFooter>
						<Button onClick={handleClose}>{t("labels.done")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
						{t("credits.Regenerate" as never)}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("credits.Regenerate Client Secret?" as never)}</DialogTitle>
					<DialogDescription>
						{t("oauthCopy.invalidatesCurrentSecret", { appName })}
						{t("oauthCopy.oldSecretWarning")}
					</DialogDescription>
				</DialogHeader>

				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						<strong>{t("credits.Warning:" as never)}</strong> {t("strings.phraseThisActionCannotBeUndoneTheOldSecretWillBeImmediatelyInvalidated" as never)}
					</AlertDescription>
				</Alert>

				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{t("labels.cancel")}
					</Button>
					<Button
						variant="destructive"
						onClick={handleRegenerate}
						disabled={loading}
					>
						{loading ? t("strings.phraseRegenerating" as never) : t("credits.Regenerate Secret" as never)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
