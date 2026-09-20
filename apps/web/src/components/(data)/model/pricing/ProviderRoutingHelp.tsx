"use client";

import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function ProviderRoutingHelp() {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const pinnedRef = useRef(false);

    return (
        <HoverCard open={open} onOpenChange={(nextOpen, details) => {
            if (!nextOpen && pinnedRef.current && (details.reason === "trigger-hover" || details.reason === "trigger-focus")) return;
            if (!nextOpen) pinnedRef.current = false;
            setOpen(nextOpen);
        }}>
            <HoverCardTrigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    aria-label="About provider-specific routing"
                    aria-expanded={open}
                    onClick={() => {
                        pinnedRef.current = true;
                        setOpen(true);
                    }}
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                    <Info aria-hidden="true" className="size-3" />
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                align="end"
                className="w-[min(18rem,calc(100vw-2rem))] rounded-xl p-3 font-sans"
                onKeyDown={event => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    event.stopPropagation();
                    pinnedRef.current = false;
                    triggerRef.current?.focus();
                    setOpen(false);
                }}
            >
                <p className="text-xs font-semibold text-foreground">Provider-specific routing</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Pass this slug in the <code>model</code> field of your API request to pin it to this provider.
                </p>
                <a href="/docs/v1/guides/provider-qualified-models" className="mt-2 inline-block text-xs font-medium text-foreground underline underline-offset-4 hover:text-foreground">
                    Read the routing docs
                </a>
            </HoverCardContent>
        </HoverCard>
    );
}
