// Which hovered links open an entity card. The card system is opt-out: any
// link whose href is an entity page qualifies unless one of these applies.
import { matchEntityHref, sameEntity, type EntityTarget } from "./matchEntityHref";

/** Put on a link (or any ancestor) to keep entity cards off it. */
export const NO_ENTITY_CARD_ATTRIBUTE = "data-no-entity-card";

/**
 * Places a card would get in the way: site navigation, headers and breadcrumbs,
 * links that already open their own hover card or popover, opted-out areas, and
 * entity cards themselves (`[data-entity-card]`). A card's own links are plain
 * links, as on Pitwall: opening their cards would replace the card being read.
 */
const EXCLUDED_ANCESTORS = [
	`[${NO_ENTITY_CARD_ATTRIBUTE}]`,
	"[data-entity-card]",
	"[data-slot=hover-card-trigger]",
	"[data-slot=popover-trigger]",
	"nav",
	"header",
	"[role=navigation]",
	"[role=banner]",
	"[aria-label*=breadcrumb i]",
	"[data-slot=breadcrumb]",
].join(",");

export type EntityLink = EntityTarget & { element: HTMLAnchorElement };

/**
 * The entity card target for an event target, or null when it is not an
 * eligible entity link. `currentPath` is the page's own path, whose entity
 * never gets a card.
 */
export function entityLinkFromTarget(target: EventTarget | null, currentPath: string, origin?: string): EntityLink | null {
	const element = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
	if (!element) return null;
	if (element.closest(EXCLUDED_ANCESTORS)) return null;
	if (element.getAttribute("aria-current") === "page") return null;
	const entity = matchEntityHref(element.getAttribute("href"), origin);
	if (!entity) return null;
	if (sameEntity(entity, matchEntityHref(currentPath))) return null;
	return { ...entity, element };
}
