"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, CreditCard, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Tile({
    active,
    isDefault,
    children,
    onClick,
    ariaLabel,
}: {
    active?: boolean;
    isDefault?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
}) {
    return (
        <Card
            className={cn(
                "rounded-2xl p-3 text-left transition-all w-full",
                active
                    ? "border-indigo-600 shadow-md"
                    : "border border-zinc-200 hover:shadow-sm hover:translate-y-[-1px] hover:scale-[1.001] hover:bg-white",
                isDefault ? "ring-1 ring-indigo-50" : "bg-white"
            )}
        >
            <button
                type="button"
                role="radio"
                aria-checked={!!active}
                aria-label={ariaLabel}
                onClick={onClick}
                className="w-full text-left p-0"
            >
                {children}
            </button>
        </Card>
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
    const [selected, setSelected] = useState<string | "new" | null>(value);
    useEffect(() => {
        setSelected(value);
    }, [value]);

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
                <Link href="/settings/payment-methods" className="text-xs underline">
                    Manage
                </Link>
            </div>

            <div role="radiogroup" aria-label="Select payment method" className="grid grid-cols-1 items-start gap-3">
                {sortedMethods.map((pm: any) => {
                    const active = selected === pm.id;
                    const brand = pm.card?.brand ?? "Card";
                    const last4 = pm.card?.last4 ?? "****";
                    const isDefault = defaultId === pm.id;

                    return (
                        <Tile
                            key={pm.id}
                            active={active}
                            isDefault={isDefault}
                            onClick={() => {
                                onChange(pm.id);
                                setSelected(pm.id);
                            }}
                            ariaLabel={`${brand} ending ${last4}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg bg-zinc-50 p-2 flex items-center justify-center shadow-sm">
                                        <CreditCard className="h-5 w-5 text-zinc-700" />
                                    </div>

                                    <div className="leading-tight">
                                        <div className="text-sm text-zinc-800 font-medium capitalize">****{last4}</div>
                                        <div className="text-xs text-zinc-500 capitalize">
                                            {brand}
                                            {pm.card?.exp_month && pm.card?.exp_year
                                                ? ` - Expires ${String(pm.card.exp_month).padStart(2, "0")}/${String(
                                                      pm.card.exp_year
                                                  ).slice(-2)}`
                                                : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {isDefault && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                                            Default
                                        </span>
                                    )}

                                    {active ? (
                                        <span className="inline-flex items-center rounded-full bg-indigo-600 p-1">
                                            <Check className="h-3 w-3 text-white" />
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full bg-zinc-100 p-1">
                                            <Check className="h-3 w-3 text-transparent" />
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Tile>
                    );
                })}

                <Tile
                    active={selected === "new"}
                    onClick={() => {
                        onChange("new");
                        setSelected("new");
                    }}
                    ariaLabel="Use a new card"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-zinc-50 p-2 flex items-center justify-center shadow-sm">
                                <ShieldCheck className="h-5 w-5 text-zinc-700" />
                            </div>

                            <div className="leading-tight">
                                <div className="text-sm text-zinc-800 font-medium">Use a new card</div>
                                <div className="text-xs text-zinc-500">Pay with a new card at checkout</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {selected === "new" ? (
                                <span className="inline-flex items-center rounded-full bg-indigo-600 p-1">
                                    <Check className="h-3 w-3 text-white" />
                                </span>
                            ) : (
                                <span className="inline-flex items-center rounded-full bg-zinc-100 p-1">
                                    <Check className="h-3 w-3 text-transparent" />
                                </span>
                            )}
                        </div>
                    </div>
                </Tile>
            </div>
        </div>
    );
}
