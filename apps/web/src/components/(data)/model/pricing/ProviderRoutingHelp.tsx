import { useLocale, useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { getLocalizedDocsHref } from "@/lib/docs";
import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Info } from "lucide-react";
import {
    HoverCard,
    HoverCardContent,
    HoverCardHeader,
    HoverCardLinks,
    HoverCardNote,
    HoverCardTrigger,
} from "@/components/ui/hover-card";

/**
 * A hover card that a click pins open: hover and focus open it as usual, a
 * click keeps it open after the pointer leaves, and Escape closes it and
 * returns focus to the trigger.
 */
export function usePinnableHoverCard(triggerRef: RefObject<HTMLButtonElement | null>) {
    const [open, setOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    const onOpenChange = (nextOpen: boolean, details: { reason?: string }) => {
        if (!nextOpen && pinned && (details.reason === "trigger-hover" || details.reason === "trigger-focus")) return;
        if (!nextOpen) setPinned(false);
        setOpen(nextOpen);
    };
    const pin = () => {
        setPinned(true);
        setOpen(true);
    };
    const onContentKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setPinned(false);
        triggerRef.current?.focus();
        setOpen(false);
    };
    return { open, onOpenChange, pin, onContentKeyDown };
}

export function ProviderRoutingHelp() {
    const tx = useTranslations();
    const locale = useLocale();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const card = usePinnableHoverCard(triggerRef);

    return (
        <HoverCard open={card.open} onOpenChange={card.onOpenChange}>
            <HoverCardTrigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    aria-label={tx("Common.ui.pricingEditorCopy.aboutProviderSpecificRouting" as never)}
                    aria-expanded={card.open}
                    onClick={card.pin}
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                    <Info aria-hidden="true" className="size-3" />
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                align="end"
                className="w-[min(18rem,calc(100vw-2rem))] space-y-2.5 font-sans"
                onKeyDown={card.onContentKeyDown}
            >
                <HoverCardHeader title={tx("Common.ui.pricingEditorCopy.providerSpecificRouting" as never)} />
                <HoverCardNote>
                    {tx.rich("Common.ui.pricingEditorCopy.passThisSlugInTheModelFieldOfYourAPIRequestToPinItToThisProvider", { model: () => <code>model</code> })}
                </HoverCardNote>
                <HoverCardLinks>
                    <Link href={getLocalizedDocsHref(locale, "v1/guides/provider-qualified-models")}>
                        {tx("Catalogue.modelDetail.sections.readRoutingDocs" as never)}
                    </Link>
                </HoverCardLinks>
            </HoverCardContent>
        </HoverCard>
    );
}
