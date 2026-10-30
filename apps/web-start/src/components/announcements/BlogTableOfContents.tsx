"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlogTocItem } from "@/lib/content/blogToc";
import { useTranslations } from "next-intl";

type BlogTableOfContentsProps = {
	items: BlogTocItem[];
};

function TableOfContentsLinks({
	activeId,
	items,
	label,
}: {
	activeId: string;
	items: BlogTocItem[];
	label: string;
}) {
	return (
		<nav aria-label={label}>
			<ul className="space-y-1">
				{items.map((item) => (
					<li key={item.id}>
						<Link
							href={`#${item.id}`}
							aria-current={item.id === activeId ? "location" : undefined}
							data-active={item.id === activeId ? "true" : "false"}
							data-blog-toc-id={item.id}
							className={cn(
								"block border-l-2 border-transparent py-1.5 text-sm leading-5 text-zinc-500 transition-colors data-[active=true]:font-medium data-[active=true]:text-zinc-950 dark:text-zinc-400 dark:data-[active=true]:text-zinc-50",
								item.level === 3 ? "pl-5 text-xs" : "pl-3",
								"hover:border-zinc-300 hover:text-zinc-950 dark:hover:border-zinc-700 dark:hover:text-zinc-50",
							)}
						>
							{item.label}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}

export function BlogTableOfContents({ items }: BlogTableOfContentsProps) {
	const t = useTranslations("Content.blog");
	const [activeId, setActiveId] = useState(items[0]?.id ?? "");
	const desktopListRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let frame = 0;
		const headings = items
			.map((item) => document.getElementById(item.id))
			.filter((heading): heading is HTMLElement => Boolean(heading));

		const updateActiveSection = () => {
			frame = 0;
			if (!headings.length) return;

			let nextActiveId = headings[0].id;
			for (const heading of headings) {
				if (heading.getBoundingClientRect().top <= 160) {
					nextActiveId = heading.id;
				} else {
					break;
				}
			}
			setActiveId((current) =>
				current === nextActiveId ? current : nextActiveId,
			);
		};

		const requestUpdate = () => {
			if (frame) return;
			frame = requestAnimationFrame(updateActiveSection);
		};

		window.addEventListener("scroll", requestUpdate, { passive: true });
		document.addEventListener("scroll", requestUpdate, {
			capture: true,
			passive: true,
		});
		window.addEventListener("resize", requestUpdate);
		window.addEventListener("hashchange", requestUpdate);
		requestUpdate();

		return () => {
			window.removeEventListener("scroll", requestUpdate);
			document.removeEventListener("scroll", requestUpdate, true);
			window.removeEventListener("resize", requestUpdate);
			window.removeEventListener("hashchange", requestUpdate);
			if (frame) cancelAnimationFrame(frame);
		};
	}, [items]);

	useEffect(() => {
		const list = desktopListRef.current;
		const activeLink = list?.querySelector<HTMLElement>(
			`[data-blog-toc-id="${CSS.escape(activeId)}"]`,
		);
		const indicator = list?.querySelector<HTMLElement>(
			"[data-blog-toc-indicator]",
		);
		if (!activeLink || !indicator) return;

		indicator.style.height = `${activeLink.offsetHeight}px`;
		indicator.style.transform = `translateY(${activeLink.offsetTop}px)`;
	}, [activeId]);

	return (
		<>
			<div className="lg:hidden">
				<details className="group border-y border-zinc-200 py-4 dark:border-zinc-800">
					<summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-950 marker:hidden dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
						<span>{t("onThisPage")}</span>
						<ChevronDown
							aria-hidden="true"
							className="size-4 text-zinc-500 transition-transform duration-200 group-open:rotate-180 dark:text-zinc-400"
						/>
					</summary>
					<div className="mt-4">
						<TableOfContentsLinks
							activeId={activeId}
							items={items}
							label={t("tableOfContents")}
						/>
					</div>
				</details>
			</div>

			<aside className="sticky top-[calc(var(--site-header-height,3.75rem)+1rem)] hidden max-h-[calc(100vh-5rem)] w-56 shrink-0 overflow-y-auto lg:block">
				<p className="mb-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
					{t("onThisPage")}
				</p>
				<div ref={desktopListRef} data-blog-toc-list className="relative">
					<span
						data-blog-toc-indicator
						aria-hidden="true"
						className="pointer-events-none absolute left-0 top-0 z-10 h-6 w-0.5 rounded-full bg-sky-500 transition-[height,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
					/>
					<TableOfContentsLinks
						activeId={activeId}
						items={items}
						label={t("tableOfContents")}
					/>
				</div>
			</aside>
		</>
	);
}
