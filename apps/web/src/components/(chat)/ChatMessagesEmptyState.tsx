"use client";

import { MessageSquare } from "lucide-react";

export function ChatMessagesEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center">
			<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
				<MessageSquare className="h-6 w-6 text-foreground" />
			</div>
			<div>
				<p className="text-base font-semibold">
					Start a new conversation
				</p>
				<p className="text-sm text-muted-foreground">
					Pick a model, write your prompt, and run a request through the
					gateway.
				</p>
			</div>
		</div>
	);
}
