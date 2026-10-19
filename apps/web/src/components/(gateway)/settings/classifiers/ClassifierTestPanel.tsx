"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { testClassifier, type ClassifierTestResult } from "@/app/(dashboard)/settings/classifiers/actions";
import { formatUsd } from "./classifierForm";

type Outcome = { kind: "result"; result: ClassifierTestResult } | { kind: "privacy" } | { kind: "error"; message: string | null } | null;

/** Runs the current draft once on a sample prompt, as the signed-in member. */
export function ClassifierTestPanel({ classifierId, buildRequest, includeResponse }: {
	classifierId: string | null;
	/** The draft's model, instructions and dimensions, or null when the draft is invalid. */
	buildRequest: () => { model: unknown; instructions: unknown; dimensions: unknown } | null;
	includeResponse: boolean;
}) {
	const t = useTranslations("SettingsUI.classifiers.test");
	const [prompt, setPrompt] = useState("");
	const [response, setResponse] = useState("");
	const [outcome, setOutcome] = useState<Outcome>(null);
	const [invalid, setInvalid] = useState(false);
	const [pending, startTransition] = useTransition();

	function run() {
		const classifier = buildRequest();
		setInvalid(!classifier);
		if (!classifier || !prompt.trim()) return;
		startTransition(async () => {
			const result = await testClassifier({
				classifierId,
				classifier,
				sample: { prompt, ...(includeResponse && response.trim() ? { response } : {}) },
			});
			if (result.ok) setOutcome({ kind: "result", result: result.result });
			else if (result.code === "chat_privacy_review_required") setOutcome({ kind: "privacy" });
			else setOutcome({ kind: "error", message: result.message });
		});
	}

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">{t("description")}</p>
			<div className="space-y-1.5">
				<Label htmlFor="classifier-test-prompt">{t("prompt")}</Label>
				<Textarea id="classifier-test-prompt" value={prompt} maxLength={8000} rows={4} placeholder={t("promptPlaceholder")} onChange={(event) => setPrompt(event.target.value)} />
			</div>
			{includeResponse ? (
				<div className="space-y-1.5">
					<Label htmlFor="classifier-test-response">{t("response")}</Label>
					<Textarea id="classifier-test-response" value={response} maxLength={8000} rows={3} onChange={(event) => setResponse(event.target.value)} />
				</div>
			) : null}
			<div className="flex flex-wrap items-center gap-3">
				<Button type="button" variant="outline" disabled={pending || !prompt.trim()} onClick={run}>
					{pending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
					{pending ? t("running") : t("run")}
				</Button>
				{invalid ? <p className="text-sm text-destructive">{t("fixFirst")}</p> : null}
			</div>
			<div aria-live="polite">
				{outcome?.kind === "privacy" ? (
					<p className="text-sm">{t("privacyReview")} <Link href="/chat" className="underline underline-offset-4">{t("openChat")}</Link></p>
				) : null}
				{outcome?.kind === "error" ? <p className="text-sm text-destructive">{outcome.message ? t("failedWithMessage", { message: outcome.message }) : t("failed")}</p> : null}
				{outcome?.kind === "result" ? <TestResult result={outcome.result} /> : null}
			</div>
		</div>
	);
}

function TestResult({ result }: { result: ClassifierTestResult }) {
	const t = useTranslations("SettingsUI.classifiers.test");
	return (
		<div className="space-y-2">
			{result.answered && result.labels.length ? (
				<table className="w-full text-sm">
					<thead className="text-left text-xs text-muted-foreground">
						<tr><th className="py-1 pr-4 font-medium">{t("labelKey")}</th><th className="py-1 pr-4 font-medium">{t("labelValue")}</th><th className="py-1 font-medium">{t("confidence")}</th></tr>
					</thead>
					<tbody className="divide-y border-t">
						{result.labels.map((label) => (
							<tr key={`${label.key}:${label.value}`}>
								<td className="py-1.5 pr-4 font-mono">{label.key}</td>
								<td className="py-1.5 pr-4 font-mono">{label.value}</td>
								<td className="py-1.5 tabular-nums">{label.confidence == null ? "–" : `${Math.round(label.confidence * 100)}%`}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : <p className="text-sm text-destructive">{t("noAnswer")}</p>}
			<p className="text-xs text-muted-foreground">{t("costLine", { cost: formatUsd(result.costUsd), model: result.model })}</p>
		</div>
	);
}
