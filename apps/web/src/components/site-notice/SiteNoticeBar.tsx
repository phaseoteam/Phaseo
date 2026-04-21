"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SiteNotice } from "@/lib/siteNotice";

function toneClasses(tone: SiteNotice["tone"]) {
	switch (tone) {
		case "critical":
			return "border-red-300 bg-red-100/95 text-red-950 dark:border-red-900 dark:bg-red-950/45 dark:text-red-100";
		case "warning":
			return "border-amber-300 bg-amber-100/95 text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100";
		case "info":
		default:
			return "border-sky-300 bg-sky-100/95 text-sky-950 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-100";
	}
}

export default function SiteNoticeBar({ notice }: { notice: SiteNotice }) {
	const barRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const updateNoticeHeight = () => {
			const height = barRef.current?.offsetHeight ?? 0;
			document.documentElement.style.setProperty(
				"--site-notice-height",
				`${height}px`
			);
		};

		updateNoticeHeight();
		window.addEventListener("resize", updateNoticeHeight);

		let observer: ResizeObserver | null = null;
		if (barRef.current && typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(updateNoticeHeight);
			observer.observe(barRef.current);
		}

		return () => {
			window.removeEventListener("resize", updateNoticeHeight);
			observer?.disconnect();
			document.documentElement.style.setProperty("--site-notice-height", "0px");
		};
	}, []);

	return (
		<>
			<div
				ref={barRef}
				className={`fixed inset-x-0 top-0 z-[60] border-b px-3 py-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-500 ${toneClasses(
					notice.tone
				)}`}
			>
				<div className="mx-auto flex w-full max-w-full items-center justify-center gap-1 text-center text-xs sm:max-w-[640px] md:max-w-[768px] lg:max-w-[1024px] lg:text-sm xl:max-w-[1280px] 2xl:max-w-[1536px]">
					<span>{notice.message}</span>
					{notice.cta ? (
						<Link
							href={notice.cta.href}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 whitespace-nowrap font-semibold underline underline-offset-4"
						>
							{notice.cta.label}
							<ArrowUpRight className="h-3.5 w-3.5" />
						</Link>
					) : null}
				</div>
			</div>
			<div aria-hidden style={{ height: "var(--site-notice-height, 0px)" }} />
		</>
	);
}
