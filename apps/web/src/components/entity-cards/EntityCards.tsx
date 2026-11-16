// Site-wide entity hover cards, after the Pitwall design: one card for the whole
// page, positioned against whichever entity link is hovered, so a table with
// hundreds of links costs one listener and nothing per link.
//
// - Links are recognised by href (`matchEntityHref`), so no link site needs a
//   change. `data-no-entity-card` opts a link or area out; navigation, headers,
//   breadcrumbs, existing hover-card/popover triggers and the page's own entity
//   are skipped (`entityLinkFromTarget`).
// - Mouse and keyboard: a card opens on hover and on keyboard focus
//   (:focus-visible), with the same delays, and closes on blur unless focus
//   moves into the card. Escape closes it. On touch a tap just follows the link.
// - Opens after 450 ms, switches after 120 ms when moving from an open card's
//   link to another, closes 200 ms after the pointer leaves the link and card.
//   A pointerdown outside the cards and any navigation close them at once; a
//   pointerdown inside a card leaves it open, so a click on one of its links
//   reaches the link and the navigation that follows closes the card.
// - The card's data is requested as soon as the pointer is over a link (hover
//   intent) and cached for the page's lifetime. The card UI itself loads on the
//   first hover, so pages that never show a card do not pay for it.
// - One level deep: hovering a link inside the card opens a second card beside
//   it, and the first card stays open. Links inside the second card are plain
//   links, so cards never chain. Leaving the second card closes it; leaving both
//   cards closes both.
// - A card is positioned against its link until it has finished closing, and
//   against the link's last box once the page has replaced the link, so it never
//   jumps to the corner of the screen. A link the page replaced closes its card
//   and never opens one.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { entityLinkFromTarget, type EntityLink } from "@/lib/entityCards/entityLink";
import { cachedEntityCard, loadEntityCard, type EntityCard } from "./entityCardData";

export const OPEN_DELAY_MS = 450;
/** Moving straight from one link to another while a card is open. */
export const SWITCH_DELAY_MS = 120;
export const CLOSE_DELAY_MS = 200;

const loadPopup = () => import("./EntityCardPopup");
const EntityCardPopup = lazy(loadPopup);

const CARD = "[data-entity-card]";
/** The second card, opened from a link inside the first. */
const NESTED_CARD = "[data-entity-card-nested]";

function elementOf(target: EventTarget | null): Element | null {
	return target instanceof Element ? target : null;
}

function anchorFor(event: Event): HTMLAnchorElement | null {
	return elementOf(event.target)?.closest<HTMLAnchorElement>("a[href]") ?? null;
}

function insideCard(target: EventTarget | null): boolean {
	return elementOf(target)?.closest(CARD) != null;
}

function insideNestedCard(target: EventTarget | null): boolean {
	return elementOf(target)?.closest(NESTED_CARD) != null;
}

/** Inside the first card (not the second one). */
function insideFirstCard(target: EventTarget | null): boolean {
	return insideCard(target) && !insideNestedCard(target);
}

/**
 * What the card is positioned against: the link's box while the link is on the
 * page, and its last box once a re-render has replaced it. A detached element
 * measures as an empty box at 0,0, which would send the card to the corner.
 */
export function lastKnownBox(element: Element) {
	let box = element.getBoundingClientRect();
	return {
		contextElement: element,
		getBoundingClientRect() {
			if (element.isConnected) box = element.getBoundingClientRect();
			return box;
		},
	};
}

/**
 * What the second card is positioned against: the full width of the card that
 * holds its link, at the link's height, so it opens beside that card (and flips
 * to the other side when there is no room) instead of covering it.
 */
export function besideCard(element: Element) {
	const link = lastKnownBox(element);
	let card = element.closest(CARD)?.getBoundingClientRect() ?? null;
	return {
		contextElement: element,
		getBoundingClientRect() {
			const box = link.getBoundingClientRect();
			const holder = element.isConnected ? element.closest(CARD) : null;
			if (holder) card = holder.getBoundingClientRect();
			if (!card) return box;
			return DOMRect.fromRect({ x: card.x, y: box.y, width: card.width, height: box.height });
		},
	};
}

function focusVisible(element: Element): boolean {
	try {
		return element.matches(":focus-visible");
	} catch {
		// Without :focus-visible support we cannot tell keyboard from mouse focus; stay closed.
		return false;
	}
}

