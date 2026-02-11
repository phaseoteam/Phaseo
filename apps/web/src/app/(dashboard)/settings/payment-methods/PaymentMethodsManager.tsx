"use client";

import { useState } from "react";
import { Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
}: {
    initialData: PaymentMethodsPayload;
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
            <div className="flex flex-wrap gap-2">
                <Button type="button" className="gap-2" onClick={addCard} disabled={adding}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Card
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={refresh} disabled={refreshing}>
                    {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    Refresh
                </Button>
            </div>

            {paymentMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No card payment methods found yet. Add one here and it will be available for credits and auto top-ups.
                </p>
            ) : (
                <div className="space-y-3">
                    {paymentMethods.map((pm) => {
                        const isDefault = pm.id === data.defaultPaymentMethodId;
                        const settingDefault = defaultPendingId === pm.id;
                        const removing = removePendingId === pm.id;
                        const busy = settingDefault || removing;
                        return (
                            <div
                                key={pm.id}
                                className="flex flex-col gap-3 rounded-lg border border-border bg-background/60 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-foreground">
                                            {formatCardBrand(pm.brand)} ending {pm.last4 ?? "****"}
                                        </span>
                                        {isDefault ? (
                                            <Badge variant="secondary" className="text-[11px]">
                                                Default
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Expires {formatExpiry(pm.expMonth, pm.expYear)}
                                    </div>
                                    {pm.funding ? (
                                        <div className="text-xs text-muted-foreground uppercase">{pm.funding}</div>
                                    ) : null}
                                    <div className="text-xs text-muted-foreground">Added {formatDate(pm.created)}</div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {!isDefault ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => setDefault(pm.id)}
                                        >
                                            {settingDefault ? (
                                                <span className="inline-flex items-center gap-2">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    Setting...
                                                </span>
                                            ) : (
                                                "Set Default"
                                            )}
                                        </Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={busy}
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() => setConfirmRemoveId(pm.id)}
                                    >
                                        {removing ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                Removing...
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Remove
                                            </span>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Separator className="my-4" />
            <p className="text-xs text-muted-foreground">
                You can add cards, set defaults, and remove cards directly here. Use Stripe Portal only for advanced billing/profile changes.
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
                                return `${formatCardBrand(selected.brand)} ending ${selected.last4 ?? "****"} will no longer be available for credits and auto top-ups.`;
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
