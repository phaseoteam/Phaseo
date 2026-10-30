"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getLocalizedDocsHref } from "@/lib/docs";
import { Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { TableCell, TableRow } from "@/components/ui/table";

export function ProviderRouteSeparator({ colSpan, kind = "additional" }: { colSpan: number; kind?: "additional" | "external" }) {
    const [open, setOpen] = useState(false);
    const t = useTranslations("Catalogue.modelDetail.routeHelp");
    const locale = useLocale();
    const isExternal = kind === "external";

    return (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell colSpan={colSpan} className="px-3 py-2 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    {isExternal ? t("external") : t("additional")}
                    <HoverCard open={open} onOpenChange={setOpen}>
                        <HoverCardTrigger asChild>
                            <button
                                type="button"
                                aria-label={isExternal ? t("aboutExternal") : t("selectRoutes")}
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
                                    <p>{t("externalOverride")}</p>
                                    <p>{t("filterOnly")}</p>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-1">
                                        <p>{t("regional")}</p>
                                        <a href={getLocalizedDocsHref(locale, "/docs/v1/guides/regional-routing")} className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200">{t("configureRegional")}</a>
                                    </div>
                                    <div className="space-y-1">
                                        <p>{t("tiers")}</p>
                                        <a href={getLocalizedDocsHref(locale, "/docs/v1/guides/service-tiers")} className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200">{t("chooseTier")}</a>
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
