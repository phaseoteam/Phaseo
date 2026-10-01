"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import React from "react";
import { useTranslations } from "next-intl";

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
	const t = useTranslations("SettingsUI");

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) router.push(closeHref);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("strings.Request details unavailable" as never)}</DialogTitle>
					<DialogDescription>
						{t("strings.We couldn't load this request. Try again or return to the request logs." as never)}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={onRetry ?? (() => router.refresh())}>
						{t("strings.Try again" as never)}
					</Button>
					<Button asChild>
						<Link href={closeHref}>{t("strings.Back to request logs" as never)}</Link>
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
	const t = useTranslations("SettingsUI");
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
								<Link href={previousHref} prefetch aria-label={t("strings.Open previous request" as never)}>
									<ChevronLeft className="size-4" />
								</Link>
							</Button>
						) : (
							<Button variant="ghost" size="icon-sm" disabled aria-label={t("strings.No previous request" as never)}>
								<ChevronLeft className="size-4" />
							</Button>
						)}
						{nextHref ? (
							<Button asChild variant="ghost" size="icon-sm">
								<Link href={nextHref} prefetch aria-label={t("strings.Open next request" as never)}>
									<ChevronRight className="size-4" />
								</Link>
							</Button>
						) : (
							<Button variant="ghost" size="icon-sm" disabled aria-label={t("strings.No next request" as never)}>
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
