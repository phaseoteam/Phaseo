"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationPrevious,
	PaginationNext,
	PaginationEllipsis,
	PaginationLink,
} from "@/components/ui/pagination";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { accountBillingRequest } from "@/lib/billing/accountBillingClient";
import {
	ExternalLink,
	ArrowUpCircle,
	CheckCircle,
	XCircle,
	Clock,
	Ban,
	DollarSign,
	Repeat,
	CreditCard,
	Gift,
	Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getCreditTransactionKindLabel } from "@/lib/credits/promoCodes";
import { formatRelativeToNow } from "@/lib/formatRelative";
import { toast } from "sonner";

type Transaction = {
	id: string;
	amount_nanos?: number | null;
	/** Optional extras if you start passing them from the server: */
	description?: string | null;
	created_at?: string | null; // event_time preferred; fallback created_at
	status?: string | null; // e.g. 'pending' | 'processing' | 'paid' | 'refunded' | 'failed'
	kind?: string | null; // e.g. 'topup', 'charge', 'auto_topup', 'adjustment'
	ref_type?: string | null; // e.g. 'payment_intent'
	ref_id?: string | null; // e.g. 'pi_xxx'
	source_ref_type?: string | null;
	source_ref_id?: string | null;
	before_balance_nanos?: number | null; // bigint nanos
	after_balance_nanos?: number | null; // bigint nanos
};

interface Props {
	transactions: Transaction[];
	pageSize?: number;
	stripeCustomerId?: string | null;
	currency?: string; // default "USD"
}

const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOP_UP_KINDS = new Set(["top_up", "top_up_one_off", "auto_top_up"]);
const PAID_STATUSES = new Set(["paid", "succeeded"]);
const REFUND_REASON_OPTIONS = [
	{ value: "no_comment", label: "No comment" },
	{ value: "accidental_purchase", label: "Accidental purchase" },
	{ value: "duplicate_purchase", label: "Duplicate purchase" },
	{ value: "wrong_amount", label: "Wrong amount selected" },
	{ value: "testing_only", label: "Testing / sandbox use" },
	{ value: "no_longer_needed", label: "No longer needed" },
	{ value: "other", label: "Other" },
] as const;
type RefundReasonValue = (typeof REFUND_REASON_OPTIONS)[number]["value"];

const TRANSACTION_CHIP_BASE =
	"inline-flex h-5 items-center gap-1 rounded-md px-1.5 py-0 text-[10px] font-medium";

const TRANSACTION_CHIP_TONES = {
	success:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
	danger:
		"border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300",
	warning:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
	info:
		"border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
	teal:
		"border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-300",
	indigo:
		"border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-300",
	neutral: "border-border bg-muted/50 text-muted-foreground",
} as const;

function formatNanos(nanos?: number | null, currency = "USD") {
	const val = (nanos ?? 0) / 1_000_000_000;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			currencyDisplay: "symbol",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(val);
	} catch {
		// fallback if unknown currency code
		return `${val.toFixed(2)} ${currency}`;
	}
}

function formatDateTime(date: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
		timeZone,
	}).format(date);
}

function formatSignedNanos(nanos?: number | null, currency = "USD") {
	const value = nanos ?? 0;
	if (value === 0) return formatNanos(0, currency);
	return `${value > 0 ? "+" : "-"}${formatNanos(Math.abs(value), currency)}`;
}

