"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendInternalModelAnnouncementAction } from "@/app/(dashboard)/internal/model-discovery-notifier/actions";

type ActionResult = { ok: boolean; message: string } | null;

export default function SendModelDiscordNotificationButton({ modelId }: { modelId: string }) {
	const [isPending, startTransition] = useTransition();
	const [result, setResult] = useState<ActionResult>(null);

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
				{isPending ? "Sending…" : "Send Discord announcement"}
			</Button>
			{result ? (
				<p
					role={result.ok ? "status" : "alert"}
					aria-live="polite"
					className={result.ok ? "text-sm text-green-700" : "text-sm text-destructive"}
				>
					{result.message}
				</p>
			) : null}
		</div>
	);
}
