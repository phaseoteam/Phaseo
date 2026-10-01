"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { useSettingsWrite } from "../settings/PrivateSettingsQuery";
import { requestCreditRefund } from "./refundRequest";
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
import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import {
	formatDisplayDateTime,
	formatDisplayDateParts,
	formatDisplayNumber,
	formatDisplayTimestamp,
	type DisplayFormattingPreferences,
} from "@/lib/displayPreferences";
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
	{ value: "no_comment" },
	{ value: "accidental_purchase" },
	{ value: "duplicate_purchase" },
	{ value: "wrong_amount" },
	{ value: "testing_only" },
	{ value: "no_longer_needed" },
	{ value: "other" },
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

function formatNanos(
	nanos: number | null | undefined,
	currency: string,
	preferences: DisplayFormattingPreferences,
) {
	const val = (nanos ?? 0) / 1_000_000_000;
	try {
		return formatDisplayNumber(val, preferences, {
			style: "currency",
			currency,
			currencyDisplay: "symbol",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
	} catch {
		// fallback if unknown currency code
		return `${formatDisplayNumber(val, preferences, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
			notation: "standard",
		})} ${currency}`;
	}
}

function formatDateTime(
	date: Date,
	timeZone: string,
	preferences: DisplayFormattingPreferences,
): string {
	return formatDisplayDateParts(date, preferences, {
		dateStyle: preferences.dateStyle === "iso" ? "short" : preferences.dateStyle,
		timeStyle: "medium",
		timeZone,
	});
}

function formatSignedNanos(
	nanos: number | null | undefined,
	currency: string,
	preferences: DisplayFormattingPreferences,
) {
	const value = nanos ?? 0;
	if (value === 0) return formatNanos(0, currency, preferences);
	return `${value > 0 ? "+" : "-"}${formatNanos(Math.abs(value), currency, preferences)}`;
}

function formatRelativeDate(date: Date, nowMs: number, locale: string): string {
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	const seconds = (date.getTime() - nowMs) / 1000;
	const units = [
		["year", 31_536_000],
		["month", 2_592_000],
		["week", 604_800],
		["day", 86_400],
		["hour", 3_600],
		["minute", 60],
		["second", 1],
	] as const;
	const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) ?? units[units.length - 1];
	return formatter.format(Math.round(seconds / size), unit);
}

type TransactionStatusKey = "succeeded" | "failed" | "pending" | "cancelled" | "processing" | "paid";
type TransactionKindKey = "promoCredit" | "goodwillCredit" | "oneOff" | "topUp" | "autoTopUp" | "refund" | "adjustment" | "usage";

function statusChip(
	status: string | null | undefined,
	kind: string | null | undefined,
	labelFor: (key: TransactionStatusKey) => string,
) {
	// Use verbatim DB status values when they match the allowed set per kind.
	const raw = (status ?? "").toLowerCase();
	const k = (kind ?? "").toLowerCase();

	const isRefundKind = k === "refund" || k === "refunded";

	// Allowed statuses for refunds (verbatim): succeeded, failed, pending, cancelled
	if (isRefundKind) {
		if (raw === "succeeded")
			return {
				label: labelFor("succeeded"),
				className: cn("capitalize", TRANSACTION_CHIP_TONES.success),
				icon: <CheckCircle className="h-3.5 w-3.5" aria-hidden />,
			};
		if (raw === "failed")
			return {
				label: labelFor("failed"),
				className: cn("capitalize", TRANSACTION_CHIP_TONES.danger),
				icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
			};
		if (raw === "pending")
			return {
				label: labelFor("pending"),
				className: cn("capitalize", TRANSACTION_CHIP_TONES.warning),
				icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
			};
		if (raw === "cancelled" || raw === "canceled")
			return {
				label: labelFor("cancelled"),
				className: cn("capitalize", TRANSACTION_CHIP_TONES.neutral),
				icon: <Ban className="h-3.5 w-3.5" aria-hidden />,
			};

		// Unknown -> default to 'processing'
		return {
			label: labelFor("processing"),
			className: cn("capitalize", TRANSACTION_CHIP_TONES.info),
			icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
		};
	}

	// Non-refund events: allowed statuses (verbatim): cancelled, processing, succeeded
	if (raw === "cancelled" || raw === "canceled")
		return {
			label: labelFor("cancelled"),
			className: cn("capitalize", TRANSACTION_CHIP_TONES.neutral),
			icon: <Ban className="h-3.5 w-3.5" aria-hidden />,
		};
	if (raw === "processing")
		return {
			label: labelFor("processing"),
			className: cn("capitalize", TRANSACTION_CHIP_TONES.info),
			icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
		};
	if (raw === "paid")
		return {
			label: labelFor("paid"),
			className: cn("capitalize", TRANSACTION_CHIP_TONES.success),
			icon: <CheckCircle className="h-3.5 w-3.5" aria-hidden />,
		};

	// Unknown -> default to 'processing'
	return {
		label: labelFor("processing"),
		className: cn("capitalize", TRANSACTION_CHIP_TONES.neutral),
		icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
	};
}

function kindBadge(kind: string | null | undefined, labelFor: (key: TransactionKindKey) => string) {

	if (kind === "promo_code")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.warning)}
			>
				<Zap className="h-3 w-3" aria-hidden />
				{labelFor("promoCredit")}
			</Badge>
		);

	if (kind === "goodwill_credit")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.teal)}
			>
				<Gift className="h-3 w-3" aria-hidden />
				{labelFor("goodwillCredit")}
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
				{labelFor("oneOff")}
			</Badge>
		);

	if (kind === "top_up")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.success)}
			>
				<DollarSign className="h-3 w-3" aria-hidden />
				{labelFor("topUp")}
			</Badge>
		);

	if (kind === "auto_top_up")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.teal)}
			>
				<Repeat className="h-3 w-3" aria-hidden />
				{labelFor("autoTopUp")}
			</Badge>
		);

	if (kind === "refund" || kind === "refunded")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.danger)}
			>
				<ArrowUpCircle className="h-3 w-3" aria-hidden />
				{labelFor("refund")}
			</Badge>
		);

	if (kind === "adjustment")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.neutral)}
			>
				<Zap className="h-3 w-3" aria-hidden />
				{labelFor("adjustment")}
			</Badge>
		);

	if (kind === "charge" || kind === "usage")
		return (
			<Badge
				variant="outline"
				className={cn(TRANSACTION_CHIP_BASE, TRANSACTION_CHIP_TONES.indigo)}
			>
				<CreditCard className="h-3 w-3" aria-hidden />
				{labelFor("usage")}
			</Badge>
		);

	return kind ? <Badge variant="secondary">{kind}</Badge> : null;
}

