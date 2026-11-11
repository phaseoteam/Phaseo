// Site-wide entity hover cards, after the Pitwall design: one card for the whole
// page, positioned against whichever entity link is hovered, so a table with
// hundreds of links costs one listener and nothing per link.
//
// - Links are recognised by href (`matchEntityHref`), so no link site needs a
//   change. `data-no-entity-card` opts a link or area out; navigation, headers,
//   breadcrumbs, existing hover-card/popover triggers and the page's own entity
//   are skipped (`entityLinkFromTarget`).
// - Mouse only: on touch a tap just follows the link.
// - Opens after 450 ms, switches after 120 ms when moving from an open card's
//   link to another, closes 200 ms after the pointer leaves the link and card.
//   Any pointerdown and any navigation close it at once.
// - The card's data is requested as soon as the pointer is over a link (hover
//   intent) and cached for the page's lifetime. The card UI itself loads on the
//   first hover, so pages that never show a card do not pay for it.
// - Links inside a card open their own cards.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { entityLinkFromTarget, type EntityLink } from "@/lib/entityCards/entityLink";
import { loadEntityCard, type EntityCard } from "./entityCardData";

export const OPEN_DELAY_MS = 450;
/** Moving straight from one link to another while a card is open. */
export const SWITCH_DELAY_MS = 120;
export const CLOSE_DELAY_MS = 200;

const loadPopup = () => import("./EntityCardPopup");
const EntityCardPopup = lazy(loadPopup);

function anchorFor(event: Event): HTMLAnchorElement | null {
	return event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
}

function insideCard(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest("[data-entity-card]") !== null;
}

/** The listener and card state; `pathname` is the current page's path. */
export function EntityCardsController({ pathname }: { pathname: string }) {
	const [target, setTarget] = useState<EntityLink | null>(null);
	// The last card that finished loading, with the link it belongs to.
	const [loaded, setLoaded] = useState<{ link: EntityLink; card: EntityCard | null } | null>(null);
	const [popupLoaded, setPopupLoaded] = useState(false);
	const [shownPath, setShownPath] = useState(pathname);
	const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const current = useRef<EntityLink | null>(null);
	const path = useRef(pathname);

	// Close on navigation.
	if (shownPath !== pathname) {
		setShownPath(pathname);
		setTarget(null);
	}
	useEffect(() => {
		current.current = target;
		path.current = pathname;
	}, [target, pathname]);
	// A card that was about to open on the previous page stays closed.
	useEffect(() => () => clearTimeout(openTimer.current), [pathname]);

	const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);
	const scheduleClose = useCallback(() => {
		clearTimeout(openTimer.current);
		clearTimeout(closeTimer.current);
		closeTimer.current = setTimeout(() => setTarget(null), CLOSE_DELAY_MS);
	}, []);
	const hide = useCallback(() => {
		clearTimeout(openTimer.current);
		clearTimeout(closeTimer.current);
		setTarget(null);
	}, []);

	// Entering and leaving the card are tracked here too, not with React's
	// onPointerEnter/Leave on the popup: React dispatches those during the
	// link's pointerout at its root, before this document listener would
	// schedule the close, so the card would close under the pointer.
	useEffect(() => {
		const over = (event: PointerEvent) => {
			if (event.pointerType !== "mouse") return;
			const link = entityLinkFromTarget(event.target, path.current, window.location.origin);
			if (!link) {
				if (insideCard(event.target)) cancelClose();
				return;
			}
			if (current.current?.element === link.element) {
				cancelClose();
				return;
			}
			// Hover intent: start the request and the card UI now, so both are usually ready when the card opens.
			loadEntityCard(link.kind, link.id).catch(() => {});
			setPopupLoaded(true);
			clearTimeout(openTimer.current);
			cancelClose();
			openTimer.current = setTimeout(() => setTarget(link), current.current ? SWITCH_DELAY_MS : OPEN_DELAY_MS);
		};
		const out = (event: PointerEvent) => {
			const to = event.relatedTarget instanceof Element ? event.relatedTarget : null;
			const anchor = anchorFor(event);
			const open = current.current?.element ?? null;
			// Leaving a link that was about to open: forget it.
			if (anchor && anchor !== open && !(to && anchor.contains(to))) clearTimeout(openTimer.current);
			// Only leaving the open card's link, or the card itself, closes it,
			// and not when the pointer moves between the two.
			if (!(anchor && anchor === open) && !insideCard(event.target)) return;
			if (to && (insideCard(to) || open?.contains(to))) return;
			scheduleClose();
		};
		document.addEventListener("pointerover", over);
		document.addEventListener("pointerout", out);
		document.addEventListener("pointerdown", hide, true);
		return () => {
			document.removeEventListener("pointerover", over);
			document.removeEventListener("pointerout", out);
			document.removeEventListener("pointerdown", hide, true);
			clearTimeout(openTimer.current);
			clearTimeout(closeTimer.current);
		};
	}, [cancelClose, scheduleClose, hide]);

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

	// undefined while loading, null when the entity has no card.
	const card = target && loaded?.link === target ? loaded.card : undefined;

	if (!popupLoaded) return null;
	return (
		<Suspense fallback={null}>
			<EntityCardPopup
				anchor={target?.element ?? null}
				open={Boolean(target) && card !== null}
				card={card}
				onClose={hide}
			/>
		</Suspense>
	);
}

/** Mounted once in the root document. */
export function EntityCards() {
	const pathname = useLocation({ select: (location) => location.pathname });
	return <EntityCardsController pathname={pathname} />;
}
