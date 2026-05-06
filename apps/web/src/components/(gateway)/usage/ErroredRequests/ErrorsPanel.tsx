"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
	investigateGeneration,
	type InvestigateGenerationResult,
	type ProviderMetadataEntry,
	type RequestRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import type { ModelMetadataMap } from "../model-display";
import ErrorsTable, { type ErrorRow } from "./ErrorsTable";
import ErrorRequestDialog, { type ErrorDialogRow } from "./ErrorRequestDialog";

const RequestDetailDialog = dynamic(() => import("../RequestDetailDialog"));

export default function ErrorsPanel(props: {
	totalErrors: number;
	totalRequests?: number;
	topCodes: Array<{ code: string; count: number }>;
	recent: ErrorRow[];
}) {
	const [fallbackOpen, setFallbackOpen] = React.useState(false);
	const [selected, setSelected] = React.useState<null | ErrorRow>(null);
	const [detailOpen, setDetailOpen] = React.useState(false);
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
	const lookupCacheRef = React.useRef(
		new Map<string, InvestigateGenerationResult>(),
	);

	async function openRow(r: ErrorRow) {
		setSelected(r);
		const requestId =
			typeof r.request_id === "string" ? r.request_id.trim() : "";
		if (!requestId) {
			setFallbackOpen(true);
			return;
		}

		try {
			const cached = lookupCacheRef.current.get(requestId);
			if (cached) {
				setRequest(cached.request);
				setAppName(cached.appName ?? null);
				setModelMetadata(new Map(cached.modelMetadata ?? []));
				setProviderNames(new Map(cached.providerNames ?? []));
				setProviderMetadata(new Map(cached.providerMetadata ?? []));
				setDetailOpen(true);
				return;
			}

			const response = await investigateGeneration(requestId);
			if (!response.success || !response.data) {
				setFallbackOpen(true);
				if (response.error) {
					toast.error(response.error);
				}
				return;
			}

			const result = response.data as InvestigateGenerationResult;
			lookupCacheRef.current.set(requestId, result);
			setRequest(result.request);
			setAppName(result.appName ?? null);
			setModelMetadata(new Map(result.modelMetadata ?? []));
			setProviderNames(new Map(result.providerNames ?? []));
			setProviderMetadata(new Map(result.providerMetadata ?? []));
			setDetailOpen(true);
		} catch (error) {
			console.error("Error loading errored request detail:", error);
			setFallbackOpen(true);
			toast.error("Failed to load request details");
		}
	}

	// Precompute badge text so the JSX stays clean
	const totalReq = Number(props.totalRequests ?? 0);
	const errs = Number(props.totalErrors ?? 0);
	let badgeText = `${errs} total`;
	if (totalReq > 0) {
		const pct = (errs / totalReq) * 100;
		badgeText = `${pct.toFixed(2)}% errored`;
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>Errors</CardTitle>
					<Badge variant="destructive">{badgeText}</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<ErrorsTable rows={props.recent} onSelect={openRow} />
				<RequestDetailDialog
					open={detailOpen}
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
				<ErrorRequestDialog
					row={selected as ErrorDialogRow | null}
					open={fallbackOpen}
					onOpenChange={setFallbackOpen}
				/>
			</CardContent>
		</Card>
	);
}
