"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type PaymentMethodSummary = {
    id: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    funding: string | null;
    created: number | null;
};

type PaymentMethodsPayload = {
    customer: {
        id: string;
        email: string | null;
    };
    defaultPaymentMethodId: string | null;
    paymentMethods: PaymentMethodSummary[];
};

function formatCardBrand(brand: string | null | undefined) {
    if (!brand) return "Unknown";
    return brand.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatExpiry(expMonth: number | null | undefined, expYear: number | null | undefined) {
    if (!expMonth || !expYear) return "-";
    return `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`;
}

function formatDate(unixSeconds: number | null | undefined) {
    if (!unixSeconds) return "-";
    try {
        return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(unixSeconds * 1000));
    } catch {
        return "-";
    }
}

async function readJsonSafe(response: Response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export function PaymentMethodsManager({
    initialData,
	customerPortal,
}: {
    initialData: PaymentMethodsPayload;
	customerPortal?: ReactNode;
}) {
    const [data, setData] = useState<PaymentMethodsPayload>(initialData);
    const [refreshing, setRefreshing] = useState(false);
    const [adding, setAdding] = useState(false);
    const [defaultPendingId, setDefaultPendingId] = useState<string | null>(null);
    const [removePendingId, setRemovePendingId] = useState<string | null>(null);
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

    const paymentMethods = data.paymentMethods ?? [];

    async function refresh() {
        setRefreshing(true);
        try {
            const response = await fetch("/api/stripe/payment-methods", {
                method: "GET",
                cache: "no-store",
            });
            const payload = await readJsonSafe(response);
            if (!response.ok || !payload) {
                throw new Error(payload?.error || "Failed to refresh payment methods");
            }
            setData(payload);
        } catch (error: any) {
            toast.error("Failed to refresh", {
                description: error?.message ?? "Please try again.",
            });
        } finally {
            setRefreshing(false);
        }
    }

    async function setDefault(paymentMethodId: string) {
        setDefaultPendingId(paymentMethodId);
        try {
            const response = await fetch("/api/stripe/payment-methods", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentMethodId }),
            });
            const payload = await readJsonSafe(response);
            if (!response.ok || !payload) {
                throw new Error(payload?.error || "Failed to set default payment method");
            }
            setData(payload);
            toast.success("Default payment method updated");
        } catch (error: any) {
            toast.error("Update failed", {
                description: error?.message ?? "Please try again.",
            });
        } finally {
            setDefaultPendingId(null);
        }
    }

    async function removePaymentMethod(paymentMethodId: string) {
        setRemovePendingId(paymentMethodId);
        try {
            const response = await fetch("/api/stripe/payment-methods", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentMethodId }),
            });
            const payload = await readJsonSafe(response);
            if (!response.ok || !payload) {
                throw new Error(payload?.error || "Failed to remove payment method");
            }
            setData(payload);
            toast.success("Payment method removed");
        } catch (error: any) {
            toast.error("Removal failed", {
                description: error?.message ?? "Please try again.",
            });
        } finally {
            setRemovePendingId(null);
        }
    }

    async function confirmRemove() {
        if (!confirmRemoveId) return;
        const methodId = confirmRemoveId;
        await removePaymentMethod(methodId);
        setConfirmRemoveId(null);
    }

    async function addCard() {
        setAdding(true);
        try {
            const response = await fetch("/api/stripe/payment-methods", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ returnUrl: window.location.href }),
            });
            const payload = await readJsonSafe(response);
            if (!response.ok || !payload?.url) {
                throw new Error(payload?.error || "Failed to start card setup");
            }
            window.location.href = payload.url;
        } catch (error: any) {
            toast.error("Unable to add card", {
                description: error?.message ?? "Please try again.",
            });
            setAdding(false);
        }
    }

    return (
        <div className="space-y-4">
			<div className="grid grid-cols-2 items-center gap-2 border-b pb-4 sm:flex sm:flex-wrap">
				<Button type="button" className="w-full gap-2 sm:w-auto" onClick={addCard} disabled={adding}>
					{adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
					Add Card
				</Button>
				<Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={refresh} disabled={refreshing}>
					{refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
					Refresh
				</Button>
				{customerPortal ? <div className="col-span-2 [&_button]:w-full sm:col-span-1 sm:ml-auto sm:[&_button]:w-auto">{customerPortal}</div> : null}
            </div>

            {paymentMethods.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                    No cards yet. Add one to use it for credits and auto top-ups.
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {paymentMethods.map((pm) => {
                        const isDefault = pm.id === data.defaultPaymentMethodId;
                        const settingDefault = defaultPendingId === pm.id;
                        const removing = removePendingId === pm.id;
                        const busy = settingDefault || removing;
                        return (
                            <article
                                key={pm.id}
                                className="relative isolate aspect-[1.586] w-full max-w-xs overflow-hidden rounded-xl border bg-gradient-to-br from-muted/80 via-background to-muted/40 p-4 shadow-sm"
                            >
								<div className="flex items-start justify-between gap-3">
										<div>
											<div className="font-heading text-sm font-medium">{formatCardBrand(pm.brand)}</div>
											<div className="mt-0.5 text-[10px] text-muted-foreground">Added {formatDate(pm.created)}</div>
										</div>
									{isDefault ? <Badge variant="secondary" className="border bg-background/70 text-[11px]">Default</Badge> : null}
								</div>
								<div className="mt-5 whitespace-nowrap font-mono text-base tracking-[0.12em] text-foreground sm:text-lg" data-pii="true">
									•••• •••• •••• {pm.last4 ?? "••••"}
								</div>
								<div className="absolute inset-x-4 bottom-3.5 flex items-end justify-between gap-3">
									<div className="flex gap-5 text-xs text-muted-foreground">
										<div>
											<div>Expires</div>
											<div className="mt-0.5 text-xs font-medium text-foreground" data-pii="true">{formatExpiry(pm.expMonth, pm.expYear)}</div>
										</div>
										{pm.funding ? <div><div>Card type</div><div className="mt-0.5 text-xs font-medium capitalize text-foreground">{pm.funding}</div></div> : null}
									</div>
									<div className="flex items-center gap-1.5">
										{!isDefault ? (
											<Button type="button" variant="secondary" size="xs" disabled={busy} onClick={() => setDefault(pm.id)}>
												{settingDefault ? <Loader2 className="size-3.5 animate-spin" /> : "Set default"}
											</Button>
										) : null}
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											disabled={busy}
											className="text-destructive hover:bg-destructive/10 hover:text-destructive"
											onClick={() => setConfirmRemoveId(pm.id)}
											aria-label={`Remove ${formatCardBrand(pm.brand)} ending ${pm.last4 ?? "unknown"}`}
										>
											{removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
										</Button>
									</div>
								</div>
                            </article>
                        );
                    })}
                </div>
            )}

            <p className="text-xs leading-5 text-muted-foreground">
                Cards are stored securely by Stripe. Use Customer Portal for billing details and other advanced changes.
            </p>

            <Dialog
                open={Boolean(confirmRemoveId)}
                onOpenChange={(open) => {
                    if (!open && !removePendingId) setConfirmRemoveId(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove payment method?</DialogTitle>
                        <DialogDescription>
                            {(() => {
                                const selected = paymentMethods.find((pm) => pm.id === confirmRemoveId);
                                if (!selected) return "This payment method will no longer be available for credits and auto top-ups.";
                                return (
                                    <>
                                        {formatCardBrand(selected.brand)} ending{" "}
                                        <span data-pii="true">
                                            {selected.last4 ?? "****"}
                                        </span>{" "}
                                        will no longer be available for credits and auto top-ups.
                                    </>
                                );
                            })()}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmRemoveId(null)}
                            disabled={Boolean(removePendingId)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmRemove}
                            disabled={Boolean(removePendingId)}
                        >
                            {removePendingId ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Removing...
                                </span>
                            ) : (
                                "Remove"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
