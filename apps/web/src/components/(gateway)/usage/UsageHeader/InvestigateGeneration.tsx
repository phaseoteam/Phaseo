"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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

interface InvestigateGenerationProps {
	iconOnly?: boolean;
}

export default function InvestigateGeneration({
	iconOnly = false,
}: InvestigateGenerationProps) {
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
			toast.error("Please enter a request ID");
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
				toast.error(response.error || "Failed to fetch request");
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
			toast.error("Failed to load generation");
		} finally {
			setLoading(false);
		}
	}

	return (
		<>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button
						variant="outline"
						size={iconOnly ? "icon" : "default"}
						aria-label="Investigate generation"
						title="Investigate generation"
					>
						<Search className={iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} />
						{iconOnly ? null : "Investigate Generation"}
					</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Investigate Generation</DialogTitle>
					</DialogHeader>
					<form onSubmit={onSubmit} className="space-y-3">
						<div className="flex gap-2">
							<Input
								placeholder="Enter request_id"
								value={id}
								onChange={(e) => setId(e.target.value)}
							/>
							<Button type="submit" disabled={loading}>
								{loading ? "Loading..." : "Lookup"}
							</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>

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
		</>
	);
}
