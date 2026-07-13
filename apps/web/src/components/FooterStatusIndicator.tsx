"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type StatusState =
	| "operational"
	| "degraded"
	| "partial_outage"
	| "major_outage"
	| "maintenance"
	| "unknown";

type StatusSummary = {
	ok: boolean;
	state: StatusState;
	label: string;
	href: string;
	components?: Array<{
		name: string;
		label: string;
		state: StatusState;
		parent: string | null;
	}>;
};

const STATUS_PAGE_HREF = "https://status.phaseo.app";

const STATUS_STYLES: Record<StatusState, { dot: string; text: string }> = {
	operational: {
		dot: "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.14)]",
		text: "text-emerald-700 dark:text-emerald-300",
	},
	degraded: {
		dot: "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.16)]",
		text: "text-amber-700 dark:text-amber-300",
	},
	partial_outage: {
		dot: "bg-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.16)]",
		text: "text-orange-700 dark:text-orange-300",
	},
	major_outage: {
		dot: "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.16)]",
		text: "text-red-700 dark:text-red-300",
	},
	maintenance: {
		dot: "bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.16)]",
		text: "text-sky-700 dark:text-sky-300",
	},
	unknown: {
		dot: "bg-zinc-400 shadow-[0_0_0_3px_rgba(113,113,122,0.12)]",
		text: "text-zinc-500 dark:text-zinc-400",
	},
};

type StatusComponent = NonNullable<StatusSummary["components"]>[number];

const GROUP_ORDER = ["API", "Platform", "Other"];
const COMPONENT_PRIORITY = [
	"API health (/v1/health)",
	"Models API (/v1/models)",
	"Generation API demo",
	"Homepage",
	"Documentation homepage",
	"Docs page",
];

function isAffected(component: StatusComponent) {
	return component.state !== "operational" && component.state !== "unknown";
}

function statusGroup(component: StatusComponent) {
	if (
		component.name.includes("API") ||
		component.name.includes("(/v1/") ||
		component.parent?.startsWith("API")
	) {
		return "API";
	}
	if (
		component.parent?.startsWith("Platform") ||
		component.name === "Homepage" ||
		component.name.startsWith("Homepage") ||
		component.name === "Documentation homepage" ||
		component.name === "Docs page"
	) {
		return "Platform";
	}

	return "Other";
}

function shortComponentName(component: StatusComponent) {
	return component.name;
}

function componentPriority(component: StatusComponent) {
	const exactIndex = COMPONENT_PRIORITY.indexOf(component.name);
	if (exactIndex >= 0) {
		return exactIndex;
	}

	return 100;
}

