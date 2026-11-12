import type { AnchorHTMLAttributes, Ref } from "react";
import { useFactoryNav, type FactoryRoute } from "../lib/useFactory";

/**
 * A link inside Code ▸ Factory: an item, one of its tabs, or the new issue form. Enter and click both follow it.
 * Other props pass through, so tooltips can wrap it.
 */
export function FactoryLink({ to, onClick, onKeyDown, ...props }: { to: FactoryRoute; ref?: Ref<HTMLAnchorElement>; "data-selected"?: boolean } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
	const { go } = useFactoryNav();
	return <a role="link" tabIndex={0} {...props} onClick={(event) => {
		onClick?.(event);
		event.preventDefault();
		go(to);
	}} onKeyDown={(event) => {
		onKeyDown?.(event);
		if (event.key !== "Enter") return;
		event.preventDefault();
		go(to);
	}} />;
}
