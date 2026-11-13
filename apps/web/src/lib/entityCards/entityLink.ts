// Which hovered links open an entity card. The card system is opt-out: any
// link whose href is an entity page qualifies unless one of these applies.
import { matchEntityHref, sameEntity, type EntityTarget } from "./matchEntityHref";

/** Put on a link (or any ancestor) to keep entity cards off it. */
export const NO_ENTITY_CARD_ATTRIBUTE = "data-no-entity-card";

/**
 * Places a card would get in the way: site navigation, headers and breadcrumbs,
 * links that already open their own hover card or popover, and opted-out areas.
 * Entity cards render in `[data-entity-card]`, which is never excluded: links in
 * the first card open a second card beside it. Links in that second card
 * (`[data-entity-card-nested]`) are plain links, so cards go one level deep.
 */
const EXCLUDED_ANCESTORS = [
	`[${NO_ENTITY_CARD_ATTRIBUTE}]`,
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
	const card = element.closest("[data-entity-card]");
	if (card ? card.hasAttribute("data-entity-card-nested") || element.closest(`[${NO_ENTITY_CARD_ATTRIBUTE}]`) : element.closest(EXCLUDED_ANCESTORS)) {
		return null;
	}
	if (element.getAttribute("aria-current") === "page") return null;
	const entity = matchEntityHref(element.getAttribute("href"), origin);
	if (!entity) return null;
	if (sameEntity(entity, matchEntityHref(currentPath))) return null;
	return { ...entity, element };
}
