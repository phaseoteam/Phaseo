import { useRef } from "react";
import { useLocale, useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { getLocalizedDocsHref } from "@/lib/docs";
import { Info } from "lucide-react";
import {
    HoverCard,
    HoverCardContent,
    HoverCardHeader,
    HoverCardNote,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { TableCell, TableRow } from "@/components/ui/table";
import { usePinnableHoverCard } from "./ProviderRoutingHelp";

const LINK_CLASS = "text-foreground underline decoration-border underline-offset-2 hover:decoration-current";

export function ProviderRouteSeparator({ colSpan, kind = "additional" }: { colSpan: number; kind?: "additional" | "external" }) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const card = usePinnableHoverCard(triggerRef);
    const t = useTranslations("Catalogue.modelDetail.routeHelp");
    const locale = useLocale();
    const isExternal = kind === "external";
    const title = isExternal ? t("external") : t("additional");

    return (
        <TableRow className="bg-muted/40 hover:bg-muted/40 max-sm:block">
            <TableCell colSpan={colSpan} className="px-3 py-2 text-xs font-medium text-muted-foreground max-sm:block">
                <span className="inline-flex items-center gap-1.5">
                    {title}
                    <HoverCard open={card.open} onOpenChange={card.onOpenChange}>
                        <HoverCardTrigger asChild>
                            <button
                                ref={triggerRef}
                                type="button"
                                aria-label={isExternal ? t("aboutExternal") : t("selectRoutes")}
                                aria-expanded={card.open}
                                onClick={card.pin}
                                className="inline-flex rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Info className="size-3.5" aria-hidden="true" />
                            </button>
                        </HoverCardTrigger>
                        <HoverCardContent
                            align="start"
                            className="w-80 space-y-2.5 font-normal"
                            onKeyDown={card.onContentKeyDown}
                        >
                            <HoverCardHeader title={title} />
                            {isExternal ? (
                                <>
                                    <HoverCardNote>{t("externalOverride")}</HoverCardNote>
                                    <HoverCardNote>{t("filterOnly")}</HoverCardNote>
                                </>
                            ) : (
                                <>
                                    <HoverCardNote>
                                        {t("regional")}{" "}
                                        <Link href={getLocalizedDocsHref(locale, "/docs/v1/guides/regional-routing")} className={LINK_CLASS}>{t("configureRegional")}</Link>
                                    </HoverCardNote>
                                    <HoverCardNote>
                                        {t("tiers")}{" "}
                                        <Link href={getLocalizedDocsHref(locale, "/docs/v1/guides/service-tiers")} className={LINK_CLASS}>{t("chooseTier")}</Link>
                                    </HoverCardNote>
                                </>
                            )}
                        </HoverCardContent>
                    </HoverCard>
                </span>
            </TableCell>
        </TableRow>
    );
}
