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
import { CopyButton } from "@/components/ui/copy-button";
import {
	CheckCircle2,
	XCircle,
	Clock,
	Coins,
	Layers,
	Hash,
} from "lucide-react";
import { RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";

interface RequestDetailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	request: RequestRow | null;
	appName?: string | null;
}

function MetricTile({
	icon: Icon,
	label,
	value,
	variant = "default",
}: {
	icon: React.ElementType;
	label: string;
	value: string | number;
	variant?: "default" | "success" | "error";
}) {
	const colorClasses = {
		default: "text-muted-foreground",
		success: "text-green-600",
		error: "text-red-600",
	};

	return (
		<div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
			<Icon className={`h-5 w-5 mt-0.5 ${colorClasses[variant]}`} />
			<div className="flex-1 min-w-0">
				<p className="text-sm text-muted-foreground">{label}</p>
				<p className="text-lg font-semibold truncate">{value}</p>
			</div>
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

export default function RequestDetailDialog({
	open,
	onOpenChange,
	request,
	appName,
}: RequestDetailDialogProps) {
	if (!request) return null;

	const tokens = getTokens(request.usage);
	const latency = request.generation_ms || request.latency_ms || null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<span>Request Details</span>
						{request.success ? (
							<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
								<CheckCircle2 className="mr-1 h-3 w-3" />
								Success
							</Badge>
						) : (
							<Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
								<XCircle className="mr-1 h-3 w-3" />
								Error
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
						{/* Request ID */}
						<div className="flex items-center gap-2">
							<Hash className="h-4 w-4 text-muted-foreground" />
							<span className="text-sm font-medium">Request ID:</span>
							<code className="text-sm bg-muted px-2 py-1 rounded">
								{request.request_id}
							</code>
							<CopyButton content={request.request_id} />
						</div>

						{/* Key Metrics Grid */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
							<MetricTile
								icon={Clock}
								label="Timestamp"
								value={new Date(request.created_at).toLocaleString()}
							/>
							<MetricTile
								icon={Layers}
								label="Model"
								value={request.model_id || "-"}
							/>
							<MetricTile
								icon={Layers}
								label="Provider"
								value={request.provider || "-"}
							/>
						</div>

						{/* Usage Metrics */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
							<MetricTile
								icon={Coins}
								label="Input Tokens"
								value={tokens.input.toLocaleString()}
							/>
							<MetricTile
								icon={Coins}
								label="Output Tokens"
								value={tokens.output.toLocaleString()}
							/>
							<MetricTile
								icon={Coins}
								label="Total Tokens"
								value={tokens.total.toLocaleString()}
							/>
						</div>

						{/* Performance Metrics */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
							<MetricTile
								icon={Coins}
								label="Cost"
								value={formatCost(request.cost_nanos)}
								variant={request.cost_nanos ? "default" : "default"}
							/>
							<MetricTile
								icon={Clock}
								label="Latency"
								value={latency ? `${latency}ms` : "-"}
							/>
							<MetricTile
								icon={Layers}
								label="Status Code"
								value={request.status_code || "-"}
								variant={request.success ? "success" : "error"}
							/>
						</div>

						{/* Additional Info */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{appName && (
								<MetricTile
									icon={Layers}
									label="App"
									value={appName}
								/>
							)}
							<MetricTile
								icon={Layers}
								label="Finish Reason"
								value={request.finish_reason || "-"}
							/>
						</div>

						{/* Error Details (if applicable) */}
						{!request.success && (
							<div className="p-4 rounded-lg border border-red-200 bg-red-50 space-y-2">
								<h4 className="font-semibold text-red-900 flex items-center gap-2">
									<XCircle className="h-4 w-4" />
									Error Details
								</h4>
								{request.error_code && (
									<p className="text-sm">
										<span className="font-medium">Code:</span>{" "}
										<code className="bg-red-100 px-2 py-0.5 rounded text-red-800">
											{request.error_code}
										</code>
									</p>
								)}
								{request.error_message && (
									<p className="text-sm">
										<span className="font-medium">Message:</span>{" "}
										{request.error_message}
									</p>
								)}
							</div>
						)}
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
