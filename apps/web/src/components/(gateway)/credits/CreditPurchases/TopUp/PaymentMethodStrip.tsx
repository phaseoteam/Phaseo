"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, CreditCard, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCardBrand } from "./cardBrand";

function Tile({
    active,
    children,
    onClick,
    ariaLabel,
}: {
    active?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={Boolean(active)}
            aria-label={ariaLabel}
            onClick={onClick}
            className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                active
                    ? "border-primary/55 bg-primary/8 ring-1 ring-primary/20"
                    : "border-border bg-muted/20 hover:border-foreground/20 hover:bg-muted/45"
            )}
        >
            {children}
        </button>
    );
}

export default function PaymentMethodStrip({
    stripeInfo,
    value,
    onChange,
}: {
    stripeInfo?: any;
    value: string | "new" | null;
    onChange: (v: string | "new") => void;
}) {
	const router = useRouter();
    const methods: Array<{
        id: string;
        card?: {
            brand?: string | null;
            last4?: string | null;
            exp_month?: number | null;
            exp_year?: number | null;
        };
    }> = stripeInfo?.paymentMethods ?? [];

    const defaultId = stripeInfo?.defaultPaymentMethodId ?? null;
    const sortedMethods = [...methods].sort((a, b) => {
        if (a.id === defaultId && b.id !== defaultId) return -1;
        if (b.id === defaultId && a.id !== defaultId) return 1;
        return 0;
    });

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Payment method</div>
                <Link
					href="/settings/payment-methods"
					prefetch
					onFocus={() => router.prefetch("/settings/payment-methods")}
					onPointerEnter={() => router.prefetch("/settings/payment-methods")}
					className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
				>
                    Manage
                </Link>
            </div>

            <div role="radiogroup" aria-label="Select payment method" className="grid grid-cols-1 items-start gap-3">
                {sortedMethods.map((pm: any) => {
                    const active = value === pm.id;
                    const brand = formatCardBrand(pm.card?.brand);
                    const last4 = pm.card?.last4 ?? "****";
                    const isDefault = defaultId === pm.id;

                    return (
                        <Tile
                            key={pm.id}
                            active={active}
                            onClick={() => onChange(pm.id)}
                            ariaLabel={`${brand} ending ${last4}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center rounded-md border bg-background p-2 text-muted-foreground shadow-sm">
                                        <CreditCard className="size-5" />
                                    </div>

                                    <div className="leading-tight">
                                        <div className="text-sm font-medium capitalize text-foreground">
                                            <span data-pii="true">****{last4}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {brand}
                                            {pm.card?.exp_month && pm.card?.exp_year
                                                ? (
                                                    <span data-pii="true">
                                                        {" "}
                                                        - Expires{" "}
                                                        {String(pm.card.exp_month).padStart(2, "0")}/
                                                        {String(pm.card.exp_year).slice(-2)}
                                                    </span>
                                                )
                                                : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {isDefault && (
                                        <span className="rounded-md border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                            Default
                                        </span>
                                    )}

                                    {active ? (
                                        <span className="inline-flex items-center rounded-full bg-primary p-1 text-primary-foreground">
                                            <Check className="size-3" />
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full border border-border bg-muted p-1">
                                            <Check className="size-3 text-transparent" />
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Tile>
                    );
                })}

                <Tile
                    active={value === "new"}
                    onClick={() => onChange("new")}
                    ariaLabel="Use a new card"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center rounded-md border bg-background p-2 text-muted-foreground shadow-sm">
                                <ShieldCheck className="size-5" />
                            </div>

                            <div className="leading-tight">
                                <div className="text-sm font-medium text-foreground">Use a new card</div>
                                <div className="text-xs text-muted-foreground">Pay with a new card at checkout</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {value === "new" ? (
                                <span className="inline-flex items-center rounded-full bg-primary p-1 text-primary-foreground">
                                    <Check className="size-3" />
                                </span>
                            ) : (
                                <span className="inline-flex items-center rounded-full border border-border bg-muted p-1">
                                    <Check className="size-3 text-transparent" />
                                </span>
                            )}
                        </div>
                    </div>
                </Tile>
            </div>
        </div>
    );
}
