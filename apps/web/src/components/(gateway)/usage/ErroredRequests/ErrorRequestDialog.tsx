"use client";

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import {
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Clock,
	Coins,
	Layers,
	Cpu,
	Network,
	Hash,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export type ErrorDialogRow = {
	request_id?: string | null;
	created_at: string;
	provider?: string | null;
	model_id?: string | null;
	status_code?: number | null;
	error_code?: string | null;
	error_message?: string | null;
	usage?: any;
	cost_nanos?: number | null;
};

function niceDate(iso: string) {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

function getTokens(u: any) {
	// Sum all token counters except the aggregate total_tokens
	const sumAll = (usage: any): number => {
		if (Array.isArray(usage))
			return usage.reduce((s, x) => s + sumAll(x), 0);
		if (!usage || typeof usage !== "object") return 0;
		return Object.entries(usage)
			.filter(
				([k]) =>
					k.toLowerCase().includes("token") &&
					k.toLowerCase() !== "total_tokens"
			)
			.reduce((s, [, v]) => {
				const n = Number(v);
				return Number.isFinite(n) && n > 0 ? s + n : s;
			}, 0);
	};
	return sumAll(u);
}

function formatUSDFromNanos(n?: number | null, dp = 5) {
	const dollars = Number(n ?? 0) / 1e9;
	return dollars.toFixed(dp);
}

function getFriendlyErrorCode(code: string | null | undefined): string {
	if (!code) return "-";
	const cleanCode = code.replace(/^(user:|upstream:)/i, "");
	const mapping: Record<string, string> = {
		unauthorised: "Unauthorized",
		invalid_json: "Invalid JSON",
		validation_error: "Validation error",
		model_required: "Model required",
		upstream_error: "Upstream error",
		key_limit_exceeded: "Rate limited",
		insufficient_funds: "Insufficient funds",
		unsupported_model_or_endpoint: "Unsupported model",
		pricing_not_configured: "Pricing not configured",
		authentication_error: "Auth error",
		authorization_error: "Permission denied",
		not_found_error: "Not found",
		rate_limit_error: "Rate limited",
		provider_error: "Provider error",
		server_error: "Server error",
		bad_gateway: "Bad gateway",
		service_unavailable: "Service unavailable",
		gateway_timeout: "Gateway timeout",
		payment_error: "Payment error",
		permission_error: "Permission error",
		bad_request: "Bad request",
	};
	return mapping[cleanCode] || cleanCode.replace(/_/g, " ");
}

function statusBadge(status?: number | null) {
	if (status == null) {
		return (
			<Badge className="gap-1 bg-amber-600 hover:bg-amber-600 text-white">
				<AlertTriangle className="h-3.5 w-3.5" />
				Unknown
			</Badge>
		);
	}
	const ok = status < 400;
	if (ok) {
		return (
			<Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white">
				<CheckCircle2 className="h-3.5 w-3.5" />
				{status}
			</Badge>
		);
	}
	return (
		<Badge className="gap-1 bg-rose-600 hover:bg-rose-600 text-white">
			<XCircle className="h-3.5 w-3.5" />
			{status}
		</Badge>
	);
}

function formatHeaderTime(iso?: string | null) {
	if (!iso) return "-";
	try {
		const d = new Date(iso);
		const now = new Date();
		const pad = (n: number) => n.toString().padStart(2, "0");
		const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
		if (
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate()
		) {
			return hhmm;
		}
		if (d.getFullYear() === now.getFullYear()) {
			return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hhmm}`;
		}
		return `${pad(d.getDate())}/${pad(
			d.getMonth() + 1
		)}/${d.getFullYear()} ${hhmm}`;
	} catch {
		return iso;
	}
}

function MetricTile({
	icon,
	label,
	value,
	sub,
	tone = "slate",
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	sub?: React.ReactNode;
	tone?: "slate" | "emerald" | "violet" | "sky" | "rose" | "amber";
}) {
	const toneMap: Record<string, string> = {
		slate: "bg-slate-600/10 text-slate-700 dark:text-slate-200",
		emerald: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
		violet: "bg-violet-600/10 text-violet-700 dark:text-violet-300",
		sky: "bg-sky-600/10 text-sky-700 dark:text-sky-300",
		rose: "bg-rose-600/10 text-rose-700 dark:text-rose-300",
		amber: "bg-amber-600/10 text-amber-700 dark:text-amber-300",
	};
	return (
		<div className="rounded-2xl border bg-card p-4">
			<div className="flex items-center justify-between">
				<div
					className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneMap[tone]}`}
				>
					{icon}
				</div>
			</div>
			<div className="mt-3 text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 text-lg font-semibold tracking-tight">
				{value}
			</div>
			{sub ? (
				<div className="mt-1 text-xs text-muted-foreground">{sub}</div>
			) : null}
		</div>
	);
}

export default function ErrorRequestDialog({
	row,
	open,
	onOpenChange,
}: {
	row: ErrorDialogRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const selected = row;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[900px] overflow-hidden p-0">
				{/* Header similar to success dialog */}
				<div >
					<div className="px-5 py-4 sm:px-6 sm:py-5">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<div className="flex items-center gap-3">
									<div className="text-lg font-semibold font-mono break-all">
										{selected?.request_id ?? "-"}
									</div>
									{selected?.request_id ? (
										<CopyButton
											size="sm"
											content={selected.request_id}
											aria-label="Copy request id"
											className="ml-1"
										/>
									) : null}
								</div>
								<div className="mt-2 flex flex-wrap items-center gap-2">
									{statusBadge(selected?.status_code ?? null)}
									<Badge
										variant="secondary"
										className="gap-1"
									>
										<Cpu className="h-3.5 w-3.5" />
										{selected?.model_id ?? "-"}
									</Badge>
									<Badge variant="outline" className="gap-1">
										<Network className="h-3.5 w-3.5" />
										{selected?.provider ?? "-"}
									</Badge>
									<Badge variant="outline" className="gap-1">
										<Clock className="h-3.5 w-3.5" />
										{formatHeaderTime(selected?.created_at)}
									</Badge>
								</div>
							</div>
							<div />
						</div>
					</div>
				</div>

				<div className="p-5 sm:p-6">
					{/* KPI tiles */}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<MetricTile
							icon={<Hash className="h-4 w-4" />}
							label="Status code"
							value={
								<span className="font-mono">
									{selected?.status_code ?? "-"}
								</span>
							}
							tone="rose"
						/>
						<MetricTile
							icon={<Layers className="h-4 w-4" />}
							label="Error code"
							value={
								<span className="font-mono wrap-break-word">
									{getFriendlyErrorCode(selected?.error_code)}
								</span>
							}
							tone="amber"
						/>
						<MetricTile
							icon={<Coins className="h-4 w-4" />}
							label="Spend (USD)"
							value={
								<span className="font-mono">
									${formatUSDFromNanos(selected?.cost_nanos)}
								</span>
							}
							tone="amber"
						/>
						<MetricTile
							icon={<Layers className="h-4 w-4" />}
							label="Tokens"
							value={
								<span className="font-mono">
									{Intl.NumberFormat().format(
										getTokens(selected?.usage)
									)}
								</span>
							}
							tone="violet"
						/>
					</div>

					<Separator className="my-5" />

					{/* Tabs (Overview, Raw) */}
					<Tabs defaultValue="overview" className="w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="raw">Raw</TabsTrigger>
						</TabsList>

						<TabsContent value="overview" className="mt-4">
							{selected?.error_message ? (
								<div className="rounded-2xl border bg-card p-4">
									<div className="mb-2 text-sm font-medium">
										Message
									</div>
									<div className="whitespace-pre-wrap wrap-break-word text-sm">
										{selected.error_message}
									</div>
								</div>
							) : (
								<div className="text-sm text-muted-foreground">
									No error message available.
								</div>
							)}
						</TabsContent>

						<TabsContent value="raw" className="mt-4">
							<div className="rounded-2xl border bg-card">
								<div className="flex items-center justify-between px-4 py-3">
									<div className="text-sm font-medium">
										Raw payload
									</div>
									{selected ? (
										<CopyButton
											size="sm"
											variant="outline"
											content={JSON.stringify(
												selected,
												null,
												2
											)}
											aria-label="Copy raw JSON"
										/>
									) : null}
								</div>
								<Separator />
								<div className="max-h-[50vh] overflow-auto p-4">
									<pre className="whitespace-pre-wrap wrap-break-word rounded-md bg-muted p-3 text-xs leading-relaxed">
										{selected
											? JSON.stringify(selected, null, 2)
											: ""}
									</pre>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</div>

				<DialogFooter className="mt-2"></DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
