"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendInternalModelAnnouncementAction } from "@/app/(dashboard)/internal/model-discovery-notifier/actions";

type ActionResult = { ok: boolean; message: string } | null;

export default function SendModelDiscordNotificationButton({ modelId }: { modelId: string }) {
	const t = useTranslations("Common.ui.finalSharedCopy");
	const shared = useTranslations("SettingsUI.webhookFormCopy");
	const [isPending, startTransition] = useTransition();
	const [result, setResult] = useState<ActionResult>(null);
	const resultCopy = result ? t(result.ok
		? result.message === "Sent the Discord announcement, but could not save its state." ? "announcementStateNotSaved" : "announcementSent"
		: result.message === "Invalid model ID." ? "invalidModelId"
		: result.message === "Model not found in the catalog." ? "modelNotFound"
		: result.message === "Model ID is missing from the catalog record." ? "modelIdMissing" : "announcementFailed") : null;

	function sendNotification() {
		setResult(null);
		startTransition(async () => {
			const response = await sendInternalModelAnnouncementAction(modelId);
			setResult(response);
		});
	}

	return (
		<div className="space-y-2">
			<Button type="button" variant="outline" disabled={isPending} onClick={sendNotification}>
				<Send className="mr-2 size-4" aria-hidden="true" />
				{isPending ? shared("sending") : t("sendDiscordAnnouncement")}
			</Button>
			{result ? (
				<p
					role={result.ok ? "status" : "alert"}
					aria-live="polite"
					className={result.ok ? "text-sm text-green-700" : "text-sm text-destructive"}
				>
					{resultCopy}
				</p>
			) : null}
		</div>
	);
}