/** One card: loads its entity and keeps its link while it finishes closing. */
function CardLevel({ target, nested, onClose }: { target: EntityLink | null; nested: boolean; onClose: () => void }) {
	// The last card that finished loading, with the link it belongs to.
	const [loaded, setLoaded] = useState<{ link: EntityLink; card: EntityCard | null } | null>(null);

	useEffect(() => {
		if (!target) return;
		let live = true;
		loadEntityCard(target.kind, target.id)
			.then((card) => live && setLoaded({ link: target, card }))
			.catch(() => live && setLoaded({ link: target, card: null }));
		return () => {
			live = false;
		};
	}, [target]);

	// The link the card belongs to outlives `target` until the card has finished
	// closing, so the exit animation plays at the link with the same content.
	const [shown, setShown] = useState<EntityLink | null>(null);
	if (target && target !== shown) setShown(target);
	const link = target ?? shown;
	const anchorElement = link?.element ?? null;
	const anchor = useMemo(
		() => (anchorElement ? (nested ? besideCard(anchorElement) : lastKnownBox(anchorElement)) : null),
		[anchorElement, nested],
	);
	const closed = useCallback(() => setShown(null), []);

	// undefined while loading, null when the entity has no card. A card that has
	// already loaded shows at once, with no loading state between.
	const card = !link ? undefined : loaded?.link === link ? loaded.card : cachedEntityCard(link.kind, link.id);

	return (
		<EntityCardPopup
			anchor={anchor}
			nested={nested}
			open={Boolean(target) && card !== null}
			card={card}
			onClose={onClose}
			onClosed={closed}
		/>
	);
}

