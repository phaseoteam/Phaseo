// The one card the page shows, positioned against the hovered link. Loaded on
// the first hover (see EntityCards), so Base UI's preview card and the views
// stay out of the initial bundle.
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n/react";
import type { EntityCard } from "./entityCardData";
import { EntityCardView } from "./EntityCardViews";

export default function EntityCardPopup({
	anchor,
	open,
	card,
	onClose,
	onClosed,
}: {
	/** The link's box; kept while the card closes. */
	anchor: PreviewCardPrimitive.Positioner.Props["anchor"];
	open: boolean;
	/** undefined while loading. */
	card: EntityCard | null | undefined;
	onClose: () => void;
	/** The card has finished closing, exit animation included. */
	onClosed: () => void;
}) {
	const t = useTranslations("Catalogue.entityCards");
	return (
		<PreviewCardPrimitive.Root
			open={open}
			onOpenChange={(next) => !next && onClose()}
			onOpenChangeComplete={(next) => !next && onClosed()}
		>
			<PreviewCardPrimitive.Portal>
				<PreviewCardPrimitive.Positioner
					anchor={anchor}
					side="bottom"
					align="start"
					sideOffset={6}
					collisionPadding={12}
					className="isolate z-[100]"
				>
					<PreviewCardPrimitive.Popup
						data-entity-card=""
						data-slot="entity-card"
						className="w-80 max-w-[calc(100vw-24px)] origin-(--transform-origin) rounded-md bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none dark:ring-foreground/10"
					>
						{card ? (
							<EntityCardView card={card} />
						) : (
							<div data-slot="entity-card-loading" className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
								<Spinner className="size-3.5 motion-reduce:animate-none" />
								{t("loading")}
							</div>
						)}
					</PreviewCardPrimitive.Popup>
				</PreviewCardPrimitive.Positioner>
			</PreviewCardPrimitive.Portal>
		</PreviewCardPrimitive.Root>
	);
}
