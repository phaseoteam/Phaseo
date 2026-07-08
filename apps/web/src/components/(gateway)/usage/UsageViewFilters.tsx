"use client";

import * as React from "react";
import { useQueryState } from "nuqs";
import { Check, ListFilter, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortenIdentifier } from "@/lib/gateway/usage/timeFormatting";
import type {
	AppMetadata,
	ProviderMetadataEntry,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";
import type { UsageLogsViewKey } from "@/lib/gateway/usage/timeRange";

type FilterOption = {
	value: string;
	label: string;
	logoId?: string | null;
};

function FilterChip({
	label,
	value,
	onClear,
}: {
	label: string;
	value: React.ReactNode;
	onClear: () => void;
}) {
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={onClear}
			className="h-9 gap-2 rounded-md px-3 text-xs"
		>
			<span className="text-muted-foreground">{label}</span>
			<span className="max-w-[180px] truncate text-foreground">{value}</span>
			<X className="h-3 w-3" />
		</Button>
	);
}

function FilterOptionRow({
	option,
	active,
	onSelect,
}: {
	option: FilterOption;
	active: boolean;
	onSelect: () => void;
}) {
	return (
		<DropdownMenuItem onClick={onSelect} className="gap-2">
			{option.logoId ? (
				<Logo
					id={option.logoId}
					width={14}
					height={14}
					className="rounded-sm"
				/>
			) : null}
			<span className="min-w-0 flex-1 truncate">{option.label}</span>
			{active ? <Check className="h-3.5 w-3.5" /> : null}
		</DropdownMenuItem>
	);
}

