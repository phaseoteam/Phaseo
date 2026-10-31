"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, MessagesSquare, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { confirmSlackLink, type SlackLinkResult } from "./actions";

export type SlackLinkCopy = {
	title: string;
	description: string;
	warning: string;
	confirm: string;
	confirming: string;
	missingToken: string;
	missingTokenTitle: string;
	close: string;
};

/**
 * Linking waits for a click: a link that linked on load would let anyone in the
 * Slack team tie their Slack identity to whoever opened it.
 */
export default function SlackLinkConfirm({ token, locale, copy }: { token: string; locale: string; copy: SlackLinkCopy }) {
	const [result, setResult] = useState<SlackLinkResult | null>(null);
	const [pending, startTransition] = useTransition();

	if (!token) return <Outcome ok={false} title={copy.missingTokenTitle} message={copy.missingToken} />;
	if (result) return <Outcome ok={result.ok} title={result.title} message={result.message} detail={result.ok ? copy.close : undefined} />;

	return (
		<div className="space-y-5 rounded-md border p-6">
			<div className="flex items-center gap-3">
				<MessagesSquare className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
				<h1 className="text-xl font-semibold">{copy.title}</h1>
			</div>
			<p className="text-sm text-muted-foreground">{copy.description}</p>
			<Callout tone="warning">{copy.warning}</Callout>
			<Button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await confirmSlackLink({ data: { token, localeValue: locale } })))}>
				{pending ? copy.confirming : copy.confirm}
			</Button>
		</div>
	);
}

function Outcome({ ok, title, message, detail }: { ok: boolean; title: string; message: string; detail?: string }) {
	const Icon = ok ? CheckCircle2 : XCircle;
	return (
		<div role={ok ? "status" : "alert"} className="space-y-3 rounded-md border p-6">
			<div className="flex items-center gap-3">
				<Icon className={ok ? "size-6 shrink-0 text-emerald-600 dark:text-emerald-400" : "size-6 shrink-0 text-destructive"} aria-hidden="true" />
				<h1 className="text-xl font-semibold">{title}</h1>
			</div>
			<p className="text-sm">{message}</p>
			{detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
		</div>
	);
}
