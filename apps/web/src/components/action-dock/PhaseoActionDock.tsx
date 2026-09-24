"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
	Boxes,
	Check,
	ChevronLeft,
	ChevronRight,
	Clipboard,
	Link2,
	MessageSquareMore,
	MoreHorizontal,
	Pencil,
	Search,
	X,
	type LucideIcon,
} from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { toast } from "sonner";
import { ProductFeedbackDialog } from "@/components/feedback/ProductFeedbackButton";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
hideActionDockForSession,
isActionDockHiddenForSession,
	readActionDockCorner,
	saveActionDockCorner,
	setActionDockEnabled,
	useActionDockEnabled,
	type ActionDockCorner,
} from "@/lib/actionDockPreferences";

type ActionDockProps = {
	userId: string;
	userRole?: string;
	providerMode?: boolean;
};

type DockAction = {
	id: string;
	label: string;
	icon: LucideIcon;
	onSelect?: () => void;
	keepOpen?: boolean;
};

type ActionGroup = { label: string; actions: DockAction[] };
type DockView = "actions" | "route" | "provider-catalog" | "model-search";

const ModelEditDialog = dynamic(() => import("@/components/(data)/model/edit/ModelEditDialog"), { ssr: false });
const ModelAdminDockPanel = dynamic(
	() => import("@/components/action-dock/ModelAdminDockPanel").then((module) => ({ default: module.ModelAdminDockPanel })),
	{ ssr: false },
);
const ProviderCatalogDockPanel = dynamic(
	() => import("@/components/action-dock/ProviderCatalogDockPanel").then((module) => ({ default: module.ProviderCatalogDockPanel })),
	{ ssr: false },
);
type DragPoint = { x: number; y: number };
type DragSample = DragPoint & { timestamp: number };
type DragStart = {
	pointerId: number;
	x: number;
	y: number;
	originX: number;
	originY: number;
	width: number;
	height: number;
	samples: DragSample[];
	moved: boolean;
};

const DRAG_THRESHOLD = 5;
const DOCK_HORIZONTAL_INSET = 16;
const DOCK_TOP_INSET = 80;
const DOCK_BOTTOM_INSET = 16;
const SNAP_DURATION_MS = 491.22;
// Next.js 16.3.6's --timing-bounce spring profile: it settles quickly with
// only a near-imperceptible overshoot, unlike a generic bounce easing.
const SNAP_EASING = `linear(
	0 0%, 0.005871 1%, 0.022058 2%, 0.046612 3%, 0.077823 4%,
	0.114199 5%, 0.154441 6%, 0.197431 7%, 0.242208 8%, 0.287959 9%,
	0.333995 10%, 0.379743 11%, 0.424732 12%, 0.46858 13%, 0.510982 14%,
	0.551702 15%, 0.590564 16%, 0.627445 17%, 0.662261 18%, 0.694971 19%,
	0.725561 20%, 0.754047 21%, 0.780462 22%, 0.804861 23%, 0.82731 24%,
	0.847888 25%, 0.866679 26%, 0.883775 27%, 0.899272 28%, 0.913267 29%,
	0.925856 30%, 0.937137 31%, 0.947205 32%, 0.956153 33%, 0.96407 34%,
	0.971043 35%, 0.977153 36%, 0.982479 37%, 0.987094 38%, 0.991066 39%,
	0.994462 40%, 0.997339 41%, 0.999755 42%, 1.001761 43%, 1.003404 44%,
	1.004727 45%, 1.00577 46%, 1.006569 47%, 1.007157 48%, 1.007563 49%,
	1.007813 50%, 1.007931 51%, 1.007939 52%, 1.007855 53%, 1.007697 54%,
	1.007477 55%, 1.00721 56%, 1.006907 57%, 1.006576 58%, 1.006228 59%,
	1.005868 60%, 1.005503 61%, 1.005137 62%, 1.004776 63%, 1.004422 64%,
	1.004078 65%, 1.003746 66%, 1.003429 67%, 1.003127 68%, 1.00284 69%,
	1.002571 70%, 1.002318 71%, 1.002082 72%, 1.001863 73%, 1.00166 74%,
	1.001473 75%, 1.001301 76%, 1.001143 77%, 1.001 78%, 1.000869 79%,
	1.000752 80%, 1.000645 81%, 1.00055 82%, 1.000464 83%, 1.000388 84%,
	1.000321 85%, 1.000261 86%, 1.000209 87%, 1.000163 88%, 1.000123 89%,
	1.000088 90%
)`;

