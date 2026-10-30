"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { List, PanelsTopLeft, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import AppLogo from "@/components/(data)/apps/AppLogo";
import { cn } from "@/lib/utils";

function useVisibility(observeId: string) {
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		const target = document.getElementById(observeId);
		if (!target) return;
		let frame = 0;
		const update = () => { frame = 0; setVisible(target.getBoundingClientRect().bottom <= 76); };
		const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update); };
		requestUpdate();
		window.addEventListener("scroll", requestUpdate, { passive: true });
		window.addEventListener("resize", requestUpdate);
		return () => { if (frame) cancelAnimationFrame(frame); window.removeEventListener("scroll", requestUpdate); window.removeEventListener("resize", requestUpdate); };
	}, [observeId]);
	return visible;
}

type StickyNavigationItem = { label: string; href: string };

export default function EntityStickyHeader({ kind, id, name, observeId, baseHref, navigation, imageUrl, brandLogo }: { kind: "provider" | "country" | "organisation" | "benchmark" | "family" | "subscription" | "app"; id: string; name: string; observeId: string; baseHref: string; navigation?: StickyNavigationItem[]; imageUrl?: string | null; brandLogo?: { light: string; dark: string; width: number; height: number } }) {
	const visible = useVisibility(observeId);
	const navigationItems = navigation ?? [
		{ label: "Overview", href: baseHref },
		{ label: "Models", href: `${baseHref}/models` },
	];
	const iconFor = (label: string) => {
		if (label === "Overview") return PanelsTopLeft;
		if (label === "Models") return List;
		return Sparkles;
	};
	return (
		<div className="h-0">
			<div className={cn("pointer-events-none fixed inset-x-0 top-[calc(var(--site-notice-height,0px)+var(--site-header-height,3.75rem))] z-40 transition-all duration-200", visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0")}>
				<div className="pointer-events-auto border-b border-border/80 bg-background/95 shadow-sm backdrop-blur">
					<div className="container mx-auto flex items-center justify-between gap-3 px-4 py-2.5 md:px-6 xl:px-8">
						<Link href={baseHref} className="flex min-w-0 items-center gap-3">
							{brandLogo ? <><Image src={brandLogo.light} alt={name} width={brandLogo.width} height={brandLogo.height} className="h-6 w-auto dark:hidden" /><Image src={brandLogo.dark} alt="" aria-hidden="true" width={brandLogo.width} height={brandLogo.height} className="hidden h-6 w-auto dark:block" /></> : kind === "app" ? <AppLogo src={imageUrl} alt="" fallback={name.slice(0, 1).toUpperCase()} className="size-8 shrink-0" fallbackClassName="text-xs" /> : <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">{kind === "country" ? <Image src={`/flags/${id.toLowerCase()}.svg`} alt="" fill className="object-cover" /> : kind === "benchmark" || kind === "family" ? <Sparkles className="size-4 text-muted-foreground" /> : <span className="relative size-6"><Logo id={id} alt="" fill className="object-contain" /></span>}</span>}
							{brandLogo ? null : <span className="truncate text-sm font-semibold">{name}</span>}
						</Link>
						<div className="flex shrink-0 items-center gap-2">
							{navigationItems.map((item) => {
								const Icon = iconFor(item.label);
								return <Button key={item.href} asChild variant="outline" size="sm" className="hidden h-8 rounded-lg px-2.5 text-[13px] sm:inline-flex"><Link href={item.href}><Icon className="size-4" />{item.label}</Link></Button>;
							})}
							{navigationItems[0] ? <Button asChild variant="outline" size="icon-sm" className="rounded-lg sm:hidden"><Link href={navigationItems[0].href} aria-label={`${navigationItems[0].label} for ${name}`}><Sparkles className="size-4" /></Link></Button> : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