export function FooterStatusIndicator() {
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [status, setStatus] = useState<StatusSummary>({
		ok: false,
		state: "unknown",
		label: "Checking status",
		href: STATUS_PAGE_HREF,
	});
	const [open, setOpen] = useState(false);

	useEffect(() => {
		let active = true;

		void fetch("/api/status/summary", { cache: "no-store" })
			.then((response) => response.json() as Promise<StatusSummary>)
			.then((summary) => {
				if (!active) return;
				setStatus({
					ok: Boolean(summary.ok),
					state: summary.state ?? "unknown",
					label: summary.label || "Status unavailable",
					href: summary.href || STATUS_PAGE_HREF,
					components: Array.isArray(summary.components)
						? summary.components
						: [],
				});
			})
			.catch(() => {
				if (!active) return;
				setStatus({
					ok: false,
					state: "unknown",
					label: "Status unavailable",
					href: STATUS_PAGE_HREF,
					components: [],
				});
			});

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		return () => {
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
			}
		};
	}, []);

	const openPopover = () => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
		setOpen(true);
	};

	const closePopover = () => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
		}
		closeTimerRef.current = setTimeout(() => {
			setOpen(false);
			closeTimerRef.current = null;
		}, 220);
	};

	const styles = STATUS_STYLES[status.state] ?? STATUS_STYLES.unknown;
	const components = status.components ?? [];
	const groupedComponents = GROUP_ORDER.map((group) => {
		const groupComponents = components
			.filter((component) => statusGroup(component) === group)
			.sort((a, b) => {
				const aAffected = isAffected(a);
				const bAffected = isAffected(b);
				if (aAffected !== bAffected) return aAffected ? -1 : 1;
				const priorityDiff = componentPriority(a) - componentPriority(b);
				if (priorityDiff !== 0) return priorityDiff;
				return a.name.localeCompare(b.name);
			});

		return {
			group,
			components: groupComponents,
			affected: groupComponents.some(isAffected),
		};
	})
		.filter((group) => group.components.length > 0)
		.sort(
			(a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
		);
	const hasComponents = groupedComponents.length > 0;

	return (
		<span
			className="group/status relative inline-flex after:absolute after:bottom-full after:left-0 after:h-4 after:w-[min(92vw,32rem)] after:content-['']"
			onPointerEnter={openPopover}
			onPointerLeave={closePopover}
			onFocus={openPopover}
			onBlur={(event) => {
				if (event.currentTarget.contains(event.relatedTarget)) return;
				closePopover();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					setOpen(false);
				}
			}}
		>
			<Link
				href={status.href}
				target="_blank"
				rel="noopener noreferrer"
				className={`inline-flex h-8 items-center gap-2 text-xs font-medium leading-none transition-colors ${styles.text}`}
				aria-live="polite"
				aria-label={`${status.label}. Open status page.`}
			>
				<span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
				<span>{status.label}</span>
				<ArrowUpRight className="h-3.5 w-3.5 opacity-55 transition-transform group-hover/status:-translate-y-0.5 group-hover/status:translate-x-0.5 group-hover/status:opacity-100" />
			</Link>
			<span
				className={`absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-[min(92vw,32rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-xl shadow-zinc-950/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/30 ${
					open ? "block" : "hidden"
				}`}
			>
				<span className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-200/80 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950">
					<span className="min-w-0">
						<span className={`block text-xs font-semibold ${styles.text}`}>
							{status.label}
						</span>
					</span>
					<Link
						href={status.href}
						target="_blank"
						rel="noopener noreferrer"
						className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
					>
						Visit status page
						<ArrowUpRight className="h-3 w-3" />
					</Link>
				</span>
				<ScrollArea
					className="h-72 max-h-[60vh]"
					viewportClassName="divide-y divide-zinc-200/70 dark:divide-zinc-800"
				>
					{hasComponents ? (
						groupedComponents.map((group) => (
							<span key={group.group} className="block">
								<span className="sticky top-0 z-10 flex items-center justify-between bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
									<span>{group.group}</span>
									{group.affected ? (
										<span className="normal-case tracking-normal text-amber-700 dark:text-amber-300">
											Affected
										</span>
									) : null}
								</span>
								{group.components.map((component) => {
									const componentStyle =
										STATUS_STYLES[component.state] ?? STATUS_STYLES.unknown;
									const fullLabel = component.parent
										? `${component.name} - ${component.parent}`
										: component.name;

									return (
										<span
											key={`${component.parent ?? "root"}-${component.name}`}
											className="flex items-start justify-between gap-3 px-3 py-2"
											title={fullLabel}
										>
											<span className="flex min-w-0 flex-1 items-start gap-2">
												<span
													className={`mt-1 h-2 w-2 shrink-0 rounded-full ${componentStyle.dot}`}
												/>
												<span className="min-w-0 flex-1">
													<span className="block whitespace-normal break-words text-xs font-medium leading-snug text-zinc-800 dark:text-zinc-200">
														{shortComponentName(component)}
													</span>
													{component.parent ? (
														<span className="mt-0.5 block whitespace-normal break-words text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">
															{component.parent}
														</span>
													) : null}
												</span>
											</span>
											<span
												className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${componentStyle.text}`}
											>
												{component.state === "operational"
													? "Operational"
													: component.label}
											</span>
										</span>
									);
								})}
							</span>
						))
					) : (
						<span className="block px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
							Component-level status is unavailable.
						</span>
					)}
				</ScrollArea>
			</span>
		</span>
	);
}
