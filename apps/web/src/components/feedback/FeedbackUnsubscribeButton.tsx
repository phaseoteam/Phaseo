"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FeedbackMessages } from "@/i18n/feedback";
import { feedbackApiPath } from "@/lib/feedbackRequests";

// A button rather than a GET link, so mail scanners that prefetch links cannot unsubscribe people.
export function FeedbackUnsubscribeButton({
	token,
	optedOut,
	messages,
}: {
	token: string;
	optedOut: boolean;
	messages: FeedbackMessages["unsubscribe"];
}) {
	const [state, setState] = useState<"idle" | "working" | "done" | "error">(optedOut ? "done" : "idle");

	if (state === "done") {
		return <p className="font-medium" role="status">{messages.done}</p>;
	}

	async function unsubscribe() {
		setState("working");
		try {
			const response = await fetch(feedbackApiPath(token, "unsubscribe"), { method: "POST", credentials: "omit" });
			setState(response.ok ? "done" : "error");
		} catch {
			setState("error");
		}
	}

	return (
		<div className="space-y-3">
			<Button type="button" onClick={() => void unsubscribe()} disabled={state === "working"}>
				{state === "working" ? messages.working : messages.button}
			</Button>
			{state === "error" ? <p className="text-sm text-destructive" role="alert">{messages.error}</p> : null}
		</div>
	);
}