/** The listener and card state; `pathname` is the current page's path. */
export function EntityCardsController({ pathname }: { pathname: string }) {
	const [target, setTarget] = useState<EntityLink | null>(null);
	// The second card, for a link inside the first.
	const [nested, setNested] = useState<EntityLink | null>(null);
	const [popupLoaded, setPopupLoaded] = useState(false);
	const [shownPath, setShownPath] = useState(pathname);
	const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const nestedOpenTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const nestedCloseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const current = useRef<EntityLink | null>(null);
	const currentNested = useRef<EntityLink | null>(null);
	const path = useRef(pathname);

	// Close on navigation.
	if (shownPath !== pathname) {
		setShownPath(pathname);
		setTarget(null);
		setNested(null);
	}
	useEffect(() => {
		current.current = target;
		currentNested.current = nested;
		path.current = pathname;
	}, [target, nested, pathname]);
	// A card that was about to open on the previous page stays closed.
	useEffect(
		() => () => {
			clearTimeout(openTimer.current);
			clearTimeout(nestedOpenTimer.current);
		},
		[pathname],
	);

	const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);
	const cancelNestedClose = useCallback(() => clearTimeout(nestedCloseTimer.current), []);
	const closeNested = useCallback(() => {
		clearTimeout(nestedOpenTimer.current);
		clearTimeout(nestedCloseTimer.current);
		setNested(null);
	}, []);
	const hide = useCallback(() => {
		clearTimeout(openTimer.current);
		clearTimeout(closeTimer.current);
		closeNested();
		setTarget(null);
	}, [closeNested]);
	const scheduleClose = useCallback(() => {
		clearTimeout(openTimer.current);
		clearTimeout(closeTimer.current);
		closeTimer.current = setTimeout(hide, CLOSE_DELAY_MS);
	}, [hide]);
	const scheduleNestedClose = useCallback(() => {
		clearTimeout(nestedOpenTimer.current);
		clearTimeout(nestedCloseTimer.current);
		nestedCloseTimer.current = setTimeout(() => setNested(null), CLOSE_DELAY_MS);
	}, []);

	// Entering and leaving the cards are tracked here too, not with React's
	// onPointerEnter/Leave on the popup: React dispatches those during the
	// link's pointerout at its root, before this document listener would
	// schedule the close, so the card would close under the pointer.
	useEffect(() => {
		// Hover or focus intent on an eligible link: start the request and the card UI now,
		// so both are usually ready when the card opens.
		const intend = (target: EventTarget | null) => {
			const link = entityLinkFromTarget(target, path.current, window.location.origin);
			if (!link) {
				if (insideNestedCard(target)) {
					cancelClose();
					cancelNestedClose();
				} else if (insideFirstCard(target)) cancelClose();
				return;
			}
			// A link inside the first card: its card opens beside it, and the first card stays.
			if (insideFirstCard(link.element)) {
				cancelClose();
				if (currentNested.current?.element === link.element) {
					cancelNestedClose();
					return;
				}
				loadEntityCard(link.kind, link.id).catch(() => {});
				clearTimeout(nestedOpenTimer.current);
				cancelNestedClose();
				nestedOpenTimer.current = setTimeout(() => {
					if (!link.element.isConnected) return;
					setNested(link);
				}, currentNested.current ? SWITCH_DELAY_MS : OPEN_DELAY_MS);
				return;
			}
			if (current.current?.element === link.element) {
				cancelClose();
				return;
			}
			loadEntityCard(link.kind, link.id).catch(() => {});
			setPopupLoaded(true);
			clearTimeout(openTimer.current);
			cancelClose();
			openTimer.current = setTimeout(() => {
				// The page re-rendered and replaced the link while the delay ran: nothing to anchor to.
				if (!link.element.isConnected) return;
				closeNested();
				setTarget(link);
			}, current.current ? SWITCH_DELAY_MS : OPEN_DELAY_MS);
		};
		const over = (event: PointerEvent) => {
			if (event.pointerType !== "mouse") return;
			intend(event.target);
		};
		// Keyboard focus only: a mouse click also focuses the link, but is not :focus-visible.
		const focusIn = (event: FocusEvent) => {
			if (!(event.target instanceof Element)) return;
			// Tabbing through a card's own links keeps it as it is.
			if (insideCard(event.target)) {
				cancelClose();
				return;
			}
			// Focus that lands anywhere else closes an open card, even when the element that
			// held focus was removed and no focusout came.
			if (current.current && current.current.element !== event.target) scheduleClose();
			if (focusVisible(event.target)) intend(event.target);
		};
		const focusOut = (event: FocusEvent) => {
			const to = elementOf(event.relatedTarget);
			const anchor = anchorFor(event);
			const open = current.current?.element ?? null;
			// Leaving a link that was about to open: forget it.
			if (anchor && anchor !== open) clearTimeout(openTimer.current);
			if (!(anchor && anchor === open) && !insideCard(event.target)) return;
			// Focus moving into a card, or back to the link, keeps it open.
			if (to && (insideCard(to) || to === open)) return;
			scheduleClose();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (current.current) hide();
			else clearTimeout(openTimer.current);
		};
		const out = (event: PointerEvent) => {
			const from = elementOf(event.target);
			const to = elementOf(event.relatedTarget);
			const anchor = anchorFor(event);
			const open = current.current?.element ?? null;
			const openNested = currentNested.current?.element ?? null;
			// Leaving a link that was about to open: forget it.
			if (anchor && anchor !== open && anchor !== openNested && !(to && anchor.contains(to))) {
				clearTimeout(openTimer.current);
				clearTimeout(nestedOpenTimer.current);
			}
			// The first card stays while the pointer is on its link or on either card;
			// the second while it is on its own link or card. Moving within those keeps them.
			const onFirst = (element: Element | null) =>
				element !== null && (insideCard(element) || (open !== null && open.contains(element)));
			const onNested = (element: Element | null) =>
				element !== null && (insideNestedCard(element) || (openNested !== null && openNested.contains(element)));
			if (open && onFirst(from) && !onFirst(to)) scheduleClose();
			if (openNested && onNested(from) && !onNested(to)) scheduleNestedClose();
		};
		const down = (event: PointerEvent) => {
			// Closing here would unmount the card before an in-card link gets its click.
			if (insideCard(event.target)) {
				clearTimeout(openTimer.current);
				clearTimeout(nestedOpenTimer.current);
				return;
			}
			hide();
		};
		document.addEventListener("pointerover", over);
		document.addEventListener("pointerout", out);
		document.addEventListener("pointerdown", down, true);
		document.addEventListener("focusin", focusIn);
		document.addEventListener("focusout", focusOut);
		document.addEventListener("keydown", key);
		return () => {
			document.removeEventListener("pointerover", over);
			document.removeEventListener("pointerout", out);
			document.removeEventListener("pointerdown", down, true);
			document.removeEventListener("focusin", focusIn);
			document.removeEventListener("focusout", focusOut);
			document.removeEventListener("keydown", key);
			clearTimeout(openTimer.current);
			clearTimeout(closeTimer.current);
			clearTimeout(nestedOpenTimer.current);
			clearTimeout(nestedCloseTimer.current);
		};
	}, [cancelClose, cancelNestedClose, closeNested, scheduleClose, scheduleNestedClose, hide]);

	// A link the page replaced while its card is open closes the card.
	useEffect(() => {
		if (!target && !nested) return;
		const closeIfDetached = () => {
			if (target && !target.element.isConnected) {
				setTarget((open) => (open === target ? null : open));
				setNested(null);
			} else if (nested && !nested.element.isConnected) setNested((open) => (open === nested ? null : open));
		};
		closeIfDetached();
		const observer = new MutationObserver(closeIfDetached);
		observer.observe(document.body, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [target, nested]);

	if (!popupLoaded) return null;
	return (
		<Suspense fallback={null}>
			<CardLevel target={target} nested={false} onClose={hide} />
			<CardLevel target={nested} nested onClose={closeNested} />
		</Suspense>
	);
}

/** Mounted once in the root document. */
export function EntityCards() {
	const pathname = useLocation({ select: (location) => location.pathname });
	return <EntityCardsController pathname={pathname} />;
}
