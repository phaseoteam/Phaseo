"use client";

import * as React from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const NOTIFICATION_SIGNATURE_DOCS_URL = "https://phaseo.app/docs/v1/guides/workspace-notifications#verify-webhook-signatures";

export type RevealedNotificationSecret = { destinationName: string; secret: string };

/**
 * Shows a custom webhook destination's signing secret once, after it is created or
 * rotated. The secret is never readable again; closing the dialog discards it.
 */
export default function NotificationSigningSecretDialog({ revealed, onClose }: { revealed: RevealedNotificationSecret | null; onClose: () => void }) {
	const t = useTranslations("SettingsUI");
	const [copied, setCopied] = React.useState(false);

	async function copy() {
		if (!revealed) return;
		try {
			await navigator.clipboard.writeText(revealed.secret);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
			toast.success(t("notificationCopy.secretCopied"));
		} catch {
			toast.error(t("notificationCopy.secretCopyFailed"));
		}
	}

	return (
		<Dialog open={revealed !== null} onOpenChange={(open) => { if (!open) { setCopied(false); onClose(); } }}>
			<DialogContent className="rounded-md sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" />{t("notificationCopy.signingSecretTitle", { name: revealed?.destinationName ?? "" })}</DialogTitle>
					<DialogDescription>{t("notificationCopy.signingSecretDescription")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<code className="ph-no-capture min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs" data-testid="notification-signing-secret">{revealed?.secret}</code>
					<Button className="rounded-md" type="button" variant="outline" size="sm" onClick={() => void copy()}>
						{copied ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
						{t("notificationCopy.copySecret")}
					</Button>
				</div>
				<a className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" href={NOTIFICATION_SIGNATURE_DOCS_URL} target="_blank" rel="noreferrer">{t("notificationCopy.verifySignaturesLink")}</a>
				<DialogFooter>
					<Button className="rounded-md" type="button" onClick={() => { setCopied(false); onClose(); }}>{t("notificationCopy.secretSaved")}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
