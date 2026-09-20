"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { TableCell, TableRow } from "@/components/ui/table";

export function ProviderRouteSeparator({ colSpan, kind = "additional" }: { colSpan: number; kind?: "additional" | "external" }) {
    const [open, setOpen] = useState(false);
    const isExternal = kind === "external";

    return (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell colSpan={colSpan} className="px-3 py-2 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    {isExternal ? "External Providers" : "Additional Routing Options"}
                    <HoverCard open={open} onOpenChange={setOpen}>
                        <HoverCardTrigger asChild>
                            <button
                                type="button"
                                aria-label={isExternal ? "About external providers" : "How to select these routes"}
                                aria-expanded={open}
                                onClick={() => setOpen(!open)}
                                className="inline-flex rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Info className="size-3.5" aria-hidden="true" />
                            </button>
                        </HoverCardTrigger>
                        <HoverCardContent align="start" className="w-80 space-y-3 text-xs font-normal leading-relaxed">
                            {isExternal ? (
                                <>
                                    <p>These listings come from external catalogues. Phaseo does not route to them automatically; routing requires an explicit provider-level override.</p>
                                    <p>Enabling this filter only shows their listings. It does not enable routing to them.</p>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-1">
                                        <p>Choose a regional provider route directly or send your request through a regional API endpoint. When a global equivalent is available, regional routes require this explicit selection.</p>
                                        <a href="/docs/v1/guides/regional-routing" className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200">Configure Regional Routing</a>
                                    </div>
                                    <div className="space-y-1">
                                        <p>For Fast or Flex, specify the tier in your request or select a route dedicated to that tier. Batch requests go through the Batch API.</p>
                                        <a href="/docs/v1/guides/service-tiers" className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200">Choose a Service Tier</a>
                                    </div>
                                </>
                            )}
                        </HoverCardContent>
                    </HoverCard>
                </span>
            </TableCell>
        </TableRow>
    );
}