/** Credit is amount > 0, Debit is amount < 0 */
function amountPill(
	nanos: number | null | undefined,
	currency: string,
	preferences: DisplayFormattingPreferences,
) {
	const n = nanos ?? 0;
	const prefix = n > 0 ? "+" : n < 0 ? "-" : "";
	return (
		<span className="inline-flex items-center font-medium tabular-nums text-foreground">
			{prefix}
			{formatNanos(Math.abs(n), currency, preferences)}
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

type RefundEligibilityReason = "onlyTopUps" | "notPaid" | "missingPaymentIntent" | "missingTimestamp" | "windowExpired" | "refundInProgress";

function isRefundEligible(tx: Transaction): { ok: boolean; reason?: RefundEligibilityReason } {
	const kind = String(tx.kind ?? "").toLowerCase();
	if (!TOP_UP_KINDS.has(kind)) {
		return { ok: false, reason: "onlyTopUps" };
	}

	const status = String(tx.status ?? "").toLowerCase();
	if (!PAID_STATUSES.has(status)) {
		return { ok: false, reason: "notPaid" };
	}

	if (!parsePaymentIntentId(tx)) {
		return { ok: false, reason: "missingPaymentIntent" };
	}

	const createdAt = tx.created_at ? new Date(tx.created_at).getTime() : NaN;
	if (!Number.isFinite(createdAt)) {
		return { ok: false, reason: "missingTimestamp" };
	}

	if (Date.now() - createdAt > REFUND_WINDOW_MS) {
		return { ok: false, reason: "windowExpired" };
	}

	return { ok: true };
}

export default function RecentTransactions({
	transactions,
	pageSize = 25,
	stripeCustomerId,
	currency = "USD",
}: Props) {
	const locale = useLocale();
	const t = useTranslations("SettingsUI");
	const transactionText = (key: string) => t(`credits.transactions.${key}` as never);
	const statusLabel = (key: TransactionStatusKey) => transactionText(`status.${key}`);
	const kindLabel = (key: TransactionKindKey) => transactionText(`kind.${key}`);
	const { formattingPreferences: preferences } = useDisplayPreferences();
	const userTimeZone =
		preferences.timeZone !== "system"
			? preferences.timeZone
			: typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	const router = useRouter();
	const write = useSettingsWrite();
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
			toast.error(transactionText("documentUnavailable"));
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
				throw new Error("document_lookup_failed");
			}
			window.open(String(payload.url), "_blank", "noopener,noreferrer");
			toast.success(transactionText("documentOpened"));
		} catch {
			toast.error(transactionText("documentFailed"));
		} finally {
			setBusy(tx.id, false);
		}
	}

	async function requestRefund(tx: Transaction, reason: string): Promise<boolean> {
		const paymentIntentId = parsePaymentIntentId(tx);
		if (!paymentIntentId) {
			toast.error(transactionText("paymentIntentMissing"));
			return false;
		}
		setBusy(tx.id, true);
		try {
			const operation = write(requestCreditRefund(paymentIntentId, reason));
			toast.promise(operation,
				{
					loading: transactionText("refundSubmitting"),
					success: transactionText("refundSubmitted"),
					error: transactionText("refundRequestFailed"),
				},
			);
			const result = await operation;
			const params = new URLSearchParams(Array.from(searchParams.entries()));
			const nextStatus =
				String(result?.status ?? "").toLowerCase() === "succeeded"
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
					<h3 className="text-xl font-semibold">{transactionText("title")}</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						{transactionText("description")}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={async (e) => {
						e.preventDefault();
						try {
							const resp = await fetch("/api/stripe/billing-portal", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									customerId: stripeCustomerId,
									returnUrl: window.location.href,
								}),
							});
							const data = await resp.json();
							window.location.href = data?.url ?? "/settings/credits";
						} catch {
							window.location.href = "/settings/credits";
						}
					}}
				>
					{transactionText("managePaymentMethods")}
					<ExternalLink className="h-4 w-4 ml-1" />
				</Button>
			</div>

			<div className="rounded-md border">
				<div className="w-full overflow-x-auto">
					<Table className="text-xs">
						<TableHeader>
							<TableRow className="h-9">
								<TableHead className="w-[220px]">{transactionText("timestamp")}</TableHead>
								<TableHead className="w-[130px]">{transactionText("amount")}</TableHead>
								<TableHead className="w-[170px]">{transactionText("reason")}</TableHead>
								<TableHead className="w-[140px]">{transactionText("status")}</TableHead>
								<TableHead className="w-[150px]">{transactionText("balance")}</TableHead>
								<TableHead className="w-[120px]">{transactionText("actions")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{transactions.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="py-8 text-center text-sm text-muted-foreground"
									>
										{transactionText("noCreditsPurchased")}
									</TableCell>
								</TableRow>
							) : (
								pageItems.map((t) => {
										const { label, className, icon } = statusChip(t.status, t.kind, statusLabel);
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
												reason: "refundInProgress",
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
																{relativeNowMs
																	? formatDisplayTimestamp(createdAtDate, preferences, new Date(relativeNowMs))
																	: formatDisplayDateTime(createdAtDate, preferences)}
															</span>
														</HoverCardTrigger>
														<HoverCardContent align="start" className="w-auto">
															<div className="grid gap-2 text-xs">
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">{userTimeZone}</div>
																	<div className="font-mono">
															{formatDateTime(createdAtDate, userTimeZone, preferences)}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">UTC</div>
																	<div className="font-mono">
															{formatDateTime(createdAtDate, "UTC", preferences)}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">{transactionText("relative")}</div>
																	<div className="font-mono">
																		{relativeNowMs
																			? formatRelativeDate(createdAtDate, relativeNowMs, locale)
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
														{amountPill(t.amount_nanos ?? 0, currency, preferences)}
											</TableCell>
											<TableCell className="py-2">{kindBadge(t.kind, kindLabel)}</TableCell>
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
																	{formatNanos(after, currency, preferences)}
															</span>
														</HoverCardTrigger>
														<HoverCardContent align="start" className="w-64">
															<div className="space-y-3 text-xs">
																<div>
																	<div className="font-medium text-foreground">
																{transactionText("balanceMovement")}
																	</div>
																	<p className="mt-0.5 text-muted-foreground">
																	{transactionText("balanceAfterSettlement")}
																	</p>
																</div>
																<div className="grid gap-2">
																	<div className="flex items-center justify-between gap-4">
																		<span className="text-muted-foreground">{transactionText("before")}</span>
																		<span className="font-mono font-medium tabular-nums">
																			{before !== null ? formatNanos(before, currency, preferences) : "-"}
																		</span>
																	</div>
																	<div className="flex items-center justify-between gap-4">
																		<span className="text-muted-foreground">{transactionText("change")}</span>
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
																			{formatSignedNanos(amountNanos, currency, preferences)}
																		</span>
																	</div>
																	<div className="flex items-center justify-between gap-4 border-t pt-2">
																		<span className="text-muted-foreground">{transactionText("after")}</span>
																		<span className="font-mono font-semibold tabular-nums text-foreground">
																			{formatNanos(after, currency, preferences)}
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
																	className="h-auto p-0 text-xs text-foreground underline underline-offset-2 hover:text-foreground"
															disabled={busy}
															onClick={() => openDocument(t)}
														>
														{transactionText("receipt")}
														</Button>
														<Button
															size="sm"
															variant="link"
																	className="h-auto p-0 text-xs text-foreground underline underline-offset-2 hover:text-foreground"
															disabled={busy || !refundEligibility.ok}
																title={refundEligibility.ok
																	? transactionText("refundThisPurchase")
																	: refundEligibility.reason
																		? transactionText(`refundEligibility.${refundEligibility.reason}`)
																		: undefined}
															onClick={() => {
																setRefundDialogTx(t);
																setRefundReason("no_comment");
															}}
														>
															{transactionText("refund")}
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
						<DialogTitle>{transactionText("requestTitle")}</DialogTitle>
						<DialogDescription>
							{transactionText("requestDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<p className="text-xs text-muted-foreground">
							{transactionText("optionalReason")}
						</p>
						<Select
							value={refundReason}
							onValueChange={(value) =>
								setRefundReason(value as RefundReasonValue)
							}
							disabled={Boolean(refundDialogTx && actionBusy[refundDialogTx.id])}
						>
							<SelectTrigger>
								<SelectValue placeholder={transactionText("refundReason.no_comment")} />
							</SelectTrigger>
							<SelectContent>
								{REFUND_REASON_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{transactionText(`refundReason.${option.value}`)}
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
							{transactionText("cancel")}
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
								? transactionText("submitting")
								: transactionText("submitRefund")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
