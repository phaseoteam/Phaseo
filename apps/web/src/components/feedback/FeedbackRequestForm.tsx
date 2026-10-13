"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { FeedbackMessages } from "@/i18n/feedback";
import {
	buildFeedbackAnswers,
	FEEDBACK_REASONS,
	feedbackApiPath,
	type FeedbackReason,
	type FeedbackSegment,
	type FeedbackSubmitResult,
} from "@/lib/feedbackRequests";
import { cn } from "@/lib/utils";

type Props = {
	token: string;
	segment: FeedbackSegment;
	responded: boolean;
	rewardCode: string | null;
	messages: FeedbackMessages;
};

const NPS_SCORES = Array.from({ length: 11 }, (_, score) => score);

function ChoiceButton({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			onClick={onSelect}
			className={cn(
				"rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground/40",
			)}
		>
			{children}
		</button>
	);
}

function RewardCode({ code, messages }: { code: string; messages: FeedbackMessages }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">{messages.rewardIssued}</p>
			<div className="flex flex-wrap items-center gap-2">
				<code className="rounded-md border bg-muted px-3 py-2 font-mono text-sm">{code}</code>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => {
						void navigator.clipboard.writeText(code).then(() => setCopied(true), () => undefined);
					}}
				>
					{copied ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
					{copied ? messages.copied : messages.copy}
				</Button>
				<Button asChild size="sm">
					<Link href={`/redeem?code=${encodeURIComponent(code)}`}>{messages.redeem}</Link>
				</Button>
			</div>
		</div>
	);
}

export function FeedbackRequestForm({ token, segment, responded, rewardCode, messages }: Props) {
	const [reason, setReason] = useState<FeedbackReason | null>(null);
	const [details, setDetails] = useState("");
	const [nps, setNps] = useState<number | null>(null);
	const [likes, setLikes] = useState("");
	const [improve, setImprove] = useState("");
	const [status, setStatus] = useState<"idle" | "submitting" | "error" | "missing">("idle");
	const [result, setResult] = useState<FeedbackSubmitResult | null>(
		responded ? { status: "already_submitted", rewardStatus: null, rewardCode } : null,
	);

	if (result) {
		const code = result.rewardCode;
		return (
			<div className="space-y-4" role="status">
				<h2 className="text-xl font-semibold">
					{result.status === "already_submitted" ? messages.alreadyAnswered : messages.thanksTitle}
				</h2>
				{result.status === "submitted" ? <p className="text-sm text-muted-foreground">{messages.thanksBody}</p> : null}
				{code ? <RewardCode code={code} messages={messages} /> : null}
				{result.rewardStatus === "budget_exhausted" ? (
					<p className="text-sm text-muted-foreground">{messages.rewardExhausted}</p>
				) : null}
			</div>
		);
	}

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const answers = buildFeedbackAnswers(segment, { reason, details, nps, likes, improve });
		if (!answers) {
			setStatus("missing");
			return;
		}
		setStatus("submitting");
		try {
			const response = await fetch(feedbackApiPath(token), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ answers }),
				credentials: "omit",
			});
			if (!response.ok) throw new Error(`feedback_submit_${response.status}`);
			setResult((await response.json()) as FeedbackSubmitResult);
		} catch {
			setStatus("error");
		}
	}

	return (
		<form className="space-y-6" onSubmit={submit} noValidate>
			{segment === "paid" ? (
				<>
					<fieldset className="space-y-3">
						<legend className="text-sm font-medium">{messages.npsLabel}</legend>
						<div role="radiogroup" aria-label={messages.npsLabel} className="grid grid-cols-6 gap-2 sm:grid-cols-11">
							{NPS_SCORES.map((score) => (
								<ChoiceButton key={score} selected={nps === score} onSelect={() => setNps(score)}>
									<span className="block text-center tabular-nums">{score}</span>
								</ChoiceButton>
							))}
						</div>
						<div className="flex justify-between text-xs text-muted-foreground">
							<span>{messages.npsLow}</span>
							<span>{messages.npsHigh}</span>
						</div>
					</fieldset>
					<div className="space-y-2">
						<Label htmlFor="feedback-likes">{messages.likesLabel}</Label>
						<Textarea id="feedback-likes" value={likes} onChange={(event) => setLikes(event.target.value)} maxLength={4000} rows={3} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="feedback-improve">{messages.improveLabel}</Label>
						<Textarea id="feedback-improve" value={improve} onChange={(event) => setImprove(event.target.value)} maxLength={4000} rows={3} />
					</div>
				</>
			) : (
				<>
					<fieldset className="space-y-3">
						<legend className="text-sm font-medium">{messages.reasonLabel}</legend>
						<div role="radiogroup" aria-label={messages.reasonLabel} className="grid gap-2 sm:grid-cols-2">
							{FEEDBACK_REASONS[segment].map((key) => (
								<ChoiceButton key={key} selected={reason === key} onSelect={() => setReason(key)}>
									{messages.reasons[key]}
								</ChoiceButton>
							))}
						</div>
					</fieldset>
					<div className="space-y-2">
						<Label htmlFor="feedback-details">{messages.detailsLabel}</Label>
						<Textarea id="feedback-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={4000} rows={4} />
					</div>
				</>
			)}

			{status === "missing" ? <p className="text-sm text-destructive" role="alert">{messages.required}</p> : null}
			{status === "error" ? <p className="text-sm text-destructive" role="alert">{messages.submitError}</p> : null}

			<Button type="submit" disabled={status === "submitting"}>
				{status === "submitting" ? messages.submitting : messages.submit}
			</Button>
		</form>
	);
}
