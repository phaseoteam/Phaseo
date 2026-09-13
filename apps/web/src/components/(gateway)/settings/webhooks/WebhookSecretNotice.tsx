"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function WebhookSecretNotice({
	endpointId,
	secret,
}: {
	endpointId: string;
	secret: string;
}) {
	const [copied, setCopied] = useState(false);

	async function copy(value: string, label: string) {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
			toast.success(`${label} copied`);
		} catch {
			toast.error(`Unable to copy ${label.toLowerCase()}`);
		}
	}

	return (
		<Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
			<KeyRound className="h-4 w-4" />
			<AlertTitle>Save this signing secret now</AlertTitle>
			<AlertDescription className="space-y-3 text-amber-900 dark:text-amber-100">
				<p>
					It is shown only once. Use it to verify the <code>x-phaseo-signature</code> header on each delivery.
				</p>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-white/70 px-3 py-2 font-mono text-xs dark:bg-black/20">
						{secret}
					</code>
					<Button type="button" variant="outline" size="sm" onClick={() => copy(secret, "Signing secret")}>
						{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
						{copied ? "Copied" : "Copy secret"}
					</Button>
				</div>
				<div className="rounded-md border border-amber-300/70 bg-white/45 p-3 dark:border-amber-900/60 dark:bg-black/15">
					<p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
						Attach this endpoint to a job
					</p>
					<pre className="overflow-x-auto font-mono text-xs text-amber-950 dark:text-amber-50">{`webhook: {\n  endpoint_id: "${endpointId}"\n}`}</pre>
				</div>
			</AlertDescription>
		</Alert>
	);
}