const CORNER_LABELS: Record<ActionDockCorner, string> = {
	"top-left": "Top left",
	"top-right": "Top right",
	"bottom-left": "Bottom left",
	"bottom-right": "Bottom right",
};

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function actorLabel(userRole: string | undefined, providerMode: boolean) {
	if (providerMode) return "Provider Admin";
	if (userRole?.toLocaleLowerCase() === "admin") return "Phaseo Admin";
	if (userRole?.toLocaleLowerCase() === "editor") return "Phaseo Editor";
	return "Workspace member";
}

function pageLabel(pathname: string) {
	if (/^\/models\/[^/]+\/[^/]+/.test(pathname)) return "Model details";
	if (pathname.startsWith("/models")) return "Models";
	if (pathname.startsWith("/compare")) return "Compare";
	if (pathname.startsWith("/rankings")) return "Rankings";
	if (pathname.startsWith("/api-providers")) return "Providers";
	if (pathname.startsWith("/apps")) return "Apps";
	if (pathname.startsWith("/settings/keys")) return "API keys";
	if (pathname.startsWith("/settings/workspaces")) return "Workspace settings";
	if (pathname.startsWith("/settings/usage")) return "Usage and activity";
	if (pathname.startsWith("/settings/provider")) return "Provider tools";
	if (pathname.startsWith("/internal")) return "Internal tools";
	if (pathname.startsWith("/chat")) return "Chat";
	if (pathname === "/") return "Home";
	return "Page details";
}

function positionStyle(corner: ActionDockCorner): CSSProperties {
	const top = "calc(var(--site-notice-height, 0px) + 5rem)";
	const bottom = "calc(env(safe-area-inset-bottom, 0px) + 1rem)";
	const horizontal = DOCK_HORIZONTAL_INSET;
	if (corner === "top-left") return { top, left: horizontal };
	if (corner === "top-right") return { top, right: horizontal };
	if (corner === "bottom-left") return { bottom, left: horizontal };
	return { bottom, right: horizontal };
}

function getCornerCenters(width: number, height: number): Record<ActionDockCorner, DragPoint> {
	const siteNoticeHeight = Number.parseFloat(
		window.getComputedStyle(document.documentElement).getPropertyValue("--site-notice-height"),
	) || 0;
	const top = siteNoticeHeight + DOCK_TOP_INSET;
	const left = DOCK_HORIZONTAL_INSET;
	const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
	const right = window.innerWidth - scrollbarWidth - DOCK_HORIZONTAL_INSET - width;
	const bottomY = window.innerHeight - DOCK_BOTTOM_INSET - height;

	return {
		"top-left": { x: left + width / 2, y: top + height / 2 },
		"top-right": { x: right + width / 2, y: top + height / 2 },
		"bottom-left": { x: left + width / 2, y: bottomY + height / 2 },
		"bottom-right": { x: right + width / 2, y: bottomY + height / 2 },
	};
}

function calculateDragVelocity(samples: DragSample[]): DragPoint {
	if (samples.length < 2) return { x: 0, y: 0 };
	const first = samples[0];
	const last = samples[samples.length - 1];
	const elapsed = last.timestamp - first.timestamp;
	if (elapsed <= 0) return { x: 0, y: 0 };
	return {
		x: ((last.x - first.x) / elapsed) * 1000,
		y: ((last.y - first.y) / elapsed) * 1000,
	};
}