function FilterSubmenu({
	label,
	options,
	activeValue,
	allLabel,
	onSelect,
}: {
	label: string;
	options: FilterOption[];
	activeValue: string;
	allLabel: string;
	onSelect: (value: string) => void;
}) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-[280px]">
				<DropdownMenuLabel>{label}</DropdownMenuLabel>
				<DropdownMenuItem onClick={() => onSelect("")} className="gap-2">
					<span className="flex-1">{allLabel}</span>
					{!activeValue ? <Check className="h-3.5 w-3.5" /> : null}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{options.map((option) => (
					<FilterOptionRow
						key={option.value}
						option={option}
						active={activeValue === option.value}
						onSelect={() => onSelect(option.value)}
					/>
				))}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export default function UsageViewFilters({
	view,
	models = [],
	providers = [],
	logAppIds = [],
	logEndpoints = [],
	logFinishReasons = [],
	logErrorCodes = [],
	logStatusCodes = [],
	modelProviders = new Map(),
	providerNames = new Map(),
	apiKeys = [],
	modelMetadata = new Map(),
	providerMetadata = new Map<string, ProviderMetadataEntry>(),
	appMetadata = new Map<string, AppMetadata>(),
	sessionAppIds = [],
	sessionModelIds = [],
	sessionProviderIds = [],
}: {
	view: UsageLogsViewKey;
	models?: string[];
	providers?: string[];
	logAppIds?: string[];
	logEndpoints?: string[];
	logFinishReasons?: string[];
	logErrorCodes?: string[];
	logStatusCodes?: number[];
	modelProviders?: Map<string, string[]>;
	providerNames?: Map<string, string>;
	apiKeys?: { id: string; name: string | null; prefix: string | null }[];
	modelMetadata?: ModelMetadataMap;
	providerMetadata?: Map<string, ProviderMetadataEntry>;
	appMetadata?: Map<string, AppMetadata>;
	sessionAppIds?: string[];
	sessionModelIds?: string[];
	sessionProviderIds?: string[];
}) {
	const [modelFilter, setModelFilter] = useQueryState("model", { defaultValue: "" });
	const [providerFilter, setProviderFilter] = useQueryState("provider", { defaultValue: "" });
	const [appFilter, setAppFilter] = useQueryState("app", { defaultValue: "" });
	const [endpointFilter, setEndpointFilter] = useQueryState("endpoint", { defaultValue: "" });
	const [finishReasonFilter, setFinishReasonFilter] = useQueryState("finish_reason", { defaultValue: "" });
	const [streamFilter, setStreamFilter] = useQueryState("stream", { defaultValue: "all" });
	const [errorCodeFilter, setErrorCodeFilter] = useQueryState("error_code", { defaultValue: "" });
	const [statusCodeFilter, setStatusCodeFilter] = useQueryState("http_status", { defaultValue: "" });
	const [keyFilter, setKeyFilter] = useQueryState("key", { defaultValue: "" });
	const [statusFilter, setStatusFilter] = useQueryState("status", { defaultValue: "all" });
	const [requestFilter, setRequestFilter] = useQueryState("req", { defaultValue: "" });
	const [sessionFilter, setSessionFilter] = useQueryState("session", { defaultValue: "" });

	const [jobKindFilter, setJobKindFilter] = useQueryState("job_kind", { defaultValue: "" });
	const [jobStatusFilter, setJobStatusFilter] = useQueryState("job_status", { defaultValue: "" });
	const [jobProviderFilter, setJobProviderFilter] = useQueryState("job_provider", { defaultValue: "" });

	const [sessionAppFilter, setSessionAppFilter] = useQueryState("session_app", { defaultValue: "" });
	const [sessionModelFilter, setSessionModelFilter] = useQueryState("session_model", { defaultValue: "" });
	const [sessionProviderFilter, setSessionProviderFilter] = useQueryState("session_provider", { defaultValue: "" });

	const modelOptions = React.useMemo(() => {
		return models
			.map((modelId) => ({
				value: modelId,
				label: getModelDisplayName(modelId, modelMetadata),
				logoId: modelMetadata.get(modelId)?.organisationId ?? null,
			}))
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
	}, [modelMetadata, models]);

	const providerOptions = React.useMemo(() => {
		return providers
			.map((providerId) => ({
				value: providerId,
				label:
					providerNames.get(providerId) ??
					providerMetadata.get(providerId)?.name ??
					providerId,
				logoId: providerId,
			}))
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
	}, [providerMetadata, providerNames, providers]);

	const keyOptions = React.useMemo(() => {
		return apiKeys.map((key) => ({
			value: key.id,
			label: key.name || key.prefix || key.id.slice(0, 8),
		}));
	}, [apiKeys]);

	const logAppOptions = React.useMemo(() => {
		return logAppIds
			.map((appId) => ({
				value: appId,
				label: appMetadata.get(appId)?.title?.trim() || appId,
			}))
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
	}, [appMetadata, logAppIds]);

	const endpointOptions = React.useMemo(() => {
		return logEndpoints.map((endpoint) => ({
			value: endpoint,
			label: endpoint,
		}));
	}, [logEndpoints]);

	const finishReasonOptions = React.useMemo(() => {
		return logFinishReasons.map((finishReason) => ({
			value: finishReason,
			label: finishReason,
		}));
	}, [logFinishReasons]);

	const errorCodeOptions = React.useMemo(() => {
		return logErrorCodes.map((errorCode) => ({
			value: errorCode,
			label: errorCode,
		}));
	}, [logErrorCodes]);

	const statusCodeOptions = React.useMemo(() => {
		return logStatusCodes.map((statusCode) => ({
			value: String(statusCode),
			label: String(statusCode),
		}));
	}, [logStatusCodes]);

	const sessionAppOptions = React.useMemo(() => {
		return sessionAppIds
			.map((appId) => ({
				value: appId,
				label: appMetadata.get(appId)?.title?.trim() || appId,
			}))
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
	}, [appMetadata, sessionAppIds]);

	const sessionModelOptions = React.useMemo(() => {
		return sessionModelIds
			.map((modelId) => ({
				value: modelId,
				label: getModelDisplayName(modelId, modelMetadata),
				logoId: modelMetadata.get(modelId)?.organisationId ?? null,
			}))
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
	}, [modelMetadata, sessionModelIds]);

	const sessionProviderOptions = React.useMemo(() => {
		return sessionProviderIds
			.map((providerId) => ({
				value: providerId,
				label:
					providerNames.get(providerId) ??
					providerMetadata.get(providerId)?.name ??
					providerId,
				logoId: providerId,
			}))
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
	}, [providerMetadata, providerNames, sessionProviderIds]);

	const statusOptions: FilterOption[] = [
		{ value: "success", label: "Successful only" },
		{ value: "error", label: "Errors only" },
	];

	const streamOptions: FilterOption[] = [
		{ value: "streaming", label: "Streaming only" },
		{ value: "non_streaming", label: "Non-streaming only" },
	];

	const jobKindOptions: FilterOption[] = [
		{ value: "video", label: "Video" },
		{ value: "batch", label: "Batch" },
	];

	const jobStatusOptions: FilterOption[] = [
		{ value: "pending", label: "Queued" },
		{ value: "in_progress", label: "Processing" },
		{ value: "completed", label: "Completed" },
		{ value: "failed", label: "Failed" },
		{ value: "cancelled", label: "Cancelled" },
		{ value: "expired", label: "Expired" },
	];

	const activeChips: React.ReactNode[] = [];

	if (view === "logs") {
		if (modelFilter) {
			activeChips.push(
				<FilterChip
					key="model"
					label="Model"
					value={getModelDisplayName(modelFilter, modelMetadata)}
					onClear={() => setModelFilter("")}
				/>,
			);
		}
		if (providerFilter) {
			activeChips.push(
				<FilterChip
					key="provider"
					label="Provider"
					value={
						providerNames.get(providerFilter) ??
						providerMetadata.get(providerFilter)?.name ??
						providerFilter
					}
					onClear={() => setProviderFilter("")}
				/>,
			);
		}
		if (appFilter) {
			activeChips.push(
				<FilterChip
					key="app"
					label="App"
					value={appMetadata.get(appFilter)?.title?.trim() || appFilter}
					onClear={() => setAppFilter("")}
				/>,
			);
		}
		if (endpointFilter) {
			activeChips.push(
				<FilterChip
					key="endpoint"
					label="Endpoint"
					value={<code className="font-mono text-[11px]">{endpointFilter}</code>}
					onClear={() => setEndpointFilter("")}
				/>,
			);
		}
		if (finishReasonFilter) {
			activeChips.push(
				<FilterChip
					key="finish-reason"
					label="Finish"
					value={finishReasonFilter}
					onClear={() => setFinishReasonFilter("")}
				/>,
			);
		}
		if (streamFilter !== "all") {
			activeChips.push(
				<FilterChip
					key="stream"
					label="Stream"
					value={
						streamFilter === "streaming"
							? "Streaming only"
							: "Non-streaming only"
					}
					onClear={() => setStreamFilter("all")}
				/>,
			);
		}
		if (errorCodeFilter) {
			activeChips.push(
				<FilterChip
					key="error-code"
					label="Error"
					value={<code className="font-mono text-[11px]">{errorCodeFilter}</code>}
					onClear={() => setErrorCodeFilter("")}
				/>,
			);
		}
		if (statusCodeFilter) {
			activeChips.push(
				<FilterChip
					key="status-code"
					label="HTTP"
					value={<code className="font-mono text-[11px]">{statusCodeFilter}</code>}
					onClear={() => setStatusCodeFilter("")}
				/>,
			);
		}
		if (keyFilter) {
			const keyLabel =
				apiKeys.find((key) => key.id === keyFilter)?.name ||
				apiKeys.find((key) => key.id === keyFilter)?.prefix ||
				keyFilter.slice(0, 8);
			activeChips.push(
				<FilterChip key="key" label="Key" value={keyLabel} onClear={() => setKeyFilter("")} />,
			);
		}
		if (statusFilter !== "all") {
			activeChips.push(
				<FilterChip
					key="status"
					label="Status"
					value={statusFilter === "success" ? "Successful only" : "Errors only"}
					onClear={() => setStatusFilter("all")}
				/>,
			);
		}
		if (requestFilter) {
			activeChips.push(
				<FilterChip
					key="req"
					label="Req"
					value={<code className="font-mono text-[11px]">{shortenIdentifier(requestFilter, 6)}</code>}
					onClear={() => setRequestFilter("")}
				/>,
			);
		}
		if (sessionFilter) {
			activeChips.push(
				<FilterChip
					key="session"
					label="Session"
					value={<code className="font-mono text-[11px]">{shortenIdentifier(sessionFilter, 6)}</code>}
					onClear={() => setSessionFilter("")}
				/>,
			);
		}
	}

	if (view === "jobs") {
		if (jobKindFilter) {
			activeChips.push(
				<FilterChip
					key="job-kind"
					label="Kind"
					value={jobKindFilter === "video" ? "Video" : "Batch"}
					onClear={() => setJobKindFilter("")}
				/>,
			);
		}
		if (jobStatusFilter) {
			activeChips.push(
				<FilterChip
					key="job-status"
					label="Status"
					value={jobStatusOptions.find((option) => option.value === jobStatusFilter)?.label ?? jobStatusFilter}
					onClear={() => setJobStatusFilter("")}
				/>,
			);
		}
		if (jobProviderFilter) {
			activeChips.push(
				<FilterChip
					key="job-provider"
					label="Provider"
					value={
						providerNames.get(jobProviderFilter) ??
						providerMetadata.get(jobProviderFilter)?.name ??
						jobProviderFilter
					}
					onClear={() => setJobProviderFilter("")}
				/>,
			);
		}
	}

	if (view === "sessions") {
		if (sessionAppFilter) {
			activeChips.push(
				<FilterChip
					key="session-app"
					label="App"
					value={appMetadata.get(sessionAppFilter)?.title?.trim() || sessionAppFilter}
					onClear={() => setSessionAppFilter("")}
				/>,
			);
		}
		if (sessionModelFilter) {
			activeChips.push(
				<FilterChip
					key="session-model"
					label="Model"
					value={getModelDisplayName(sessionModelFilter, modelMetadata)}
					onClear={() => setSessionModelFilter("")}
				/>,
			);
		}
		if (sessionProviderFilter) {
			activeChips.push(
				<FilterChip
					key="session-provider"
					label="Provider"
					value={
						providerNames.get(sessionProviderFilter) ??
						providerMetadata.get(sessionProviderFilter)?.name ??
						sessionProviderFilter
					}
					onClear={() => setSessionProviderFilter("")}
				/>,
			);
		}
		if (sessionFilter) {
			activeChips.push(
				<FilterChip
					key="session"
					label="Session"
					value={<code className="font-mono text-[11px]">{shortenIdentifier(sessionFilter, 6)}</code>}
					onClear={() => setSessionFilter("")}
				/>,
			);
		}
	}

	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button
						type="button"
						variant="outline"
						className="h-9 gap-2 rounded-md px-3 text-xs font-medium" />}>

						<ListFilter className="h-3.5 w-3.5" />
						Add filter

				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-[260px]">
					<DropdownMenuLabel>Filters</DropdownMenuLabel>
					<DropdownMenuSeparator />

					{view === "logs" ? (
						<>
							<FilterSubmenu
								label="Model"
								options={modelOptions}
								activeValue={modelFilter}
								allLabel="All models"
								onSelect={setModelFilter}
							/>
							<FilterSubmenu
								label="Provider"
								options={providerOptions}
								activeValue={providerFilter}
								allLabel="All providers"
								onSelect={setProviderFilter}
							/>
							<FilterSubmenu
								label="App"
								options={logAppOptions}
								activeValue={appFilter}
								allLabel="All apps"
								onSelect={setAppFilter}
							/>
							<FilterSubmenu
								label="Endpoint"
								options={endpointOptions}
								activeValue={endpointFilter}
								allLabel="All endpoints"
								onSelect={setEndpointFilter}
							/>
							<FilterSubmenu
								label="Finish reason"
								options={finishReasonOptions}
								activeValue={finishReasonFilter}
								allLabel="All finish reasons"
								onSelect={setFinishReasonFilter}
							/>
							<FilterSubmenu
								label="Stream"
								options={streamOptions}
								activeValue={streamFilter === "all" ? "" : streamFilter}
								allLabel="All request modes"
								onSelect={(value) => setStreamFilter(value || "all")}
							/>
							<FilterSubmenu
								label="Error code"
								options={errorCodeOptions}
								activeValue={errorCodeFilter}
								allLabel="All error codes"
								onSelect={setErrorCodeFilter}
							/>
							<FilterSubmenu
								label="HTTP status"
								options={statusCodeOptions}
								activeValue={statusCodeFilter}
								allLabel="All status codes"
								onSelect={setStatusCodeFilter}
							/>
							<FilterSubmenu
								label="Key"
								options={keyOptions}
								activeValue={keyFilter}
								allLabel="All keys"
								onSelect={setKeyFilter}
							/>
							<FilterSubmenu
								label="Status"
								options={statusOptions}
								activeValue={statusFilter === "all" ? "" : statusFilter}
								allLabel="All requests"
								onSelect={(value) => setStatusFilter(value || "all")}
							/>
						</>
					) : null}

					{view === "jobs" ? (
						<>
							<FilterSubmenu
								label="Kind"
								options={jobKindOptions}
								activeValue={jobKindFilter}
								allLabel="All job types"
								onSelect={setJobKindFilter}
							/>
							<FilterSubmenu
								label="Status"
								options={jobStatusOptions}
								activeValue={jobStatusFilter}
								allLabel="All statuses"
								onSelect={setJobStatusFilter}
							/>
							<FilterSubmenu
								label="Provider"
								options={providerOptions}
								activeValue={jobProviderFilter}
								allLabel="All providers"
								onSelect={setJobProviderFilter}
							/>
						</>
					) : null}

					{view === "sessions" ? (
						<>
							<FilterSubmenu
								label="App"
								options={sessionAppOptions}
								activeValue={sessionAppFilter}
								allLabel="All apps"
								onSelect={setSessionAppFilter}
							/>
							<FilterSubmenu
								label="Model"
								options={sessionModelOptions}
								activeValue={sessionModelFilter}
								allLabel="All models"
								onSelect={setSessionModelFilter}
							/>
							<FilterSubmenu
								label="Provider"
								options={sessionProviderOptions}
								activeValue={sessionProviderFilter}
								allLabel="All providers"
								onSelect={setSessionProviderFilter}
							/>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			{activeChips}
		</div>
	);
}
