"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { testInternalModelDiscoveryNotifierAction } from "./actions";

type ActionResult = {
	ok: boolean;
	message: string;
	payloadPreview: string;
	modelCount: number;
} | null;

const SAMPLE_MODELS = [
	"anthropic/claude-mythos-preview",
	"voyage/voyage-4",
	"Voyage Code 3 | https://phaseo.app/models/voyage/voyage-code-3",
].join("\n");

export default function NotifierClient() {
	const [isPending, startTransition] = useTransition();
	const [modelsText, setModelsText] = useState(SAMPLE_MODELS);
	const [roleId, setRoleId] = useState("");
	const [userId, setUserId] = useState("");
	const [webhookUrl, setWebhookUrl] = useState("");
	const [result, setResult] = useState<ActionResult>(null);

	function run(send: boolean) {
		setResult(null);
		startTransition(async () => {
			const response = await testInternalModelDiscoveryNotifierAction({
				modelsText,
				roleId,
				userId,
				webhookUrl,
				send,
			});
			setResult(response);
		});
	}

	return (
		<div className="container mx-auto space-y-6 py-8">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Model Discovery Notifier Test</h1>
					<p className="text-sm text-muted-foreground">
						Preview and send Discord embed payloads used by internal model-discovery alerts.
					</p>
				</div>
				<div className="flex gap-2">
					<Link href="/internal" className="rounded-md border px-3 py-2 text-sm">
						Back to Internal
					</Link>
				</div>
			</div>

			{result ? (
				<p
					className={
						result.ok
							? "rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700"
							: "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
					}
				>
					{result.message}
				</p>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Payload Input</CardTitle>
					<CardDescription>
						One model per line. Supported formats: <code>provider/slug</code>, full model URL, or <code>Name | URL</code>.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<div className="text-sm font-medium">Models</div>
						<Textarea
							value={modelsText}
							onChange={(event) => setModelsText(event.target.value)}
							rows={10}
							placeholder={SAMPLE_MODELS}
						/>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-2">
							<div className="text-sm font-medium">Discord Role ID (optional)</div>
							<Input
								value={roleId}
								onChange={(event) => setRoleId(event.target.value)}
								placeholder="123456789012345678"
							/>
						</div>
						<div className="space-y-2">
							<div className="text-sm font-medium">Discord User ID (optional)</div>
							<Input
								value={userId}
								onChange={(event) => setUserId(event.target.value)}
								placeholder="123456789012345678"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<div className="text-sm font-medium">Webhook URL Override (optional)</div>
						<Input
							value={webhookUrl}
							onChange={(event) => setWebhookUrl(event.target.value)}
							placeholder="https://discord.com/api/webhooks/..."
						/>
							<p className="text-xs text-muted-foreground">
								If empty, the action uses <code>DISCORD_WEBHOOK_NEW_MODELS_PUBLIC</code>.
							</p>
						</div>
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="outline" disabled={isPending} onClick={() => run(false)}>
							Preview Payload
						</Button>
						<Button type="button" disabled={isPending} onClick={() => run(true)}>
							Send Test Embed
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Payload Preview</CardTitle>
					<CardDescription>
						Generated JSON body for Discord webhook requests.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/20 p-3 text-xs leading-5">
						{result?.payloadPreview || "// Click \"Preview Payload\" to render the webhook JSON."}
					</pre>
				</CardContent>
			</Card>
		</div>
	);
}