function statusChip(status?: string | null, kind?: string | null) {
	// Use verbatim DB status values when they match the allowed set per kind.
	const raw = (status ?? "").toLowerCase();
	const k = (kind ?? "").toLowerCase();

	const isRefundKind = k === "refund" || k === "refunded";

	// Allowed statuses for refunds (verbatim): succeeded, failed, pending, cancelled
	if (isRefundKind) {
		if (raw === "succeeded")
			return {
				label: "succeeded",
				className: cn("capitalize", TRANSACTION_CHIP_TONES.success),
				icon: <CheckCircle className="h-3.5 w-3.5" aria-hidden />,
			};
		if (raw === "failed")
			return {
				label: "failed",
				className: cn("capitalize", TRANSACTION_CHIP_TONES.danger),
				icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
			};
		if (raw === "pending")
			return {
				label: "pending",
				className: cn("capitalize", TRANSACTION_CHIP_TONES.warning),
				icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
			};
		if (raw === "cancelled" || raw === "canceled")
			return {
				label: "cancelled",
				className: cn("capitalize", TRANSACTION_CHIP_TONES.neutral),
				icon: <Ban className="h-3.5 w-3.5" aria-hidden />,
			};

		// Unknown -> default to 'processing'
		return {
			label: "processing",
			className: cn("capitalize", TRANSACTION_CHIP_TONES.info),
			icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
		};
	}

	// Non-refund events: allowed statuses (verbatim): cancelled, processing, succeeded
	if (raw === "cancelled" || raw === "canceled")
		return {
			label: "cancelled",
			className: cn("capitalize", TRANSACTION_CHIP_TONES.neutral),
			icon: <Ban className="h-3.5 w-3.5" aria-hidden />,
		};
	if (raw === "processing")
		return {
			label: "processing",
			className: cn("capitalize", TRANSACTION_CHIP_TONES.info),
			icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
		};
	if (raw === "paid")
		return {
			label: "paid",
			className: cn("capitalize", TRANSACTION_CHIP_TONES.success),
			icon: <CheckCircle className="h-3.5 w-3.5" aria-hidden />,
		};

	// Unknown -> default to 'processing'
	return {
		label: "processing",
		className: cn("capitalize", TRANSACTION_CHIP_TONES.neutral),
		icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
	};
}

function kindBadge(kind?: string | null) {
	const label = getCreditTransactionKindLabel(kind);

	if (kind === "promo_code")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.warning)}
			>
				<Zap className="h-3 w-3" aria-hidden />
				{label ?? "Promo"}
			</Badge>
		);

	if (kind === "goodwill_credit")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.teal)}
			>
				<Gift className="h-3 w-3" aria-hidden />
				{label ?? "Goodwill Credit"}
			</Badge>
		);

	// map normalized forms to badges
	if (kind === "top_up_one_off")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.success)}
			>
				<DollarSign className="h-3 w-3" aria-hidden />
				{label ?? "One-Off"}
			</Badge>
		);

	if (kind === "top_up")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.success)}
			>
				<DollarSign className="h-3 w-3" aria-hidden />
				{label ?? "Top Up"}
			</Badge>
		);

	if (kind === "auto_top_up")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.teal)}
			>
				<Repeat className="h-3 w-3" aria-hidden />
				{label ?? "Auto Top Up"}
			</Badge>
		);

	if (kind === "refund" || kind === "refunded")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.danger)}
			>
				<ArrowUpCircle className="h-3 w-3" aria-hidden />
				{label ?? "Refund"}
			</Badge>
		);

	if (kind === "adjustment")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.neutral)}
			>
				<Zap className="h-3 w-3" aria-hidden />
				{label ?? "Adjustment"}
			</Badge>
		);

	if (kind === "charge" || kind === "usage")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.indigo)}
			>
				<CreditCard className="h-3 w-3" aria-hidden />
				{label ?? "Usage"}
			</Badge>
		);

	return kind ? <Badge variant="secondary">{kind}</Badge> : null;
}

/** Credit is amount > 0, Debit is amount < 0 */
function amountPill(nanos?: number | null, currency = "USD") {
	const n = nanos ?? 0;
	const prefix = n > 0 ? "+" : n < 0 ? "-" : "";
	return (
		<span className="inline-flex items-center font-medium tabular-nums text-foreground">
			{prefix}
			{formatNanos(Math.abs(n), currency)}
		</span>
	);
}

