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
import {
	ExternalLink,
	ArrowDownCircle,
	ArrowUpCircle,
	Info,
	CheckCircle,
	XCircle,
	Clock,
	Ban,
	DollarSign,
	Repeat,
	CreditCard,
	Zap,
} from "lucide-react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
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

function shortDateTime(iso?: string | null) {
	if (!iso) return "-";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return "-";
	return d.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function fullDateTime(iso?: string | null) {
	if (!iso) return "-";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return "-";
	return d.toISOString(); // universally precise for tooltip
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
				className: "capitalize bg-emerald-100 text-emerald-800",
				icon: <CheckCircle className="mr-1 h-4 w-4" aria-hidden />,
			};
		if (raw === "failed")
			return {
				label: "failed",
				className: "capitalize bg-red-100 text-red-800",
				icon: <XCircle className="mr-1 h-4 w-4" aria-hidden />,
			};
		if (raw === "pending")
			return {
				label: "pending",
				className: "capitalize bg-amber-100 text-amber-800",
				icon: <Clock className="mr-1 h-4 w-4" aria-hidden />,
			};
		if (raw === "cancelled" || raw === "canceled")
			return {
				label: "cancelled",
				className: "capitalize bg-zinc-100 text-zinc-700",
				icon: <Ban className="mr-1 h-4 w-4" aria-hidden />,
			};

		// Unknown -> default to 'processing'
		return {
			label: "processing",
			className: "capitalize bg-blue-100 text-blue-800",
			icon: <Clock className="mr-1 h-4 w-4" aria-hidden />,
		};
	}

	// Non-refund events: allowed statuses (verbatim): cancelled, processing, succeeded
	if (raw === "cancelled" || raw === "canceled")
		return {
			label: "cancelled",
			className: "capitalize bg-zinc-100 text-zinc-700",
			icon: <Ban className="mr-1 h-4 w-4" aria-hidden />,
		};
	if (raw === "processing")
		return {
			label: "processing",
			className: "capitalize bg-blue-100 text-blue-800",
			icon: <Clock className="mr-1 h-4 w-4" aria-hidden />,
		};
	if (raw === "paid")
		return {
			label: "paid",
			className: "capitalize bg-emerald-100 text-emerald-800",
			icon: <CheckCircle className="mr-1 h-4 w-4" aria-hidden />,
		};

	// Unknown -> default to 'processing'
	return {
		label: "processing",
		className: "capitalize bg-gray-100 text-gray-800",
		icon: <Clock className="mr-1 h-4 w-4" aria-hidden />,
	};
}

function kindBadge(kind?: string | null) {
	// map normalized forms to badges
	if (kind === "top_up_one_off")
		return (
			<Badge className="bg-emerald-600 hover:bg-emerald-600 flex items-center gap-1">
				<DollarSign className="h-4 w-4" aria-hidden />
				One-Off Top Up
			</Badge>
		);

	if (kind === "top_up")
		return (
			<Badge className="bg-emerald-600 hover:bg-emerald-600 flex items-center gap-1">
				<DollarSign className="h-4 w-4" aria-hidden />
				Top Up
			</Badge>
		);

	if (kind === "auto_top_up")
		return (
			<Badge className="bg-teal-600 hover:bg-teal-600 flex items-center gap-1">
				<Repeat className="h-4 w-4" aria-hidden />
				Auto Top Up
			</Badge>
		);

	if (kind === "refund" || kind === "refunded")
		return (
			<Badge className="bg-rose-600 hover:bg-rose-600 flex items-center gap-1">
				<ArrowUpCircle className="h-4 w-4" aria-hidden />
				Refund
			</Badge>
		);

	if (kind === "adjustment")
		return (
			<Badge className="bg-zinc-700 hover:bg-zinc-700 flex items-center gap-1">
				<Zap className="h-4 w-4" aria-hidden />
				Adjustment
			</Badge>
		);

	if (kind === "charge" || kind === "usage")
		return (
			<Badge className="bg-indigo-600 hover:bg-indigo-600 flex items-center gap-1">
				<CreditCard className="h-4 w-4" aria-hidden />
				Usage
			</Badge>
		);

	return kind ? <Badge variant="secondary">{kind}</Badge> : null;
}

