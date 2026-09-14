"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATALOGUE_ROUTE_ROOTS } from "@/lib/publicDataRoutes";

const VISIBILITY_THRESHOLD = 320;

export default function CatalogueScrollToTop() {
	const pathname = usePathname() ?? "";
	const [visible, setVisible] = useState(false);
	const enabled = CATALOGUE_ROUTE_ROOTS.some(
		(root) => pathname === root || pathname.startsWith(`${root}/`),
	);

	useEffect(() => {
		if (!enabled) {
			setVisible(false);
			return;
		}

		const update = () => setVisible(window.scrollY > VISIBILITY_THRESHOLD);
		update();
		window.addEventListener("scroll", update, { passive: true });
		return () => window.removeEventListener("scroll", update);
	}, [enabled, pathname]);

	if (!enabled) return null;

	return (
		<button
			type="button"
			aria-label="Scroll to top"
			onClick={() => {
				const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
				window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
			}}
			className={cn(
				"group fixed bottom-6 right-4 z-40 inline-flex size-11 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm backdrop-blur transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95 sm:right-9",
				visible
					? "translate-y-0 opacity-100"
					: "pointer-events-none translate-y-3 opacity-0",
			)}
		>
			<ChevronUp className="size-6 transition-transform duration-500 ease-out group-hover:-translate-y-1" />
		</button>
	);
}
