import type * as React from "react";
import Link from "@/components/link";
import { cn } from "@/lib/utils";

const LINK_CLASS =
	"inline-flex min-w-0 items-center gap-2 rounded-sm text-foreground underline decoration-transparent decoration-1 underline-offset-4 outline-none transition-[text-decoration-color] duration-200 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none";

function stopPropagation(event: React.MouseEvent) {
	event.stopPropagation();
}

/**
 * A model, provider or app in the usage tables. Catalogue links get the
 * site-wide entity card (see `EntityCards`), so this is only the link: a click
 * follows it without also opening the row it sits in. Without an href it is
 * plain text.
 */
export default function UsageEntityLink({
	href,
	children,
	className,
}: {
	href?: string | null;
	children: React.ReactNode;
	className?: string;
}) {
	if (!href) return <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>{children}</span>;
	return (
		<Link href={href} className={cn(LINK_CLASS, className)} onClick={stopPropagation}>
			{children}
		</Link>
	);
}
