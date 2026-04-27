"use client";

import * as React from "react";
import { toast } from "sonner";
import {
	ExternalLink,
	FileText,
	ReceiptText,
	Calendar,
	BadgeCheck,
	CircleDollarSign,
} from "lucide-react";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";

type InvoiceRow = {
	id: string;
	period_start: string;
	period_end: string;
	amount_nanos: number;
	currency?: string | null;
	status: InvoiceStatus;
	stripe_invoice_id?: string | null;
	stripe_invoice_number?: string | null;
	due_at?: string | null;
	issued_at?: string | null;
	paid_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
};

function formatNanos(nanos: number, currency = "USD") {
	const amount = Number(nanos ?? 0) / 1_000_000_000;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency}`;
	}
}

function shortDate(value?: string | null) {
	if (!value) return "-";
	const d = new Date(value);
	if (!Number.isFinite(d.getTime())) return "-";
	return d.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
	});
}

function longDate(value?: string | null) {
	if (!value) return "-";
	const d = new Date(value);
	if (!Number.isFinite(d.getTime())) return "-";
	return d.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatPeriod(start: string, end: string) {
	return `${shortDate(start)} to ${shortDate(end)}`;
}

function statusMeta(status: InvoiceStatus) {
	switch (status) {
		case "paid":
			return {
				label: "Paid",
				className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
			};
		case "open":
			return {
				label: "Open",
				className: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
			};
		case "void":
			return {
				label: "Void",
				className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
			};
		case "uncollectible":
			return {
				label: "Uncollectible",
				className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
			};
		default:
			return {
				label: "Draft",
				className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
			};
	}
}

export default function EnterpriseInvoices(props: {
	invoices: InvoiceRow[];
	pageSize?: number;
}) {
	const { invoices, pageSize = 10 } = props;
	const [page, setPage] = React.useState(0);
	const [selectedInvoice, setSelectedInvoice] = React.useState<InvoiceRow | null>(null);
	const [busyInvoiceId, setBusyInvoiceId] = React.useState<string | null>(null);

	const totalPages = Math.max(1, Math.ceil(invoices.length / pageSize));
	const currentPage = Math.min(page, totalPages - 1);

	React.useEffect(() => {
		if (page > totalPages - 1) {
			setPage(totalPages - 1);
		}
	}, [page, totalPages]);

	const visible = React.useMemo(() => {
		const start = currentPage * pageSize;
		return invoices.slice(start, start + pageSize);
	}, [invoices, currentPage, pageSize]);

	const openInvoiceDocument = React.useCallback(async (stripeInvoiceId: string) => {
		setBusyInvoiceId(stripeInvoiceId);
		try {
			const res = await fetch("/api/stripe/invoices/document", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ stripeInvoiceId }),
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok || !payload?.url) {
				throw new Error(payload?.error ?? "Unable to load invoice document");
			}
			window.open(String(payload.url), "_blank", "noopener,noreferrer");
		} catch (err: any) {
			toast.error(err?.message ?? "Failed to open invoice document");
		} finally {
			setBusyInvoiceId(null);
		}
	}, []);

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							<ReceiptText className="h-5 w-5" />
							Invoice history
						</CardTitle>
						<p className="mt-1 text-xs text-muted-foreground">
							Track issued invoices, statuses, due dates, and open detailed records.
						</p>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{invoices.length === 0 ? (
					<div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
						No invoices yet. Your first invoice appears once a billing cycle closes.
					</div>
				) : (
					<div className="w-full overflow-x-auto">
						<table className="w-full text-sm table-fixed border-collapse">
							<thead>
								<tr className="text-left text-xs text-muted-foreground">
									<th className="py-2 pr-4 w-44">Invoice</th>
									<th className="py-2 pr-4 w-64">Period</th>
									<th className="py-2 pr-4 w-32">Status</th>
									<th className="py-2 pr-4 w-32">Issued</th>
									<th className="py-2 pr-4 w-32">Due</th>
									<th className="py-2 pr-4 w-36 text-right">Amount</th>
									<th className="py-2 pl-4 w-44 text-right">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{visible.map((row) => {
									const meta = statusMeta(row.status);
									const invoiceLabel = row.stripe_invoice_number || row.stripe_invoice_id || row.id;
									const canOpenInvoice = Boolean(row.stripe_invoice_id);
									const isBusy = busyInvoiceId === row.stripe_invoice_id;
									return (
										<tr key={row.id}>
											<td className="py-3 pr-4">
												<div className="font-medium truncate" title={invoiceLabel}>{invoiceLabel}</div>
												<div className="text-xs text-muted-foreground truncate">{row.stripe_invoice_id ?? "Internal invoice"}</div>
											</td>
											<td className="py-3 pr-4">
												<div className="truncate" title={formatPeriod(row.period_start, row.period_end)}>
													{formatPeriod(row.period_start, row.period_end)}
												</div>
											</td>
											<td className="py-3 pr-4">
												<span
													className={cn(
														"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
														meta.className,
													)}
												>
													{meta.label}
												</span>
											</td>
											<td className="py-3 pr-4 text-muted-foreground">{shortDate(row.issued_at)}</td>
											<td className="py-3 pr-4 text-muted-foreground">{shortDate(row.due_at)}</td>
											<td className="py-3 pr-4 text-right font-medium">
												{formatNanos(row.amount_nanos, String(row.currency ?? "USD"))}
											</td>
											<td className="py-3 pl-4">
												<div className="flex items-center justify-end gap-2">
													<Button
														size="sm"
														variant="outline"
														onClick={() => setSelectedInvoice(row)}
													>
														Details
													</Button>
													<Button
														size="sm"
														variant="outline"
														disabled={!canOpenInvoice || Boolean(isBusy)}
														onClick={() =>
															row.stripe_invoice_id
																? openInvoiceDocument(row.stripe_invoice_id)
																: null
														}
													>
														{isBusy ? "Opening..." : "Invoice"}
														<ExternalLink className="ml-1 h-3.5 w-3.5" />
													</Button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}

				{invoices.length > pageSize ? (
					<div className="mt-6 flex items-center justify-center">
						<Pagination>
							<PaginationContent>
								<PaginationItem>
									<PaginationPrevious
										href="#"
										onClick={(e) => {
											e.preventDefault();
											setPage(Math.max(0, currentPage - 1));
										}}
									/>
								</PaginationItem>

								{totalPages <= 7 ? (
									Array.from({ length: totalPages }).map((_, i) => (
										<PaginationItem key={i}>
											<PaginationLink
												href="#"
												isActive={currentPage === i}
												onClick={(e) => {
													e.preventDefault();
													setPage(i);
												}}
											>
												{i + 1}
											</PaginationLink>
										</PaginationItem>
									))
								) : (
									<>
										<PaginationItem>
											<PaginationLink
												href="#"
												isActive={currentPage === 0}
												onClick={(e) => {
													e.preventDefault();
													setPage(0);
												}}
											>
												1
											</PaginationLink>
										</PaginationItem>

										{currentPage > 2 ? (
											<PaginationItem>
												<PaginationEllipsis />
											</PaginationItem>
										) : null}

										{[Math.max(1, currentPage - 1), currentPage, Math.min(totalPages - 2, currentPage + 1)]
											.filter((value, idx, arr) => value >= 1 && value <= totalPages - 2 && arr.indexOf(value) === idx)
											.map((p) => (
												<PaginationItem key={p}>
													<PaginationLink
														href="#"
														isActive={currentPage === p}
														onClick={(e) => {
															e.preventDefault();
															setPage(p);
														}}
													>
														{p + 1}
													</PaginationLink>
												</PaginationItem>
											))}

										{currentPage < totalPages - 3 ? (
											<PaginationItem>
												<PaginationEllipsis />
											</PaginationItem>
										) : null}

										<PaginationItem>
											<PaginationLink
												href="#"
												isActive={currentPage === totalPages - 1}
												onClick={(e) => {
													e.preventDefault();
													setPage(totalPages - 1);
												}}
											>
												{totalPages}
											</PaginationLink>
										</PaginationItem>
									</>
								)}

								<PaginationItem>
									<PaginationNext
										href="#"
										onClick={(e) => {
											e.preventDefault();
											setPage(Math.min(totalPages - 1, currentPage + 1));
										}}
									/>
								</PaginationItem>
							</PaginationContent>
						</Pagination>
					</div>
				) : null}
			</CardContent>

			<Dialog open={Boolean(selectedInvoice)} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<FileText className="h-4 w-4" />
							Invoice details
						</DialogTitle>
						<DialogDescription>
							Detailed billing record for this enterprise invoice.
						</DialogDescription>
					</DialogHeader>
					{selectedInvoice ? (
						<div className="space-y-3 text-sm">
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Invoice number</div>
									<div className="mt-1 font-medium">{selectedInvoice.stripe_invoice_number ?? "-"}</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Status</div>
									<div className="mt-1 inline-flex items-center gap-2">
										<BadgeCheck className="h-4 w-4 text-muted-foreground" />
										{statusMeta(selectedInvoice.status).label}
									</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Billing period</div>
									<div className="mt-1 font-medium">{formatPeriod(selectedInvoice.period_start, selectedInvoice.period_end)}</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Amount</div>
									<div className="mt-1 flex items-center gap-2 font-medium">
										<CircleDollarSign className="h-4 w-4 text-muted-foreground" />
										{formatNanos(selectedInvoice.amount_nanos, String(selectedInvoice.currency ?? "USD"))}
									</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Issued</div>
									<div className="mt-1 flex items-center gap-2 font-medium">
										<Calendar className="h-4 w-4 text-muted-foreground" />
										{longDate(selectedInvoice.issued_at)}
									</div>
								</div>
								<div className="rounded-md border p-3">
									<div className="text-xs text-muted-foreground">Due</div>
									<div className="mt-1 flex items-center gap-2 font-medium">
										<Calendar className="h-4 w-4 text-muted-foreground" />
										{longDate(selectedInvoice.due_at)}
									</div>
								</div>
								<div className="rounded-md border p-3 sm:col-span-2">
									<div className="text-xs text-muted-foreground">Stripe invoice ID</div>
									<div className="mt-1 font-mono text-xs break-all">{selectedInvoice.stripe_invoice_id ?? "-"}</div>
								</div>
							</div>
						</div>
					) : null}
					<DialogFooter>
						<Button variant="outline" onClick={() => setSelectedInvoice(null)}>
							Close
						</Button>
						<Button
							onClick={() =>
								selectedInvoice?.stripe_invoice_id
									? openInvoiceDocument(selectedInvoice.stripe_invoice_id)
									: null
							}
							disabled={!selectedInvoice?.stripe_invoice_id || busyInvoiceId === selectedInvoice?.stripe_invoice_id}
						>
							{busyInvoiceId === selectedInvoice?.stripe_invoice_id ? "Opening..." : "Open invoice"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
