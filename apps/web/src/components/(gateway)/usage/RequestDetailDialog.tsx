"use client";

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
	CheckCircle2,
	XCircle,
	Clock,
	Coins,
	Hash,
	Layers,
	AppWindow,
	Server,
} from "lucide-react";
import { RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";

interface RequestDetailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	request: RequestRow | null;
	appName?: string | null;
}

function Field({
	icon: Icon,
	label,
	value,
}: {
	icon: React.ElementType;
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2">
			<Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<div className="text-[11px] font-medium text-muted-foreground">
					{label}
				</div>
				<div className="mt-0.5 flex min-w-0 items-center gap-2">
					<div className="min-w-0 truncate text-sm font-semibold tracking-tight">
						{value}
					</div>
				</div>
			</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<div className="text-xs font-semibold text-foreground">{title}</div>
			<div className="grid grid-cols-1 gap-2 md:grid-cols-2">{children}</div>
		</div>
	);
}

function getTokens(usage: any): { input: number; output: number; total: number } {
	const input = Number(usage?.input_text_tokens ?? usage?.input_tokens ?? 0) || 0;
	const output = Number(usage?.output_text_tokens ?? usage?.output_tokens ?? 0) || 0;
	const total = Number(usage?.total_tokens ?? 0) || input + output;
	return { input, output, total };
}

function formatCost(nanos: number | null | undefined): string {
	const dollars = Number(nanos ?? 0) / 1e9;
	return `$${dollars.toFixed(5)}`;
}

function formatThroughput(value: number | string | null | undefined): string {
	if (value === null || value === undefined) return "-";
	const n = Number(value);
	if (!Number.isFinite(n)) return "-";
	// Stored as numeric; treat as tokens/sec (tps) in UI.
	return `${Math.round(n * 100) / 100} tps`;
}

export default function RequestDetailDialog({
	open,
	onOpenChange,
	request,
	appName,
}: RequestDetailDialogProps) {
	if (!request) return null;

	const tokens = getTokens(request.usage);
	const timestampLocal = new Date(request.created_at).toLocaleString();
	const requestStatusLabel = request.success ? "Success" : "Error";
	const showApp = Boolean(appName) || Boolean(request.app_id);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<span>Request</span>
						{request.success ? (
							<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
								<CheckCircle2 className="mr-1 h-3 w-3" />
								{requestStatusLabel}
							</Badge>
						) : (
							<Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
								<XCircle className="mr-1 h-3 w-3" />
								{requestStatusLabel}
							</Badge>
						)}
					</DialogTitle>
				</DialogHeader>

				<Tabs defaultValue="overview" className="w-full">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="raw">Raw JSON</TabsTrigger>
					</TabsList>

					<TabsContent value="overview" className="space-y-4 mt-4">
						{/* Error Details (if applicable) */}
						{!request.success && (request.error_code || request.error_message) ? (
							<div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
								<h4 className="flex items-center gap-2 text-sm font-semibold text-red-900">
									<XCircle className="h-4 w-4" />
									Error Details
								</h4>
								{request.error_code ? (
									<p className="text-sm">
										<span className="font-medium">Code:</span>{" "}
										<code className="bg-red-100 px-2 py-0.5 rounded text-red-800">
											{request.error_code}
										</code>
									</p>
								) : null}
								{request.error_message ? (
									<p className="text-sm leading-relaxed">
										<span className="font-medium">Message:</span>{" "}
										{request.error_message}
									</p>
								) : null}
							</div>
						) : null}

						<Section title="Identity">
							<Field
								icon={Hash}
								label="Request ID"
								value={
									<code className="font-mono text-xs">
										{request.request_id}
									</code>
								}
							/>
							<Field
								icon={Clock}
								label="Timestamp"
								value={timestampLocal}
							/>
							{showApp ? (
								<Field
									icon={AppWindow}
									label="App"
									value={appName ?? request.app_id ?? "-"}
								/>
							) : null}
						</Section>

						<Section title="Routing">
							<Field
								icon={Layers}
								label="Model"
								value={request.model_id || "-"}
							/>
							<Field
								icon={Server}
								label="Provider"
								value={request.provider || "-"}
							/>
						</Section>

						<Section title="Usage">
							<Field
								icon={Coins}
								label="Input tokens"
								value={tokens.input.toLocaleString()}
							/>
							<Field
								icon={Coins}
								label="Output tokens"
								value={tokens.output.toLocaleString()}
							/>
							<Field
								icon={Coins}
								label="Total tokens"
								value={tokens.total.toLocaleString()}
							/>
							<Field
								icon={Coins}
								label="Cost"
								value={formatCost(request.cost_nanos)}
							/>
						</Section>

						<Section title="Result">
							<Field
								icon={Layers}
								label="Status code"
								value={request.status_code ?? "-"}
							/>
							<Field
								icon={Layers}
								label="Finish reason"
								value={request.finish_reason || "-"}
							/>
							<Field
								icon={request.success ? CheckCircle2 : XCircle}
								label="Success"
								value={request.success ? "true" : "false"}
							/>
						</Section>

						<Section title="Performance">
							<Field
								icon={Clock}
								label="Latency"
								value={
									request.latency_ms !== null && request.latency_ms !== undefined
										? `${request.latency_ms}ms`
										: "-"
								}
							/>
							<Field
								icon={Clock}
								label="Generation time"
								value={
									request.generation_ms !== null &&
									request.generation_ms !== undefined
										? `${request.generation_ms}ms`
										: "-"
								}
							/>
							<Field
								icon={Layers}
								label="Throughput"
								value={formatThroughput(request.throughput)}
							/>
						</Section>

					</TabsContent>

					<TabsContent value="raw" className="mt-4">
						<div className="max-h-[500px] overflow-auto">
							<pre className="text-xs bg-muted p-4 rounded-md whitespace-pre-wrap break-words">
								{JSON.stringify(request, null, 2)}
							</pre>
						</div>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
