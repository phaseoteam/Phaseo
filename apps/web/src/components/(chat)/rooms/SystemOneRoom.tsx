"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Braces, ExternalLink, Loader2, Play } from "lucide-react";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { fetchChatWebApi } from "@/lib/web-api/client";
import { APP_HEADERS } from "@/components/(chat)/playground/chat-playground-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RoomErrorNotice } from "@/components/(chat)/rooms/RoomErrorNotice";

const DEFAULT_MODEL_ID = "typesafe/jev";
const DEFAULT_STATE = JSON.stringify(
	{
		account_type: "startup",
		plan: "pro",
		active_users: 42,
		recent_events: ["invited a teammate", "created a project"],
	},
	null,
	2,
);
const DEFAULT_QUESTIONS = JSON.stringify(
	{
		segment: {
			type: "choice",
			instructions: "Which customer segment best matches this account?",
			criteria: {
				startup: "A small or early-stage company.",
				enterprise: "A large organisation with formal procurement.",
				individual: "A single-person or personal account.",
			},
		},
		adoption: {
			type: "score",
			instructions: "How strong is the account's product adoption?",
			criteria: [
				"0 = no meaningful adoption",
				"1 = early exploration",
				"2 = repeated use",
				"3 = strong adoption",
			],
		},
		collaboration: {
			type: "noul",
			instructions: "Does the state show a recent collaboration signal?",
			criteria: {
				true: "The account recently invited a teammate or shared work.",
				false: "There is no recent collaboration signal.",
			},
		},
	},
	null,
	2,
);

function formatErrorBody(body: string, status: number): string {
	try {
		const parsed = JSON.parse(body) as Record<string, unknown>;
		const message = parsed.message ?? parsed.error ?? parsed.detail;
		return typeof message === "string"
			? message
			: `Decisions request failed (${status}).`;
	} catch {
		return body.trim() || `Decisions request failed (${status}).`;
	}
}

export function SystemOneRoom({ models }: { models: GatewaySupportedModel[] }) {
	const searchParams = useSearchParams();
	const roomModels = useMemo(() => filterModelsForRoom(models, "systemone"), [models]);
	const requestedModel = searchParams.get("model")?.trim() || DEFAULT_MODEL_ID;
	const [model, setModel] = useState(requestedModel);
	const [state, setState] = useState(DEFAULT_STATE);
	const [questions, setQuestions] = useState(DEFAULT_QUESTIONS);
	const [result, setResult] = useState<unknown>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const modelOptions = useMemo(() => {
		const ids = new Set(roomModels.map((item) => item.selectorModelId));
		ids.add(model || DEFAULT_MODEL_ID);
		return Array.from(ids);
	}, [model, roomModels]);

	async function submit() {
		setError(null);
		setResult(null);
		let parsedState: unknown;
		let parsedQuestions: unknown;
		try {
			parsedState = JSON.parse(state);
			parsedQuestions = JSON.parse(questions);
		} catch {
			setError("State and questions must both be valid JSON.");
			return;
		}
		if (!parsedQuestions || typeof parsedQuestions !== "object" || Array.isArray(parsedQuestions) || Object.keys(parsedQuestions).length === 0) {
			setError("Questions must be a non-empty JSON object keyed by question id.");
			return;
		}

		setIsSubmitting(true);
		try {
			const response = await fetchChatWebApi("/api/chat/systemone", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requestBody: {
						model: model || DEFAULT_MODEL_ID,
						state: parsedState,
						questions: parsedQuestions,
						meta: true,
					},
					appHeaders: APP_HEADERS,
				}),
			});
			const body = await response.text();
			if (!response.ok) throw new Error(formatErrorBody(body, response.status));
			setResult(body ? JSON.parse(body) : null);
		} catch (submissionError) {
			setError(submissionError instanceof Error ? submissionError.message : "Decisions request failed.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-auto">
			<header className="border-b border-border px-4 py-4 md:px-6">
				<div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4">
					<div>
						<div className="mb-2 flex items-center gap-2">
							<Braces className="h-4 w-4 text-muted-foreground" />
							<Badge variant="outline">Beta</Badge>
						</div>
						<h1 className="text-lg font-semibold tracking-tight">Decisions playground</h1>
						<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
							Send structured state to Jev and ask typed Noul, Choice, or Score questions.
						</p>
					</div>
					<Button asChild variant="ghost" size="sm" className="shrink-0">
						<Link href="https://docs.typesafe.ai/api" target="_blank" rel="noreferrer">
							Docs <ExternalLink className="h-3.5 w-3.5" />
						</Link>
					</Button>
				</div>
			</header>

			<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 md:px-6">
				<div className="rounded-lg border border-amber-300/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
					This preview is wired to TypeSafe's structured API. It will return an availability error until the managed TypeSafe credential and route promotion are complete.
				</div>

				<div className="grid gap-5 lg:grid-cols-2">
					<section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
						<div className="space-y-1">
							<Label htmlFor="systemone-model">Model</Label>
							<select
								id="systemone-model"
								value={model}
								onChange={(event) => setModel(event.target.value)}
								className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
							>
								{modelOptions.map((modelId) => (
									<option key={modelId} value={modelId}>{modelId}</option>
								))}
							</select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="systemone-state">State</Label>
							<Textarea id="systemone-state" value={state} onChange={(event) => setState(event.target.value)} className="min-h-48 font-mono text-xs" spellCheck={false} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="systemone-questions">Questions</Label>
							<Textarea id="systemone-questions" value={questions} onChange={(event) => setQuestions(event.target.value)} className="min-h-72 font-mono text-xs" spellCheck={false} />
						</div>
						<Button onClick={() => void submit()} disabled={isSubmitting} className="w-full">
							{isSubmitting ? <Loader2 className="animate-spin" /> : <Play />}
							{isSubmitting ? "Evaluating…" : "Evaluate with Jev"}
						</Button>
					</section>

					<section className="min-h-96 rounded-xl border border-border bg-muted/20 p-4 md:p-5">
						<div className="mb-3 flex items-center justify-between gap-3">
							<div>
								<h2 className="font-medium">Answers</h2>
								<p className="text-xs text-muted-foreground">Typed decisions returned by Jev.</p>
							</div>
							<Badge variant="secondary">JSON</Badge>
						</div>
						{error ? <RoomErrorNotice error={error} className="mb-3" /> : null}
						<pre className="min-h-80 overflow-auto rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
							{result === null ? "Run an evaluation to see Jev’s typed answers." : JSON.stringify(result, null, 2)}
						</pre>
					</section>
				</div>
			</main>
		</div>
	);
}