function parsePaymentIntentId(tx: Transaction): string | null {
	if (!tx.ref_id || !tx.ref_type) return null;
	const refType = String(tx.ref_type).toLowerCase();
	if (refType !== "stripe_payment_intent") return null;
	const id = String(tx.ref_id).trim();
	return id.startsWith("pi_") ? id : null;
}

function isRefundEligible(tx: Transaction): { ok: boolean; reason?: string } {
	const kind = String(tx.kind ?? "").toLowerCase();
	if (!TOP_UP_KINDS.has(kind)) {
		return { ok: false, reason: "Only top-ups are refundable." };
	}

	const status = String(tx.status ?? "").toLowerCase();
	if (!PAID_STATUSES.has(status)) {
		return { ok: false, reason: "This purchase is not in a paid state." };
	}

	if (!parsePaymentIntentId(tx)) {
		return { ok: false, reason: "Missing payment intent." };
	}

	const createdAt = tx.created_at ? new Date(tx.created_at).getTime() : NaN;
	if (!Number.isFinite(createdAt)) {
		return { ok: false, reason: "Missing purchase timestamp." };
	}

	if (Date.now() - createdAt > REFUND_WINDOW_MS) {
		return { ok: false, reason: "Refund window (24h) has expired." };
	}

	return { ok: true };
}

