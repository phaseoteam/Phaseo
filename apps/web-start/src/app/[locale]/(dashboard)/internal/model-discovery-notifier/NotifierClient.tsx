"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { testInternalModelDiscoveryNotifierAction } from "./actions";

type ActionResult = {
	ok: boolean;
	messageKey: "modelsRequired" | "previewGenerated" | "missingWebhook" | "sent" | "sentStateWarning" | "testFailed";
	payloadPreview: string;
	modelCount: number;
} | null;

const SAMPLE_MODELS = [
	"anthropic/claude-mythos-preview",
	"voyage/voyage-4",
	"Voyage Code 3 | https://phaseo.app/models/voyage/voyage-code-3",
].join("\n");

export default function NotifierClient() {
	const t = useTranslations("Product.internalTools.notifier");
	const tTools = useTranslations("Product.internalTools");
	const tResult = useTranslations("Product.internalTools.notifier.result");
	const [isPending, startTransition] = useTransition();
	const [modelsText, setModelsText] = useState(SAMPLE_MODELS);
	const [roleId, setRoleId] = useState("");
	const [userId, setUserId] = useState("");
	const [webhookUrl, setWebhookUrl] = useState("");
	const [includeDefaultRoleMention, setIncludeDefaultRoleMention] = useState(true);
	const [result, setResult] = useState<ActionResult>(null);
	const resultMessage = result
		? result.messageKey === "previewGenerated" || result.messageKey === "sent" || result.messageKey === "sentStateWarning"
			? tResult(result.messageKey, { count: result.modelCount })
			: tResult(result.messageKey)
		: "";

	function run(send: boolean) {
		setResult(null);
		startTransition(async () => {
			const response = await testInternalModelDiscoveryNotifierAction({
				modelsText,
				roleId,
				userId,
				webhookUrl,
				includeDefaultRoleMention,
				send,
			});
			setResult(response);
		});
	}

	return (
		<div className="container mx-auto space-y-6 py-8">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{t("testTitle")}</h1>
					<p className="text-sm text-muted-foreground">
						{tTools("modelDiscoveryNotifierDescription")}
					</p>
				</div>
				<div className="flex gap-2">
					<Link href="/internal" className="rounded-md border px-3 py-2 text-sm">
						{t("backToInternal")}
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
					{resultMessage}
				</p>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>{t("payloadInput")}</CardTitle>
					<CardDescription>
						{t("payloadInputDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<div className="text-sm font-medium">{t("models")}</div>
						<Textarea
							value={modelsText}
							onChange={(event) => setModelsText(event.target.value)}
							rows={10}
							placeholder={SAMPLE_MODELS}
						/>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-2">
							<div className="text-sm font-medium">{t("discordRoleIdOptional")}</div>
							<Input
								value={roleId}
								onChange={(event) => setRoleId(event.target.value)}
								placeholder="123456789012345678"
							/>
						</div>
						<div className="space-y-2">
							<div className="text-sm font-medium">{t("discordUserIdOptional")}</div>
							<Input
								value={userId}
								onChange={(event) => setUserId(event.target.value)}
								placeholder="123456789012345678"
							/>
						</div>
					</div>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={includeDefaultRoleMention}
							onChange={(event) => setIncludeDefaultRoleMention(event.target.checked)}
						/>
						<span>{t("pingModelUpdates")}</span>
					</label>
					<div className="space-y-2">
						<div className="text-sm font-medium">{t("webhookOverrideOptional")}</div>
						<Input
							value={webhookUrl}
							onChange={(event) => setWebhookUrl(event.target.value)}
							placeholder="https://discord.com/api/webhooks/..."
						/>
							<p className="text-xs text-muted-foreground">
								{t("webhookEnvironmentHelp")}
							</p>
						</div>
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="outline" disabled={isPending} onClick={() => run(false)}>
							{t("previewPayload")}
						</Button>
						<Button type="button" disabled={isPending} onClick={() => run(true)}>
							{t("sendTestEmbed")}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("payloadPreview")}</CardTitle>
					<CardDescription>
						{t("payloadPreviewDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/20 p-3 text-xs leading-5">
						{result?.payloadPreview || t("emptyPayloadPreview")}
					</pre>
				</CardContent>
			</Card>
		</div>
	);
}
