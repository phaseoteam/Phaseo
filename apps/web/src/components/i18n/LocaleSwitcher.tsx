"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import Image from "next/image";
import { Check, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "@/i18n/navigation";
import {
	getLocaleDefinition,
	publicLocales,
	type PublicLocale,
} from "@/i18n/routing";
import { cn } from "@/lib/utils";

export type LocaleSwitcherProps = {
	currentLocale: PublicLocale;
	returnPath: ComponentProps<typeof Link>["href"];
	label: string;
	className?: string;
	placement?: "top" | "bottom";
};

const localeFlagCodes = {
	"en-GB": "gb",
	"en-US": "us",
	"zh-Hans": "cn",
	hi: "in",
	"es-ES": "es",
	"fr-FR": "fr",
	"de-DE": "de",
	"pt-BR": "br",
	ja: "jp",
	"ar-SA": "sa",
} as const satisfies Record<PublicLocale, string>;

function LocaleFlag({ locale }: { locale: PublicLocale }) {
	return (
		<span className="relative size-5 shrink-0 overflow-hidden rounded-full border border-black/10 bg-muted shadow-xs dark:border-white/15">
			<Image
				src={`/flags/${localeFlagCodes[locale]}.svg`}
				alt=""
				fill
				sizes="20px"
				className="object-cover"
			/>
		</span>
	);
}

/**
 * A progressively enhanced locale switcher. Explicit locale links keep the
 * control usable without client JavaScript and let next-intl generate the
 * canonical locale-prefixed URL for the supplied locale-independent path.
 */
export function LocaleSwitcher({
	currentLocale,
	returnPath,
	label,
	className,
	placement = "bottom",
}: LocaleSwitcherProps) {
	const currentDefinition = getLocaleDefinition(currentLocale);
	const detailsRef = useRef<HTMLDetailsElement>(null);

	useEffect(() => {
		const details = detailsRef.current;
		if (!details) return;

		const dismissOutside = (event: PointerEvent | FocusEvent) => {
			if (event.target instanceof Node && !details.contains(event.target)) {
				details.open = false;
			}
		};
		const dismissOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape" && details.open) {
				event.preventDefault();
				details.open = false;
				details.querySelector("summary")?.focus();
			}
		};

		document.addEventListener("pointerdown", dismissOutside, true);
		document.addEventListener("focusin", dismissOutside);
		document.addEventListener("keydown", dismissOnEscape);
		return () => {
			document.removeEventListener("pointerdown", dismissOutside, true);
			document.removeEventListener("focusin", dismissOutside);
			document.removeEventListener("keydown", dismissOnEscape);
		};
	}, []);

	return (
		<nav aria-label={label} className={cn("relative inline-block", className)}>
			<details ref={detailsRef} className="group relative">
				<summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-muted group-open:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
					<LocaleFlag locale={currentLocale} />
					<span className="sr-only">{label}: </span>
					<bdi lang={currentLocale} dir={currentDefinition.dir}>
						{currentDefinition.nativeName}
					</bdi>
					<ChevronDown
						className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
						aria-hidden="true"
					/>
				</summary>

				<div
					className={cn(
						"absolute end-0 z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg",
						placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
					)}
				>
					<ScrollArea
						className="h-[min(20rem,60dvh)]"
						viewportClassName="overscroll-y-contain"
					>
						<ul className="space-y-0.5 p-1.5 pe-3">
							{publicLocales.map((locale) => {
								const definition = getLocaleDefinition(locale);
								const selected = locale === currentLocale;

								return (
									<li key={locale}>
										<Link
											href={returnPath}
											locale={locale}
											hrefLang={locale}
											prefetch={false}
											aria-current={selected ? "page" : undefined}
											className={cn(
												"flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
												selected && "bg-accent text-accent-foreground",
											)}
										>
											<LocaleFlag locale={locale} />
											<span className="min-w-0 flex-1">
												<bdi
													lang={locale}
													dir={definition.dir}
													className="block truncate font-medium"
												>
													{definition.nativeName}
												</bdi>
												<bdi
													dir="ltr"
													className="block text-xs text-muted-foreground"
												>
													{locale}
												</bdi>
											</span>
											{selected ? (
												<Check className="size-4 shrink-0" aria-hidden="true" />
											) : null}
										</Link>
									</li>
								);
							})}
						</ul>
					</ScrollArea>
				</div>
			</details>
		</nav>
	);
}
