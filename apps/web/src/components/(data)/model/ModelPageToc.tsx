"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
	Activity,
	AppWindow,
	BadgeInfo,
	Bolt,
	CircleDollarSign,
	CreditCard,
	Gauge,
	Image,
	ImagePlus,
	PieChart,
	ScrollText,
	Store,
	Trophy,
	Users,
	Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ModelPageTocItem = {
	id: string;
	label: string;
};

const sectionIcons: Record<string, LucideIcon> = {
	providers: Store,
	performance: Gauge,
	pricing: CircleDollarSign,
	benchmarks: Trophy,
	apps: AppWindow,
	activity: Activity,
	subscriptions: CreditCard,
	quickstart: Bolt,
	about: BadgeInfo,
	"unique-users": Users,
	"market-share": PieChart,
	"tool-calls": Wrench,
	images: Image,
	"image-output": ImagePlus,
};

const activeSectionTopOffset = 212;
const programmaticScrollLockMs = 1400;

function useActiveSection(items: ModelPageTocItem[]) {
	const [activeId, setActiveId] = useState(items[0]?.id ?? "");
	const programmaticTargetRef = useRef<{
		id: string;
		expiresAt: number;
	} | null>(null);

	useEffect(() => {
		if (!items.length) return;

		const itemIdSet = new Set(items.map((item) => item.id));

		const normalizeHash = () =>
			window.location.hash
				.split("#")
				.filter(Boolean)
				.pop() ?? "";

		const handleHashChange = () => {
			const nextHash = normalizeHash();
			if (!nextHash || !itemIdSet.has(nextHash)) return;
			setActiveId(nextHash);
		};

		handleHashChange();

		let frameId = 0;
		const updateFromScroll = () => {
			frameId = 0;
			const sections = items
				.map((item) => document.getElementById(item.id))
				.filter((section): section is HTMLElement => Boolean(section));
			if (!sections.length) return;

			const programmaticTarget = programmaticTargetRef.current;
			if (programmaticTarget) {
				const target = document.getElementById(programmaticTarget.id);
				const targetTop = target?.getBoundingClientRect().top;
				const targetReached =
					typeof targetTop === "number" &&
					Math.abs(targetTop - activeSectionTopOffset) <= 120;
				if (
					Date.now() < programmaticTarget.expiresAt &&
					!targetReached
				) {
					return;
				}
				programmaticTargetRef.current = null;
			}

			let nextId = sections[0]?.id ?? "";
			for (const section of sections) {
				const rect = section.getBoundingClientRect();
				if (rect.top <= activeSectionTopOffset) {
					nextId = section.id;
				} else {
					break;
				}
			}

			if (!nextId || !itemIdSet.has(nextId)) return;
			setActiveId(nextId);
		};

		const requestScrollSync = () => {
			if (frameId) return;
			frameId = window.requestAnimationFrame(updateFromScroll);
		};

		requestScrollSync();
		window.addEventListener("scroll", requestScrollSync, { passive: true });
		document.addEventListener("scroll", requestScrollSync, {
			capture: true,
			passive: true,
		});
		window.addEventListener("resize", requestScrollSync);
		window.addEventListener("hashchange", handleHashChange);
		const mutationObserver = new MutationObserver(requestScrollSync);
		mutationObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});

		return () => {
			if (frameId) {
				window.cancelAnimationFrame(frameId);
			}
			window.removeEventListener("scroll", requestScrollSync);
			document.removeEventListener("scroll", requestScrollSync, true);
			window.removeEventListener("resize", requestScrollSync);
			window.removeEventListener("hashchange", handleHashChange);
			mutationObserver.disconnect();
		};
	}, [items]);

	const setProgrammaticActiveId = useCallback((id: string) => {
		programmaticTargetRef.current = {
			id,
			expiresAt: Date.now() + programmaticScrollLockMs,
		};
		setActiveId(id);
	}, []);

	return { activeId, setProgrammaticActiveId };
}

function usePinnedMobileToc(anchorId: string) {
	const [pinned, setPinned] = useState(false);

	useEffect(() => {
		const target = document.getElementById(anchorId);
		if (!target) return;

		let frameId = 0;
		const update = () => {
			frameId = 0;
			const rect = target.getBoundingClientRect();
			setPinned(rect.top <= 0);
		};

		const requestUpdate = () => {
			if (frameId) return;
			frameId = window.requestAnimationFrame(update);
		};

		requestUpdate();
		window.addEventListener("scroll", requestUpdate, { passive: true });
		window.addEventListener("resize", requestUpdate);

		return () => {
			if (frameId) window.cancelAnimationFrame(frameId);
			window.removeEventListener("scroll", requestUpdate);
			window.removeEventListener("resize", requestUpdate);
		};
	}, [anchorId]);

	return pinned;
}

