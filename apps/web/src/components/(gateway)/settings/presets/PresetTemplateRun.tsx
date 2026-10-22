"use client";

import React, { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sdkCode } from "@/lib/chat/sdkExport";
import { fetchChatWebApi } from "@/lib/web-api/client";

/**
 * A chat completions body that runs the template. `model` and an empty
 * `messages` list are included because the SDK chat methods require them; the
 * gateway fills the messages from the template.
 */
export function templateRunBody(reference: string, variables: Record<string, unknown>) {
	return { model: reference, messages: [], prompt: { id: reference, variables } };
}

export type TemplateRunReply = { text: string; model: string | null; inputTokens: number | null; outputTokens: number | null };

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((part) => (part && typeof part === "object" && typeof part.text === "string" ? part.text : "")).join("");
}

export function readTemplateRunReply(json: any): TemplateRunReply {
	const message = json?.choices?.[0]?.message;
	const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
	const text = textOf(message?.content) || toolCalls.map((call: any) => `${call?.function?.name ?? "tool"}(${call?.function?.arguments ?? ""})`).join("\n");
	const usage = json?.usage ?? {};
	return {
		text,
		model: typeof json?.model === "string" ? json.model : null,
		inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
		outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
	};
}

/** Every problem the gateway listed, or its single error message. */
export function readTemplateRunError(json: any): string | null {
	const details = Array.isArray(json?.details) ? json.details.map((detail: any) => detail?.message).filter((message: unknown) => typeof message === "string" && message) : [];
	if (details.length) return details.join("\n");
	if (typeof json?.error?.message === "string" && json.error.message) return json.error.message;
	if (typeof json?.description === "string" && json.description) return json.description;
	if (typeof json?.error === "string") return json.error;
	return null;
}

const CODE_SAMPLES = [
	["curl", "cURL"],
	["sdk-typescript", "TypeScript"],
	["sdk-python", "Python"],
] as const;

/** The request body and ready-to-run code for the current test values. */
export function PresetTemplateCode({ reference, variables }: { reference: string; variables: Record<string, unknown> }) {
	const t = useTranslations("SettingsUI");
	const sdkRequest = { endpoint: "/chat/completions", body: templateRunBody(reference, variables) };
	const samples: Array<[string, string, string]> = [
		["body", t("presetTemplate.requestTitle"), JSON.stringify({ prompt: { id: reference, variables } }, null, 2)],
		...CODE_SAMPLES.map(([sample, label]): [string, string, string] => [sample, label, sdkCode(sdkRequest, sample)]),
	];
	return (
		<Tabs defaultValue="body" className="gap-2">
			<TabsList variant="line" className="w-full justify-start border-b">
				{samples.map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}
			</TabsList>
			{samples.map(([value, label, code]) => (
				<TabsContent key={value} value={value} className="relative">
					<pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 pr-10 font-mono text-xs">{code}</pre>
					<CopyButton content={code} variant="ghost" size="sm" className="absolute right-2 top-2 rounded-md" aria-label={t("presetTemplate.copyCode", { label })} />
				</TabsContent>
			))}
		</Tabs>
	);
}

type RunState =
	| { status: "idle" }
	| { status: "running" }
	| { status: "done"; reply: TemplateRunReply }
	| { status: "failed"; message: string };

/**
 * Runs the saved preset through the gateway with the test values, billed to the
 * workspace like the chat playground. Unsaved edits are not sent, so running is
 * blocked until they are saved.
 */
export function PresetTemplateRun({
	savedReference,
	hasUnsavedChanges,
	variables,
}: {
	savedReference: string | null;
	hasUnsavedChanges: boolean;
	variables: Record<string, unknown> | null;
}) {
	const t = useTranslations("SettingsUI");
	const [state, setState] = useState<RunState>({ status: "idle" });
	const blocked = !savedReference ? t("presetTemplate.runNeedsSave") : hasUnsavedChanges ? t("presetTemplate.runUnsaved") : null;

	async function run() {
		if (!savedReference || !variables) return;
		setState({ status: "running" });
		try {
			const response = await fetchChatWebApi("/api/chat/chat-completions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ requestBody: templateRunBody(savedReference, variables) }),
			});
			const json = await response.json().catch(() => null);
			if (!response.ok) {
				setState({ status: "failed", message: readTemplateRunError(json) ?? t("presetTemplate.runFailed", { status: response.status }) });
				return;
			}
			setState({ status: "done", reply: readTemplateRunReply(json) });
		} catch {
			setState({ status: "failed", message: t("presetTemplate.runFailed", { status: 0 }) });
		}
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-3">
				<Button type="button" size="sm" className="rounded-md" onClick={run} disabled={Boolean(blocked) || !variables || state.status === "running"}>
					{state.status === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
					{state.status === "running" ? t("presetTemplate.running") : t("presetTemplate.runButton")}
				</Button>
				<p className="text-xs text-muted-foreground">{blocked ?? t("presetTemplate.runHelp", { reference: savedReference ?? "" })}</p>
			</div>
			{state.status === "done" ? (
				<div className="space-y-1 rounded-md border border-border/70 p-3" aria-live="polite">
					<div className="font-mono text-xs text-muted-foreground">
						{t("presetTemplate.replyMeta", {
							model: state.reply.model ?? "",
							input: state.reply.inputTokens ?? 0,
							output: state.reply.outputTokens ?? 0,
						})}
					</div>
					<p className="whitespace-pre-wrap text-sm">{state.reply.text || t("presetTemplate.replyEmpty")}</p>
				</div>
			) : null}
			{state.status === "failed" ? (
				<p className="whitespace-pre-wrap rounded-md border border-destructive/40 p-3 text-sm text-destructive" role="alert">{state.message}</p>
			) : null}
		</div>
	);
}
