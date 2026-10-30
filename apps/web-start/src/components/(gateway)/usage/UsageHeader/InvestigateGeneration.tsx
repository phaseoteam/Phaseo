"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { investigateGeneration } from "@/app/(dashboard)/gateway/usage/server-actions";
import RequestDetailDialog from "../RequestDetailDialog";
import type {
	InvestigateGenerationResult,
	ProviderMetadataEntry,
	RequestRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import type { ModelMetadataMap } from "../model-display";

export default function InvestigateGeneration() {
	const t = useTranslations("SettingsUI");
	const [open, setOpen] = React.useState(false);
	const [id, setId] = React.useState("");
	const [loading, setLoading] = React.useState(false);
	const [request, setRequest] = React.useState<RequestRow | null>(null);
	const [appName, setAppName] = React.useState<string | null>(null);
	const [modelMetadata, setModelMetadata] = React.useState<ModelMetadataMap>(
		new Map(),
	);
	const [providerNames, setProviderNames] = React.useState<Map<string, string>>(
		new Map(),
	);
	const [providerMetadata, setProviderMetadata] = React.useState<
		Map<string, ProviderMetadataEntry>
	>(new Map());
	const [detailOpen, setDetailOpen] = React.useState(false);
	const lookupCacheRef = React.useRef(
		new Map<string, InvestigateGenerationResult>(),
	);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmedId = id.trim();
		if (!trimmedId) {
			toast.error(t("strings.Please enter a request ID" as never));
			return;
		}

		try {
			const cached = lookupCacheRef.current.get(trimmedId);
			if (cached) {
				setRequest(cached.request);
				setAppName(cached.appName ?? null);
				setModelMetadata(new Map(cached.modelMetadata ?? []));
				setProviderNames(new Map(cached.providerNames ?? []));
				setProviderMetadata(new Map(cached.providerMetadata ?? []));
				setOpen(false);
				setDetailOpen(true);
				return;
			}

			setLoading(true);
			setRequest(null);
			setAppName(null);
			setModelMetadata(new Map());
			setProviderNames(new Map());
			setProviderMetadata(new Map());

			const response = await investigateGeneration(trimmedId);

			if (!response.success) {
				toast.error(response.error || t("strings.Failed to fetch request" as never));
				return;
			}

			const result = response.data as InvestigateGenerationResult;
			lookupCacheRef.current.set(trimmedId, result);
			setRequest(result.request as RequestRow);
			setAppName(result.appName ?? null);
			setModelMetadata(new Map(result.modelMetadata ?? []));
			setProviderNames(new Map(result.providerNames ?? []));
			setProviderMetadata(new Map(result.providerMetadata ?? []));
			setOpen(false);
			setDetailOpen(true);
		} catch (error) {
			console.error("Investigation error:", error);
			toast.error(t("strings.Failed to load generation" as never));
		} finally {
			setLoading(false);
		}
	}

	return (
		<>
			<Button
				type="button"
				variant="outline"
				className="h-9 gap-2 rounded-md px-3 text-xs font-medium"
				onClick={() => setOpen(true)}
			>
				<Search className="size-3.5" />
				{t("strings.Investigate" as never)}
			</Button>

			<ProviderInspectorSheet open={open} onOpenChange={setOpen}>
				<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[44vw] lg:!w-[40vw] xl:!w-[36vw] 2xl:!w-[32vw] data-[side=right]:sm:max-w-none">
					<ProviderInspectorSheetHeader className="border-b border-border/70 px-5 py-4 pr-14 sm:px-6 sm:py-5">
						<ProviderInspectorSheetTitle>{t("strings.Investigate generation" as never)}</ProviderInspectorSheetTitle>
						<ProviderInspectorSheetDescription>
							{t("strings.phraseEnterARequestIDToInspectItsGenerationDetails" as never)}
						</ProviderInspectorSheetDescription>
					</ProviderInspectorSheetHeader>
					<form onSubmit={onSubmit} className="space-y-4 p-5 sm:p-6">
						<div className="flex gap-2">
							<Input
								placeholder={t("strings.Request ID" as never)}
								value={id}
								onChange={(e) => setId(e.target.value)}
								className="rounded-md"
								autoFocus
							/>
							<Button type="submit" className="rounded-md" disabled={loading}>
								{loading ? t("strings.phraseLoading" as never) : t("strings.Lookup" as never)}
							</Button>
						</div>
					</form>
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>

			<RequestDetailDialog
				open={detailOpen}
				presentation="sheet"
				onOpenChange={setDetailOpen}
				request={request}
				appName={appName}
				modelMetadata={modelMetadata}
				providerNames={providerNames}
				providerMetadata={providerMetadata}
				providerName={
					request?.provider
						? providerNames.get(request.provider) || request.provider
						: null
				}
			/>
		</>
	);
}