export default function ModelPageToc({
	items,
	className,
}: {
	items: ModelPageTocItem[];
	className?: string;
}) {
	const filteredItems = useMemo(
		() => items.filter((item) => item.id && item.label),
		[items],
	);
	const { activeId, setProgrammaticActiveId } = useActiveSection(filteredItems);
	const mobileAnchorId = "model-page-toc-mobile-anchor";
	const mobilePinned = usePinnedMobileToc(mobileAnchorId);
	const activeItem =
		filteredItems.find((item) => item.id === activeId) ?? filteredItems[0] ?? null;
	const activeIndex = Math.max(
		filteredItems.findIndex((item) => item.id === activeItem?.id),
		0,
	);

	const scrollToSection = useCallback((id: string) => {
		const section = document.getElementById(id);
		if (!section) return;
		setProgrammaticActiveId(id);
		section.scrollIntoView({
			behavior: "smooth",
			block: "start",
			inline: "nearest",
		});
		const nextUrl = `${window.location.pathname}${window.location.search}#${id}`;
		window.history.pushState(null, "", nextUrl);
	}, [setProgrammaticActiveId]);

	if (!filteredItems.length) return null;

	const renderMobileSelect = (variant: "inline" | "pinned") => (
		<div
			className={cn(
				"w-full",
				variant === "inline" ? "rounded-2xl" : null,
			)}
		>
			<Select
				value={activeItem?.id}
				onValueChange={scrollToSection}
			>
				<SelectTrigger
					className={cn(
						"w-full justify-between text-left shadow-none",
						variant === "inline"
							? "h-9 rounded-2xl border border-border/70 bg-background/90 px-3 hover:bg-muted/35"
							: "h-10 rounded-none border-0 bg-transparent px-0 focus:ring-0",
					)}
				>
					<div className="flex min-w-0 items-center gap-2">
						{activeItem ? (
							<>
								{(() => {
									const Icon = sectionIcons[activeItem.id] ?? ScrollText;
									return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
								})()}
								<SelectValue
									placeholder="Jump to section"
									className="min-w-0"
								>
									<span className="truncate text-sm font-medium text-foreground">
										{activeItem.label}
									</span>
								</SelectValue>
							</>
						) : (
							<SelectValue placeholder="Jump to section" />
						)}
					</div>
				</SelectTrigger>
				<SelectContent
					align="start"
					sideOffset={4}
					className="max-h-[min(24rem,var(--available-height))] min-w-[14rem]"
				>
					{filteredItems.map((item) => {
						const isActive = activeId === item.id;
						const Icon = sectionIcons[item.id] ?? ScrollText;
						return (
							<SelectItem
								key={item.id}
								value={item.id}
								className={cn(
									"min-h-8 pr-8",
									isActive
										? "bg-muted text-foreground"
										: "text-muted-foreground",
								)}
							>
								<div className="flex min-w-0 items-center gap-2">
									<Icon
										className={cn(
											"h-4 w-4 shrink-0",
											isActive ? "text-foreground" : "text-muted-foreground",
										)}
									/>
									<span className="min-w-0 flex-1 truncate text-sm font-medium">
										{item.label}
									</span>
								</div>
							</SelectItem>
						);
					})}
				</SelectContent>
			</Select>
		</div>
	);

	return (
		<div
			className={cn(
				"min-w-0 lg:sticky lg:top-[calc(var(--site-notice-height,0px)+var(--site-header-height,3.75rem)+4.25rem)] lg:max-h-[calc(100dvh-var(--site-notice-height,0px)-var(--site-header-height,3.75rem)-5.25rem)] lg:w-full lg:self-start lg:overflow-y-auto",
				className,
			)}
		>
			<div className="lg:hidden">
				<div id={mobileAnchorId}>{renderMobileSelect("inline")}</div>
				<div
					className={cn(
						"pointer-events-none fixed inset-x-0 top-[calc(var(--site-notice-height,0px)+var(--site-header-height,3.75rem)+3.25rem)] z-30 border-b border-border/70 bg-background/95 backdrop-blur transition-all duration-200",
						mobilePinned
							? "translate-y-0 opacity-100"
							: "-translate-y-2 opacity-0",
					)}
				>
					<div className="pointer-events-auto container mx-auto px-4 py-2">
						{renderMobileSelect("pinned")}
					</div>
				</div>
			</div>

			<aside className="hidden h-full min-w-0 lg:block lg:w-full">
				<div className="w-full min-w-0">
					<nav className="w-full min-w-0">
						<div
							className="relative flex w-full min-w-0 flex-col gap-1"
							style={
								{
									"--toc-active-index": activeIndex,
								} as CSSProperties
							}
						>
							<span
								aria-hidden="true"
								className="pointer-events-none absolute inset-x-0 top-0 h-8 rounded-md bg-muted transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
								style={{
									transform:
										"translateY(calc(var(--toc-active-index) * 2.25rem))",
								}}
							/>
							{filteredItems.map((item) => {
								const isActive = activeId === item.id;
								const Icon = sectionIcons[item.id] ?? ScrollText;
								return (
									<button
										key={item.id}
										type="button"
										aria-current={isActive ? "location" : undefined}
										data-active={isActive ? "true" : undefined}
										onClick={() => scrollToSection(item.id)}
										className={cn(
											"relative z-10 flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 text-left text-[13px] transition-colors duration-200 motion-reduce:transition-none",
											isActive
												? "text-foreground"
												: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
										)}
									>
										<Icon
											className={cn(
												"h-3.5 w-3.5 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
												isActive ? "scale-105" : "scale-100",
											)}
										/>
										<span className="min-w-0 flex-1 truncate">{item.label}</span>
									</button>
								);
							})}
						</div>
					</nav>
				</div>
			</aside>
		</div>
	);
}
