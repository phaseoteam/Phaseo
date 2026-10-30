"use client";

import { useState, type ComponentProps } from "react";
import { Link } from "@/i18n/navigation";

type IntentLinkProps = Omit<ComponentProps<typeof Link>, "prefetch">;

/** Keep passive page visits from fetching every common destination. */
export function IntentLink({
	onMouseEnter,
	onFocus,
	onTouchStart,
	...props
}: IntentLinkProps) {
	const [activeHref, setActiveHref] = useState<IntentLinkProps["href"] | null>(null);

	return (
		<Link
			{...props}
			prefetch={activeHref === props.href ? null : false}
			onMouseEnter={(event) => {
				onMouseEnter?.(event);
				if (!event.defaultPrevented) setActiveHref(props.href);
			}}
			onFocus={(event) => {
				onFocus?.(event);
				if (!event.defaultPrevented) setActiveHref(props.href);
			}}
			onTouchStart={(event) => {
				onTouchStart?.(event);
				if (!event.defaultPrevented) setActiveHref(props.href);
			}}
		/>
	);
}