async function writeClipboardText(value: string) {
	try {
		if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
		await navigator.clipboard.writeText(value);
		return;
	} catch {
		const textarea = document.createElement("textarea");
		textarea.value = value;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.top = "0";
		textarea.style.left = "-9999px";
		document.body.appendChild(textarea);
		try {
			textarea.select();
			if (!document.execCommand("copy")) throw new Error("Clipboard write failed");
		} finally {
			textarea.remove();
		}
	}
}

async function copyText(value: string, label: string) {
	try {
		await writeClipboardText(value);
		toast.success(`${label} copied`, { description: "Ready to paste." });
	} catch {
		toast.error(`Could not copy ${label.toLowerCase()}`);
	}
}

export function PhaseoActionDock({ userId, userRole, providerMode = false }: ActionDockProps) {
	const pathname = usePathname() ?? "/";
	const mounted = useSyncExternalStore(
		subscribeToHydration,
		getClientSnapshot,
		getServerSnapshot,
	);
	const [corner, setCorner] = useState<ActionDockCorner>(() => readActionDockCorner(userId));
	const [open, setOpen] = useState(false);
	const [view, setView] = useState<DockView>("actions");
	const [modelEditOpen, setModelEditOpen] = useState(false);
	const [editingModelId, setEditingModelId] = useState<string | null>(null);
	const [hiddenForSession, setHiddenForSession] = useState(
		() => isActionDockHiddenForSession(userId),
	);
	const actionDockEnabled = useActionDockEnabled(userId);
	const [query, setQuery] = useState("");
	const [dragPoint, setDragPoint] = useState<DragPoint | null>(null);
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const dragStartRef = useRef<DragStart | null>(null);
	const suppressNextClickRef = useRef(false);
	const dockRef = useRef<HTMLDivElement>(null);
	const snapFromRectRef = useRef<DragPoint | null>(null);

	useLayoutEffect(() => {
		const start = snapFromRectRef.current;
		const dockElement = dockRef.current;
		if (!start || !dockElement || dragPoint !== null) return;
		snapFromRectRef.current = null;

		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const target = dockElement.getBoundingClientRect();
		const deltaX = start.x - target.left;
		const deltaY = start.y - target.top;
		if (deltaX === 0 && deltaY === 0) return;

		const animation = dockElement.animate(
			[
				{ transform: `translate(${deltaX}px, ${deltaY}px)` },
				{ transform: "translate(0, 0)" },
			],
			{
				duration: SNAP_DURATION_MS,
				easing: CSS.supports("animation-timing-function", SNAP_EASING)
					? SNAP_EASING
					: "ease-in-out",
			},
		);

		return () => animation.cancel();
	}, [corner, dragPoint]);

	const modelId = useMemo(() => {
		if (!pathname.startsWith("/models/")) return null;
		const id = pathname.slice("/models/".length).replace(/\/$/, "");
		return id.includes("/") ? decodeURIComponent(id) : null;
	}, [pathname]);
	const isPhaseoAdmin = userRole?.toLocaleLowerCase() === "admin";
	const dockLabel = providerMode
		? "Open provider action dock"
		: isPhaseoAdmin
			? "Open Phaseo admin action dock"
			: "Open Phaseo action dock";
	const routeSegments = useMemo(
		() => pathname.split("/").filter(Boolean),
		[pathname],
	);

	const pageActions = useMemo<DockAction[]>(() => {
		const actions: DockAction[] = [];
		if (modelId) {
			actions.push({
				id: "copy-model-id",
				label: "Copy model ID",
				icon: Clipboard,
				onSelect: () => void copyText(modelId, "Model ID"),
			});
		}
		actions.push({
			id: "copy-page-link",
			label: "Copy page link",
			icon: Link2,
			onSelect: () => void copyText(window.location.href, "Page link"),
		});
		if (isPhaseoAdmin || providerMode) {
			actions.push({
				id: "route-info",
				label: "Route info",
				icon: Link2,
				onSelect: () => setView("route"),
				keepOpen: true,
			});
		}
		actions.push({
			id: "report-issue",
			label: "Report an issue",
			icon: MessageSquareMore,
			onSelect: () => setFeedbackOpen(true),
		});
		return actions;
	}, [isPhaseoAdmin, modelId, providerMode, setFeedbackOpen, setView]);

	const adminGroups = useMemo<ActionGroup[]>(() => [
		...(isPhaseoAdmin ? [{
			label: "Phaseo Admin",
			actions: [
				...(modelId ? [{
					id: "edit-current-model",
					label: "Edit this model",
					icon: Pencil,
					onSelect: () => {
						setEditingModelId(modelId);
						setModelEditOpen(true);
					},
				}] : []),
				{
					id: "search-models-to-edit",
					label: "Find a model to edit",
					icon: Search,
					onSelect: () => setView("model-search"),
					keepOpen: true,
				},
			],
		}] : []),
		...(providerMode ? [{
			label: "Provider Admin",
			actions: [{
				id: "edit-provider-catalog",
				label: "Edit provider catalog",
				icon: Boxes,
				onSelect: () => setView("provider-catalog"),
				keepOpen: true,
			}],
		}] : []),
	], [isPhaseoAdmin, modelId, providerMode]);

	const groups = useMemo<ActionGroup[]>(() => {
		const candidateGroups: ActionGroup[] = [
			{ label: "Page Actions", actions: pageActions },
			...adminGroups,
		];
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return candidateGroups
			.map((group) => ({
				...group,
				actions: normalizedQuery
					? group.actions.filter((action) => action.label.toLocaleLowerCase().includes(normalizedQuery))
					: group.actions,
			}))
			.filter((group) => group.actions.length > 0);
	}, [adminGroups, pageActions, query]);

	const handlePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
		if (open || event.button !== 0 || !event.isPrimary) return;
		const rect = event.currentTarget.getBoundingClientRect();
		event.currentTarget.setPointerCapture(event.pointerId);
		const timestamp = Date.now();
		dragStartRef.current = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			originX: rect.left + rect.width / 2,
			originY: rect.top + rect.height / 2,
			width: rect.width,
			height: rect.height,
			samples: [{ x: event.clientX, y: event.clientY, timestamp }],
			moved: false,
		};
	}, [open]);

	const handlePointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
		const dragStart = dragStartRef.current;
		if (!dragStart || dragStart.pointerId !== event.pointerId) return;
		if (!dragStart.moved) {
			const distance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y);
			if (distance < DRAG_THRESHOLD) return;
			dragStart.moved = true;
			setOpen(false);
		}
		const timestamp = Date.now();
		const lastSample = dragStart.samples[dragStart.samples.length - 1];
		if (timestamp - lastSample.timestamp >= 10) {
			dragStart.samples = [
				...dragStart.samples.slice(-5),
				{ x: event.clientX, y: event.clientY, timestamp },
			];
		}
		setDragPoint({
			x: dragStart.originX + event.clientX - dragStart.x,
			y: dragStart.originY + event.clientY - dragStart.y,
		});
	}, []);

	const finishPointerMove = useCallback((event: PointerEvent<HTMLButtonElement>, suppressClick: boolean) => {
		const dragStart = dragStartRef.current;
		if (!dragStart || dragStart.pointerId !== event.pointerId) return;
		dragStartRef.current = null;
		if (!dragStart.moved) return;
		if (suppressClick) {
			suppressNextClickRef.current = true;
			window.setTimeout(() => {
				suppressNextClickRef.current = false;
			}, 0);
		}
		const finalX = dragStart.originX + event.clientX - dragStart.x;
		const finalY = dragStart.originY + event.clientY - dragStart.y;
		const pointerTimestamp = Date.now();
		const lastSample = dragStart.samples[dragStart.samples.length - 1];
		if (pointerTimestamp - lastSample.timestamp >= 10) {
			dragStart.samples = [
				...dragStart.samples.slice(-5),
				{ x: event.clientX, y: event.clientY, timestamp: pointerTimestamp },
			];
		}
		const velocity = calculateDragVelocity(dragStart.samples);
		const projectedCenter = {
			x: finalX + velocity.x * 0.999,
			y: finalY + velocity.y * 0.999,
		};
		const corners = getCornerCenters(dragStart.width, dragStart.height);
		const nextCorner = (Object.keys(corners) as ActionDockCorner[]).reduce((nearest, candidate) => {
			const candidateDistance = Math.hypot(
				corners[candidate].x - projectedCenter.x,
				corners[candidate].y - projectedCenter.y,
			);
			const nearestDistance = Math.hypot(
				corners[nearest].x - projectedCenter.x,
				corners[nearest].y - projectedCenter.y,
			);
			return candidateDistance < nearestDistance ? candidate : nearest;
		});
		snapFromRectRef.current = {
			x: finalX - dragStart.width / 2,
			y: finalY - dragStart.height / 2,
		};
		setCorner(nextCorner);
		saveActionDockCorner(userId, nextCorner);
		setDragPoint(null);
	}, [userId]);

	const handlePointerUp = useCallback((event: PointerEvent<HTMLButtonElement>) => {
		finishPointerMove(event, true);
	}, [finishPointerMove]);

	const handlePointerCancel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
		finishPointerMove(event, false);
	}, [finishPointerMove]);

	const moveToCorner = useCallback((nextCorner: ActionDockCorner) => {
		setCorner(nextCorner);
		saveActionDockCorner(userId, nextCorner);
	}, [userId]);

	const hideForSession = useCallback(() => {
		hideActionDockForSession(userId);
		setOpen(false);
		setHiddenForSession(true);
	}, [userId]);

	const disableOnDevice = useCallback(() => {
		setActionDockEnabled(userId, false);
		setOpen(false);
		toast.success("Phaseo action dock turned off", {
			description: "You can turn it back on from your profile menu.",
		});
	}, [userId]);

	if (!mounted || !actionDockEnabled || hiddenForSession || (!isPhaseoAdmin && !providerMode)) return null;
	if (typeof document === "undefined") return null;

	const popoverSide = corner.startsWith("top") ? "bottom" : "top";
	const popoverAlign = corner.endsWith("left") ? "start" : "end";
	const dockStyle: CSSProperties = dragPoint
		? {
				left: dragPoint.x,
				top: dragPoint.y,
				transform: "translate(-50%, -50%)",
			}
		: positionStyle(corner);

	const dock = (
		<div
			ref={dockRef}
			data-phaseo-action-dock
			className={cn(
				"fixed z-[70] size-10",
				dragPoint && "cursor-grabbing",
			)}
			style={dockStyle}
		>
			<Popover
				open={open}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
					if (!nextOpen) setView("actions");
				}}
			>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="icon-lg"
						aria-label={dockLabel}
						title={providerMode ? "Provider admin tools" : "Phaseo admin tools"}
						aria-expanded={open}
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerCancel}
						onClickCapture={(event) => {
							if (!suppressNextClickRef.current || event.detail === 0) return;
							suppressNextClickRef.current = false;
							event.preventDefault();
							event.stopPropagation();
						}}
						className={cn(
							"size-10 touch-none select-none rounded-full border-border/80 bg-background/95 shadow-lg backdrop-blur transition-[transform,background-color,border-color] duration-150 hover:scale-[1.02] hover:bg-accent active:scale-95 data-[state=open]:border-primary/50 data-[state=open]:bg-popover motion-reduce:transition-none",
							dragPoint ? "cursor-grabbing" : open ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
							"relative",
						)}
					>
						<Image src="/logo_light.svg" alt="" width={24} height={24} draggable={false} className="pointer-events-none size-6 select-none dark:hidden" />
						<Image src="/logo_dark.svg" alt="" width={24} height={24} draggable={false} className="pointer-events-none hidden size-6 select-none dark:block" />
						<span
							aria-hidden="true"
							className={cn(
								"pointer-events-none absolute -right-px -top-px size-3 rounded-full border-2 border-background shadow-sm",
								providerMode ? "bg-green-600" : "bg-blue-600",
							)}
						/>
					</Button>
				</PopoverTrigger>
				<PopoverContent
					side={popoverSide}
					align={popoverAlign}
					sideOffset={10}
					className={cn(
						"w-[min(18rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-2xl",
						view === "provider-catalog" && "w-[min(42rem,calc(100vw-2rem))]",
						view === "model-search" && "w-[min(25rem,calc(100vw-2rem))]",
					)}
				>
				{view === "actions" ? (
						<>
							<div className="flex items-center justify-between px-3 pb-1 pt-3">
								<span className="text-xs font-medium text-muted-foreground">Action Dock</span>
								<span className={cn(
								"rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-none",
									providerMode
										? "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-400"
										: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400",
								)}>
									{providerMode ? "Provider" : "Admin"}
								</span>
							</div>
							<div className="flex items-center gap-1.5 px-2.5 pb-2 pt-1">
								<div className="relative min-w-0 flex-1">
									<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={query}
										onChange={(event) => setQuery(event.target.value)}
										placeholder="Search actions"
										aria-label="Search actions"
										className="h-9 rounded-lg border-border bg-muted/30 pl-8 text-sm"
									/>
								</div>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon-sm" aria-label="Action dock settings" className="size-9 shrink-0 rounded-lg text-muted-foreground">
											<MoreHorizontal className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-52">
										<DropdownMenuGroup>
											<DropdownMenuLabel>Action Dock</DropdownMenuLabel>
										</DropdownMenuGroup>
										<DropdownMenuSub>
											<DropdownMenuSubTrigger><span>Move to corner</span></DropdownMenuSubTrigger>
											<DropdownMenuSubContent>
												{(Object.keys(CORNER_LABELS) as ActionDockCorner[]).map((option) => (
													<DropdownMenuItem key={option} onClick={() => moveToCorner(option)}>
														<span className="flex size-4 items-center justify-center">
															{corner === option ? <Check className="size-3.5" /> : null}
														</span>
														{CORNER_LABELS[option]}
													</DropdownMenuItem>
												))}
											</DropdownMenuSubContent>
										</DropdownMenuSub>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={hideForSession}>Hide for this session</DropdownMenuItem>
										<DropdownMenuItem variant="destructive" onClick={disableOnDevice}>Turn off on this device</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							<Separator />
							<ScrollArea className="max-h-[min(25rem,calc(100dvh-10rem))]" viewportClassName="max-h-[inherit]">
								<div className="space-y-3 px-2.5 py-3">
									{groups.length ? groups.map((group) => (
										<section key={group.label} aria-label={group.label}>
											<h3 className="px-1.5 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</h3>
											<div className="space-y-0.5">
											{group.actions.map((action) => {
												const Icon = action.icon;
												return (
													<Button
														key={action.id}
														variant="ghost"
														size="sm"
														className="h-9 w-full justify-start gap-2 rounded-lg px-2.5 font-normal hover:bg-accent"
														onClick={() => {
															action.onSelect?.();
															if (!action.keepOpen) setOpen(false);
														}}
													>
														<Icon className="size-4 text-muted-foreground" />
														<span className="min-w-0 flex-1 truncate text-left">{action.label}</span>
														<ChevronRight className="ml-auto size-3.5 text-muted-foreground/70" />
													</Button>
												);
											})}
											</div>
										</section>
									)) : (
										<p className="px-2 py-8 text-center text-sm text-muted-foreground">No actions match “{query}”.</p>
									)}
								</div>
							</ScrollArea>
						</>
					) : view === "route" ? (
						<>
							<div className="flex items-center justify-between border-b px-2.5 py-2">
								<div className="flex min-w-0 items-center gap-1.5">
									<Button variant="ghost" size="icon-sm" aria-label="Back to actions" className="size-8 shrink-0 rounded-lg" onClick={() => setView("actions")}>
										<ChevronLeft className="size-4" />
									</Button>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">Route info</p>
										<p className="truncate text-xs text-muted-foreground">{pageLabel(pathname)}</p>
									</div>
								</div>
								<Button variant="ghost" size="icon-sm" aria-label="Close action dock" className="size-8 shrink-0 rounded-lg text-muted-foreground" onClick={() => setOpen(false)}>
									<X className="size-4" />
								</Button>
							</div>
							<ScrollArea className="max-h-[min(25rem,calc(100dvh-10rem))]" viewportClassName="max-h-[inherit]">
								<div className="space-y-4 px-3 py-3">
									<div className="space-y-1">
										<p className="text-xs font-medium text-muted-foreground">Current Path</p>
										<code className="block break-all rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs">{pathname}</code>
									</div>
									<div className="space-y-1">
										<p className="text-xs font-medium text-muted-foreground">URL Segments</p>
										<div className="space-y-1">
											{(routeSegments.length ? routeSegments : ["/"]).map((segment, index) => (
												<div key={`${segment}-${index}`} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm">
													<span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] text-muted-foreground">{index + 1}</span>
													<code className="min-w-0 truncate">{segment}</code>
												</div>
											))}
										</div>
									</div>
									{modelId ? (
										<div className="space-y-1">
												<p className="text-xs font-medium text-muted-foreground">Model ID</p>
											<code className="block break-all rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs">{modelId}</code>
										</div>
									) : null}
									<div className="flex items-center justify-between gap-2 border-t pt-3 text-xs">
										<span className="truncate text-muted-foreground">{actorLabel(userRole, providerMode)}</span>
						<Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => void copyText(pathname, "Route")}>
											<Clipboard className="size-3.5" />
											Copy route
										</Button>
									</div>
								</div>
							</ScrollArea>
						</>
					) : view === "provider-catalog" ? (
						<>
							<div className="flex items-center justify-between border-b px-2.5 py-2">
								<div className="flex min-w-0 items-center gap-1.5">
									<Button variant="ghost" size="icon-sm" aria-label="Back to actions" className="size-8 shrink-0 rounded-lg" onClick={() => setView("actions")}>
										<ChevronLeft className="size-4" />
									</Button>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">Provider catalog</p>
										<p className="truncate text-xs text-muted-foreground">Edit your models, pricing, and release details</p>
									</div>
								</div>
								<Button variant="ghost" size="icon-sm" aria-label="Close action dock" className="size-8 shrink-0 rounded-lg text-muted-foreground" onClick={() => setOpen(false)}>
									<X className="size-4" />
								</Button>
							</div>
							<ScrollArea className="max-h-[min(38rem,calc(100dvh-8rem))]" viewportClassName="max-h-[inherit]">
								<div className="px-4 py-2">
									<ProviderCatalogDockPanel userId={userId} />
								</div>
							</ScrollArea>
						</>
					) : (
						<>
							<div className="flex items-center justify-between border-b px-2.5 py-2">
								<div className="flex min-w-0 items-center gap-1.5">
									<Button variant="ghost" size="icon-sm" aria-label="Back to actions" className="size-8 shrink-0 rounded-lg" onClick={() => setView("actions")}>
										<ChevronLeft className="size-4" />
									</Button>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">Find a model to edit</p>
										<p className="truncate text-xs text-muted-foreground">Search the full model catalog</p>
									</div>
								</div>
								<Button variant="ghost" size="icon-sm" aria-label="Close action dock" className="size-8 shrink-0 rounded-lg text-muted-foreground" onClick={() => setOpen(false)}>
									<X className="size-4" />
								</Button>
							</div>
							<ModelAdminDockPanel
								userId={userId}
								onSelect={(selectedModelId) => {
									setEditingModelId(selectedModelId);
									setModelEditOpen(true);
									setOpen(false);
								}}
							/>
						</>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);

	return createPortal(
		<>
			{dock}
			{modelEditOpen && editingModelId && isPhaseoAdmin ? (
				<ModelEditDialog
					modelId={editingModelId}
					open={modelEditOpen}
					onOpenChange={(nextOpen) => {
						setModelEditOpen(nextOpen);
						if (!nextOpen) setEditingModelId(null);
					}}
				/>
			) : null}
			<ProductFeedbackDialog
				open={feedbackOpen}
				onOpenChange={setFeedbackOpen}
				surface="action_dock"
				title="Report an issue"
				defaultCategory="issue"
				defaultReason="reliability"
				prompt="Tell us what went wrong on this page."
			/>
		</>,
		document.body,
	);
}