/** Credit is amount > 0, Debit is amount < 0 */
function amountPill(nanos?: number | null, currency = "USD") {
	const n = nanos ?? 0;
	const positive = n > 0;
	const negative = n < 0;
	const Icon = positive ? ArrowDownCircle : ArrowUpCircle;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
				positive && "text-emerald-700 bg-emerald-50",
				negative && "text-rose-700 bg-rose-50",
				!positive && !negative && "text-zinc-700 bg-zinc-50"
			)}
		>
			{(positive || negative) && <Icon className="h-4 w-4" aria-hidden />}
			{positive ? "+" : negative ? "-" : ""}
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
	pageSize = 10,
	stripeCustomerId,
	currency = "USD",
}: Props) {
	const router = useRouter();
	const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
	const [refundDialogTx, setRefundDialogTx] = useState<Transaction | null>(null);
	const [refundReason, setRefundReason] =
		useState<RefundReasonValue>("no_comment");
	const [pageStr, setPageStr] = useQueryState("tx_page", {
		defaultValue: "0",
	});
	const page = Math.max(0, parseInt(pageStr ?? "0", 10) || 0);
	const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));

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
	const searchParams = useSearchParams();

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
			const response = await fetch("/api/stripe/purchases/document", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ paymentIntentId }),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload?.url) {
				throw new Error(payload?.error ?? "Document lookup failed");
			}
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
					const response = await fetch("/api/stripe/refunds/request", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ paymentIntentId, reason }),
					});
					const payload = await response.json().catch(() => ({}));
					if (!response.ok) {
						throw new Error(
							payload?.error ?? "Refund request failed",
						);
					}
					return payload;
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
		<section>
			<Card>
				<CardHeader>
					<div className="w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="m-0">
								Recent Transactions
							</CardTitle>
							<p className="mt-1 text-xs text-muted-foreground">
								Self-serve refunds are available for eligible top-ups within
								24 hours if that purchased credit lot has not been used.
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={async (e) => {
								e.preventDefault();
								try {
									const resp = await fetch(
										"/api/stripe/billing-portal",
										{
											method: "POST",
											headers: {
												"Content-Type":
													"application/json",
											},
											body: JSON.stringify({
												customerId: stripeCustomerId,
												returnUrl: window.location.href,
											}),
										}
									);
									const data = await resp.json();
									window.location.href =
										data?.url ??
										"/dashboard/settings/credits";
								} catch {
									window.location.href =
										"/dashboard/settings/credits";
								}
							}}
						>
							Manage Payment Methods
							<ExternalLink className="h-4 w-4 ml-1" />
						</Button>
					</div>
				</CardHeader>

				<CardContent>
					{transactions.length === 0 ? (
						<div className="text-sm text-muted-foreground">
							No credits purchased
						</div>
					) : (
						<div className="w-full overflow-x-auto">
							<table className="w-full text-sm table-fixed border-collapse">
								<thead>
									<tr className="text-left text-xs text-muted-foreground">
										<th className="py-2 pr-4 w-56">Date</th>
										<th className="py-2 pr-4 w-40">
											Event
										</th>
										<th className="py-2 pr-4 w-32">
											Status
										</th>
										<th className="py-2 pr-4 w-36 text-right">
											Amount
										</th>
										<th className="py-2 pl-4 w-40 text-right">
											Balance
										</th>
										<th className="py-2 pl-4 w-48 text-right">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{pageItems.map((t) => {
										const { label, className, icon } =
											statusChip(t.status, t.kind);
										const dateShort = shortDateTime(
											t.created_at
										);
										const dateFull = fullDateTime(
											t.created_at
										);
										const before =
											t.before_balance_nanos ?? null;
										const after =
											t.after_balance_nanos ?? null;
										const paymentIntentId =
											parsePaymentIntentId(t);
										const baseEligibility =
											isRefundEligible(t);
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
											<tr
												key={t.id}
												className="align-top"
											>
												{/* Date */}
												<td className="py-3 pr-4 text-muted-foreground">
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="cursor-default">
																{dateShort}
															</span>
														</TooltipTrigger>
														<TooltipContent>
															{dateFull}
														</TooltipContent>
													</Tooltip>
												</td>

												{/* Event (kind badge) */}
												<td className="py-3 pr-4">
													<div className="flex items-center gap-2">
														{kindBadge(t.kind)}
													</div>
												</td>

												{/* Status */}
												<td className="py-3 pr-4">
													<span
														className={cn(
															"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
															className
														)}
													>
														{icon}
														{label}
													</span>
												</td>

												{/* Amount */}
												<td className="py-3 pr-4 text-right font-medium">
													{amountPill(
														t.amount_nanos ?? 0,
														currency
													)}
												</td>

												{/* Balance after + before->after tooltip */}
												<td className="py-3 pl-4 text-right">
													{after !== null ? (
														<Tooltip>
															<TooltipTrigger
																asChild
															>
																<span className="cursor-default font-medium">
																	{formatNanos(
																		after,
																		currency
																	)}
																</span>
															</TooltipTrigger>
															<TooltipContent className="flex items-center gap-2">
																<Info className="h-4 w-4" />
																<span className="tabular-nums">
																	{before !==
																	null
																		? `${formatNanos(
																				before,
																				currency
																		  )} -> ${formatNanos(
																				after,
																				currency
																		  )}`
																		: `Balance: ${formatNanos(
																				after,
																				currency
																		  )}`}
																</span>
															</TooltipContent>
														</Tooltip>
													) : (
														<span className="text-muted-foreground">
															-
														</span>
													)}
												</td>
												<td className="py-3 pl-4">
													{paymentIntentId ? (
														<div className="flex items-center justify-end gap-2">
															<Button
																size="sm"
																variant="outline"
																disabled={busy}
																onClick={() =>
																	openDocument(
																		t,
																	)
																}
															>
																Invoice
															</Button>
															<Button
																size="sm"
																variant="outline"
																disabled={
																	busy ||
																	!refundEligibility.ok
																}
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
														<span className="text-xs text-muted-foreground float-right">
															-
														</span>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}

					<div className="mt-6 flex items-center justify-center">
						<Pagination>
							<PaginationContent>
								<PaginationItem>
									<PaginationPrevious
										href={buildHref(Math.max(0, page - 1))}
									/>
								</PaginationItem>

								{totalPages <= 7 ? (
									Array.from({ length: totalPages }).map(
										(_, i) => (
											<PaginationItem key={i}>
												<PaginationLink
													href={buildHref(i)}
													isActive={page === i}
												>
													{i + 1}
												</PaginationLink>
											</PaginationItem>
										)
									)
								) : (
									<>
										<PaginationItem>
											<PaginationLink
												href={buildHref(0)}
												isActive={page === 0}
											>
												1
											</PaginationLink>
										</PaginationItem>

										{page > 2 && (
											<PaginationItem>
												<PaginationEllipsis />
											</PaginationItem>
										)}

										{[
											Math.max(1, page - 1),
											page,
											Math.min(totalPages - 2, page + 1),
										]
											.filter(
												(v, idx, arr) =>
													v >= 1 &&
													v <= totalPages - 2 &&
													arr.indexOf(v) === idx
											)
											.map((p) => (
												<PaginationItem key={p}>
													<PaginationLink
														href={buildHref(p)}
														isActive={page === p}
													>
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
												isActive={
													page === totalPages - 1
												}
											>
												{totalPages}
											</PaginationLink>
										</PaginationItem>
									</>
								)}

								<PaginationItem>
									<PaginationNext
										href={buildHref(
											Math.min(totalPages - 1, page + 1)
										)}
									/>
								</PaginationItem>
							</PaginationContent>
						</Pagination>
					</div>
				</CardContent>
			</Card>

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

