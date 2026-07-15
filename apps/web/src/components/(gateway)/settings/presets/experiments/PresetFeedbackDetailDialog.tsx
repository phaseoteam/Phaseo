"use client";

import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

export type PresetFeedbackDetail = {
	id: string;
	presetName: string;
	presetSlug: string | null;
	rating: string;
	scoreLabel: string;
	scoreRaw: number | null;
	comment: string | null;
	reason: string | null;
	reasonTags: string[];
	requestId: string | null;
	sessionId: string | null;
	endUserId: string | null;
	createdAtLabel: string;
	createdAt: string | null;
	metadataDimensions: Record<string, string>;
};

function DetailRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="grid gap-1 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
			<dt className="text-xs font-medium uppercase text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 text-sm">{children}</dd>
		</div>
	);
}

export function PresetFeedbackDetailDialog({
	feedback,
}: {
	feedback: PresetFeedbackDetail;
}) {
	const metadataEntries = Object.entries(feedback.metadataDimensions);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					<Eye className="h-4 w-4" />
					View
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Feedback detail</DialogTitle>
					<DialogDescription>
						{feedback.presetName} feedback captured {feedback.createdAtLabel}.
					</DialogDescription>
				</DialogHeader>

				<dl className="divide-y divide-border/70">
					<DetailRow label="Feedback">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="outline">{feedback.rating}</Badge>
							{feedback.scoreRaw !== null ? (
								<span className="text-muted-foreground">
									optional score {feedback.scoreLabel}
								</span>
							) : null}
							{feedback.scoreRaw !== null ? (
								<span className="text-muted-foreground">
									raw {feedback.scoreRaw.toFixed(3)}
								</span>
							) : null}
						</div>
					</DetailRow>
					<DetailRow label="Preset">
						<div className="space-y-1">
							<p>{feedback.presetName}</p>
							{feedback.presetSlug ? (
								<p className="font-mono text-xs text-muted-foreground">
									@{feedback.presetSlug}
								</p>
							) : null}
						</div>
					</DetailRow>
					<DetailRow label="Comment">
						<p className="whitespace-pre-wrap">
							{feedback.comment ?? feedback.reason ?? "No comment provided"}
						</p>
					</DetailRow>
					<DetailRow label="Reason tags">
						{feedback.reasonTags.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{feedback.reasonTags.map((tag) => (
									<Badge key={tag} variant="secondary">
										{tag}
									</Badge>
								))}
							</div>
						) : (
							<span className="text-muted-foreground">None</span>
						)}
					</DetailRow>
					<DetailRow label="Request">
						{feedback.requestId ? (
							<code className="break-all text-xs">{feedback.requestId}</code>
						) : (
							<span className="text-muted-foreground">No request id</span>
						)}
					</DetailRow>
					<DetailRow label="Session">
						{feedback.sessionId ? (
							<code className="break-all text-xs">{feedback.sessionId}</code>
						) : (
							<span className="text-muted-foreground">No session id</span>
						)}
					</DetailRow>
					<DetailRow label="End user">
						{feedback.endUserId ? (
							<code className="break-all text-xs">{feedback.endUserId}</code>
						) : (
							<span className="text-muted-foreground">Not supplied</span>
						)}
					</DetailRow>
					<DetailRow label="Metadata">
						{metadataEntries.length > 0 ? (
							<div className="overflow-hidden rounded-md border border-border/70">
								{metadataEntries.map(([key, value]) => (
									<div
										key={key}
										className="grid gap-1 border-b border-border/70 px-3 py-2 last:border-b-0 sm:grid-cols-[180px_1fr]"
									>
										<code className="text-xs text-muted-foreground">{key}</code>
										<span className="break-words text-sm">{value}</span>
									</div>
								))}
							</div>
						) : (
							<span className="text-muted-foreground">No metadata</span>
						)}
					</DetailRow>
					<DetailRow label="Created">
						<div className="space-y-1">
							<p>{feedback.createdAtLabel}</p>
							{feedback.createdAt ? (
								<code className="text-xs text-muted-foreground">
									{feedback.createdAt}
								</code>
							) : null}
						</div>
					</DetailRow>
				</dl>
			</DialogContent>
		</Dialog>
	);
}