export default function RecentTransactions({
	transactions,
	pageSize = 25,
	stripeCustomerId,
	currency = "USD",
}: Props) {
	const userTimeZone =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	const router = useRouter();
	const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
	const [refundDialogTx, setRefundDialogTx] = useState<Transaction | null>(null);
	const [refundReason, setRefundReason] =
		useState<RefundReasonValue>("no_comment");
	const [relativeNowMs, setRelativeNowMs] = useState<number | null>(null);
	const [pageStr, setPageStr] = useQueryState("tx_page", {
		defaultValue: "0",
	});
	const page = Math.max(0, parseInt(pageStr ?? "0", 10) || 0);
	const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));

	useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = setInterval(updateNow, 60_000);
		return () => clearInterval(interval);
	}, []);

	// clamp page if transactions change
	useEffect(() => {
		if (page > totalPages - 1) {
			setPageStr(String(totalPages - 1));
		}
	}, [transactions.length, totalPages, page, setPageStr]);

	const pageItems = useMemo(() => {
		const start = page * pageSize;
		return transactions.slice(start, start + pageSize);
	}, [transactions, page, pageSize]);
	const activeRefundSourceIds = useMemo(() => {
		const activeStatuses = new Set([
			"pending",
			"processing",
			"applying",
			"succeeded",
		]);
		const ids = new Set<string>();
		for (const tx of transactions) {
			const kind = String(tx.kind ?? "").toLowerCase();
			if (kind !== "refund" && kind !== "refunded") continue;
			const status = String(tx.status ?? "").toLowerCase();
			if (!activeStatuses.has(status)) continue;
			const sourceType = String(tx.source_ref_type ?? "").toLowerCase();
			const sourceId = String(tx.source_ref_id ?? "").trim();
			if (sourceType === "stripe_payment_intent" && sourceId.startsWith("pi_")) {
				ids.add(sourceId);
			}
		}
		return ids;
	}, [transactions]);

	const pathname = usePathname() || "/";
	const searchParams = useSearchParams() ?? new URLSearchParams();

	function buildHref(p: number) {
		const params = new URLSearchParams(Array.from(searchParams.entries()));
		params.set("tx_page", String(p));
		return `${pathname}?${params.toString()}`;
	}

	const setBusy = (id: string, value: boolean) => {
		setActionBusy((prev) => ({ ...prev, [id]: value }));
	};

	async function openDocument(tx: Transaction) {
		const paymentIntentId = parsePaymentIntentId(tx);
		if (!paymentIntentId) {
			toast.error("No invoice or receipt is available for this row.");
			return;
		}
		setBusy(tx.id, true);
		try {
			const payload = await accountBillingRequest<{ url?: string; message?: string }>("/api/account/settings/billing/purchase-document", { method: "POST", body: JSON.stringify({ paymentIntentId }) });
			if (!payload.url) throw new Error("Document lookup failed");
			window.open(String(payload.url), "_blank", "noopener,noreferrer");
			toast.success(payload?.message ?? "Opened document");
		} catch (error: any) {
			toast.error(error?.message ?? "Failed to fetch document");
		} finally {
			setBusy(tx.id, false);
		}
	}

	async function requestRefund(tx: Transaction, reason: string): Promise<boolean> {
		const paymentIntentId = parsePaymentIntentId(tx);
		if (!paymentIntentId) {
			toast.error("No payment intent found for this purchase.");
			return false;
		}
		setBusy(tx.id, true);
		try {
			const result = await toast.promise(
				(async () => {
					return accountBillingRequest<{ message?: string; status?: string }>(
						"/api/account/settings/billing/refund",
						{ method: "POST", body: JSON.stringify({ paymentIntentId, reason }) },
					);
				})(),
				{
					loading: "Submitting refund request...",
					success: (result) =>
						result?.message ?? "Refund request submitted",
					error: (err) =>
						err?.message ?? "Failed to submit refund request",
				},
			);
			const params = new URLSearchParams(Array.from(searchParams.entries()));
			const nextStatus =
				String((result as any)?.status ?? "").toLowerCase() === "succeeded"
					? "succeeded"
					: "processing";
			params.set("refund", nextStatus);
			params.delete("payment_attempt");
			const nextHref = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
			router.replace(nextHref, { scroll: false });
			router.refresh();
			return true;
		} catch {
			return false;
		} finally {
			setBusy(tx.id, false);
		}
	}

	return (
		<section className="space-y-3">
			<div className="w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h3 className="text-xl font-semibold">Recent Transactions</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						Self-serve refunds are available for eligible top-ups within
						24 hours if that purchased credit lot has not been used.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={async (e) => {
						e.preventDefault();
						try {
							const data = await accountBillingRequest<{ url?: string }>("/api/account/settings/billing/portal", {
								method: "POST", body: JSON.stringify({
									customerId: stripeCustomerId,
									returnUrl: window.location.href,
								}),
							});
							window.location.href = data?.url ?? "/settings/credits";
						} catch {
							window.location.href = "/settings/credits";
						}
					}}
				>
					Manage Payment Methods
					<ExternalLink className="h-4 w-4 ml-1" />
				</Button>
			</div>

			<div className="rounded-md border">
				<div className="w-full overflow-x-auto">
					<Table className="text-xs">
						<TableHeader>
							<TableRow className="h-9">
								<TableHead className="w-[220px]">Timestamp</TableHead>
								<TableHead className="w-[130px]">Amount</TableHead>
								<TableHead className="w-[170px]">Reason</TableHead>
								<TableHead className="w-[140px]">Status</TableHead>
								<TableHead className="w-[150px]">Balance</TableHead>
								<TableHead className="w-[120px]">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{transactions.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="py-8 text-center text-sm text-muted-foreground"
									>
										No credits purchased
									</TableCell>
								</TableRow>
							) : (
								pageItems.map((t) => {
									const { label, className, icon } = statusChip(t.status, t.kind);
									const createdAtDate = t.created_at ? new Date(t.created_at) : null;
									const amountNanos =
										typeof t.amount_nanos === "number" ? t.amount_nanos : null;
									const rawBefore =
										typeof t.before_balance_nanos === "number"
											? t.before_balance_nanos
											: null;
									const rawAfter =
										typeof t.after_balance_nanos === "number"
											? t.after_balance_nanos
											: null;
									const after =
										rawAfter ??
										(rawBefore !== null && amountNanos !== null
											? rawBefore + amountNanos
											: null);
									const before =
										rawBefore ??
										(after !== null && amountNanos !== null
											? after - amountNanos
											: null);
									const paymentIntentId = parsePaymentIntentId(t);
									const baseEligibility = isRefundEligible(t);
									const refundEligibility =
										baseEligibility.ok &&
										paymentIntentId &&
										activeRefundSourceIds.has(paymentIntentId)
											? {
													ok: false,
													reason: "A refund for this purchase is already in progress or completed.",
												}
											: baseEligibility;
									const busy = Boolean(actionBusy[t.id]);

									return (
										<TableRow key={t.id} className="align-top">
											<TableCell className="py-2 font-mono text-xs text-muted-foreground">
												{createdAtDate && Number.isFinite(createdAtDate.getTime()) ? (
													<HoverCard>
														<HoverCardTrigger asChild>
															<span className="cursor-help underline decoration-dotted underline-offset-2">
																{createdAtDate.toLocaleString()}
															</span>
														</HoverCardTrigger>
														<HoverCardContent align="start" className="w-auto">
															<div className="grid gap-2 text-xs">
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">{userTimeZone}</div>
																	<div className="font-mono">
																		{formatDateTime(createdAtDate, userTimeZone)}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">UTC</div>
																	<div className="font-mono">
																		{formatDateTime(createdAtDate, "UTC")}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">Relative</div>
																	<div className="font-mono">
																		{relativeNowMs
																			? formatRelativeToNow(createdAtDate, relativeNowMs)
																			: "-"}
																	</div>
																</div>
															</div>
														</HoverCardContent>
													</HoverCard>
												) : (
													<span>-</span>
												)}
											</TableCell>
											<TableCell className="py-2 font-medium tabular-nums">
												{amountPill(t.amount_nanos ?? 0, currency)}
											</TableCell>
											<TableCell className="py-2">{kindBadge(t.kind)}</TableCell>
											<TableCell className="py-2">
												<Badge
													variant="outline"
													className={cn(
														TRANSACTION_CHIP_BASE,
														className
													)}
												>
													{icon}
													{label}
												</Badge>
											</TableCell>
											<TableCell className="py-2">
												{after !== null ? (
													<HoverCard>
														<HoverCardTrigger asChild>
															<span className="cursor-default font-medium tabular-nums">
																{formatNanos(after, currency)}
															</span>
														</HoverCardTrigger>
														<HoverCardContent align="start" className="w-64">
															<div className="space-y-3 text-xs">
																<div>
																	<div className="font-medium text-foreground">
																		Balance movement
																	</div>
																	<p className="mt-0.5 text-muted-foreground">
																		Balance after this transaction settled.
																	</p>
																</div>
																<div className="grid gap-2">
																	<div className="flex items-center justify-between gap-4">
																		<span className="text-muted-foreground">Before</span>
																		<span className="font-mono font-medium tabular-nums">
																			{before !== null ? formatNanos(before, currency) : "-"}
																		</span>
																	</div>
																	<div className="flex items-center justify-between gap-4">
																		<span className="text-muted-foreground">Change</span>
																		<span
																			className={cn(
																				"font-mono font-medium tabular-nums",
																				(amountNanos ?? 0) < 0
																					? "text-rose-500 dark:text-rose-300"
																					: (amountNanos ?? 0) > 0
																						? "text-emerald-600 dark:text-emerald-300"
																						: "text-muted-foreground"
																			)}
																		>
																			{formatSignedNanos(amountNanos, currency)}
																		</span>
																	</div>
																	<div className="flex items-center justify-between gap-4 border-t pt-2">
																		<span className="text-muted-foreground">After</span>
																		<span className="font-mono font-semibold tabular-nums text-foreground">
																			{formatNanos(after, currency)}
																		</span>
																	</div>
																</div>
															</div>
														</HoverCardContent>
													</HoverCard>
												) : (
													<span className="text-muted-foreground">-</span>
												)}
											</TableCell>
											<TableCell className="py-2">
												{paymentIntentId ? (
													<div className="flex items-center justify-start gap-3">
														<Button
															size="sm"
															variant="link"
															className="h-auto p-0 text-xs"
															disabled={busy}
															onClick={() => openDocument(t)}
														>
															Invoice
														</Button>
														<Button
															size="sm"
															variant="link"
															className="h-auto p-0 text-xs"
															disabled={busy || !refundEligibility.ok}
															title={
																refundEligibility.ok
																	? "Refund this purchase"
																	: refundEligibility.reason
															}
															onClick={() => {
																setRefundDialogTx(t);
																setRefundReason("no_comment");
															}}
														>
															Refund
														</Button>
													</div>
												) : (
													<span className="text-xs text-muted-foreground">-</span>
												)}
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			<div className="mt-3 flex items-center justify-center">
				<Pagination>
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious href={buildHref(Math.max(0, page - 1))} />
						</PaginationItem>

						{totalPages <= 7 ? (
							Array.from({ length: totalPages }).map((_, i) => (
								<PaginationItem key={i}>
									<PaginationLink href={buildHref(i)} isActive={page === i}>
										{i + 1}
									</PaginationLink>
								</PaginationItem>
							))
						) : (
							<>
								<PaginationItem>
									<PaginationLink href={buildHref(0)} isActive={page === 0}>
										1
									</PaginationLink>
								</PaginationItem>

								{page > 2 && (
									<PaginationItem>
										<PaginationEllipsis />
									</PaginationItem>
								)}

								{[Math.max(1, page - 1), page, Math.min(totalPages - 2, page + 1)]
									.filter(
										(v, idx, arr) =>
											v >= 1 && v <= totalPages - 2 && arr.indexOf(v) === idx
									)
									.map((p) => (
										<PaginationItem key={p}>
											<PaginationLink href={buildHref(p)} isActive={page === p}>
												{p + 1}
											</PaginationLink>
										</PaginationItem>
									))}

								{page < totalPages - 3 && (
									<PaginationItem>
										<PaginationEllipsis />
									</PaginationItem>
								)}

								<PaginationItem>
									<PaginationLink
										href={buildHref(totalPages - 1)}
										isActive={page === totalPages - 1}
									>
										{totalPages}
									</PaginationLink>
								</PaginationItem>
							</>
						)}

						<PaginationItem>
							<PaginationNext href={buildHref(Math.min(totalPages - 1, page + 1))} />
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>

			<Dialog
				open={Boolean(refundDialogTx)}
				onOpenChange={(open) => {
					if (!open && refundDialogTx && !actionBusy[refundDialogTx.id]) {
						setRefundDialogTx(null);
						setRefundReason("no_comment");
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Request refund?</DialogTitle>
						<DialogDescription>
							Select an optional reason for this self-serve refund request.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<p className="text-xs text-muted-foreground">
							Reason is optional and logged for audit.
						</p>
						<Select
							value={refundReason}
							onValueChange={(value) =>
								setRefundReason(value as RefundReasonValue)
							}
							disabled={Boolean(refundDialogTx && actionBusy[refundDialogTx.id])}
						>
							<SelectTrigger>
								<SelectValue placeholder="No comment" />
							</SelectTrigger>
							<SelectContent>
								{REFUND_REASON_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setRefundDialogTx(null);
								setRefundReason("no_comment");
							}}
							disabled={Boolean(refundDialogTx && actionBusy[refundDialogTx.id])}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={
								!refundDialogTx ||
								Boolean(actionBusy[refundDialogTx.id])
							}
							onClick={async () => {
								if (!refundDialogTx) return;
								const ok = await requestRefund(
									refundDialogTx,
									refundReason.trim(),
								);
								if (ok) {
									setRefundDialogTx(null);
									setRefundReason("no_comment");
								}
							}}
						>
							{refundDialogTx && actionBusy[refundDialogTx.id]
								? "Submitting..."
								: "Submit Refund"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}

