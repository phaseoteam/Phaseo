"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { InvestigateGenerationResult } from "@/app/(dashboard)/gateway/usage/server-actions";
import RequestDetailDialog from "./RequestDetailDialog";

export function RouteRequestDetailErrorDialog({
	closeHref,
	onRetry,
}: {
	closeHref: string;
	onRetry?: () => void;
}) {
	const router = useRouter();

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) router.push(closeHref);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Request details unavailable</DialogTitle>
					<DialogDescription>
						We couldn&apos;t load this request. Try again or return to the
						request logs.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={onRetry ?? (() => router.refresh())}>
						Try again
					</Button>
					<Button asChild>
						<Link href={closeHref}>Back to request logs</Link>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function RouteRequestDetailDialog({
	detail,
	closeHref,
	previousHref,
	nextHref,
	position,
	total,
}: {
	detail: InvestigateGenerationResult;
	closeHref: string;
	previousHref?: string | null;
	nextHref?: string | null;
	position?: number | null;
	total?: number | null;
}) {
	const router = useRouter();
	const modelMetadata = React.useMemo(
		() => new Map(detail.modelMetadata ?? []),
		[detail.modelMetadata],
	);
	const providerNames = React.useMemo(
		() => new Map(detail.providerNames ?? []),
		[detail.providerNames],
	);
	const providerMetadata = React.useMemo(
		() => new Map(detail.providerMetadata ?? []),
		[detail.providerMetadata],
	);
	const providerName = detail.request.provider
		? providerNames.get(detail.request.provider) || detail.request.provider
		: null;

	return (
		<RequestDetailDialog
			open
			presentation="sheet"
			disablePointerDismissal
			onOpenChange={(open) => {
				if (!open) router.push(closeHref);
			}}
			request={detail.request}
			appName={detail.appName}
			modelMetadata={modelMetadata}
			providerNames={providerNames}
			providerMetadata={providerMetadata}
			providerName={providerName}
			ioLog={detail.ioLog}
			headerNavigation={
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1">
						{previousHref ? (
							<Button asChild variant="ghost" size="icon-sm">
								<Link href={previousHref} prefetch aria-label="Open previous request">
									<ChevronLeft className="size-4" />
								</Link>
							</Button>
						) : (
							<Button variant="ghost" size="icon-sm" disabled aria-label="No previous request">
								<ChevronLeft className="size-4" />
							</Button>
						)}
						{nextHref ? (
							<Button asChild variant="ghost" size="icon-sm">
								<Link href={nextHref} prefetch aria-label="Open next request">
									<ChevronRight className="size-4" />
								</Link>
							</Button>
						) : (
							<Button variant="ghost" size="icon-sm" disabled aria-label="No next request">
								<ChevronRight className="size-4" />
							</Button>
						)}
					</div>
					{position && total ? (
						<span className="min-w-8 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
							{position} / {total}
						</span>
					) : null}
				</div>
			}
		/>
	);
}
