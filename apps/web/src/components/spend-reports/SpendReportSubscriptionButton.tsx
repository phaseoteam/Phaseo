import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FeedbackMessages } from "@/i18n/feedback";
import { spendReportApiPath } from "@/lib/spendReports";

type Messages = FeedbackMessages["spendReports"];

// A button rather than a GET link, so mail scanners that prefetch links cannot unsubscribe people.
// The same page subscribes again, so a mistaken click is easy to undo.
export function SpendReportSubscriptionButton({ token, subscribed, messages }: { token: string; subscribed: boolean; messages: Messages }) {
	const [current, setCurrent] = useState(subscribed);
	const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

	async function toggle() {
		const next = !current;
		setState("working");
		try {
			const response = await fetch(spendReportApiPath(token, next ? "subscribe" : "unsubscribe"), { method: "POST", credentials: "omit" });
			if (!response.ok) throw new Error(String(response.status));
			setCurrent(next);
			setState("done");
		} catch {
			setState("error");
		}
	}

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground">{current ? messages.subscribedBody : messages.unsubscribedBody}</p>
			{state === "done" ? <p className="font-medium" role="status">{current ? messages.subscribed : messages.unsubscribed}</p> : null}
			<Button type="button" variant={current ? "default" : "outline"} onClick={() => void toggle()} disabled={state === "working"}>
				{state === "working"
					? (current ? messages.unsubscribing : messages.subscribing)
					: (current ? messages.unsubscribe : messages.subscribe)}
			</Button>
			{state === "error" ? <p className="text-sm text-destructive" role="alert">{messages.error}</p> : null}
		</div>
	);
}
