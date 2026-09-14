"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type RefObject,
} from "react";
import { FileText } from "lucide-react";
import {
	useMessageScroller,
	useMessageScrollerScrollable,
	useMessageScrollerVisibility,
} from "@shadcn/react/message-scroller";
import type { ChatMessage } from "@/lib/indexeddb/chats";
import { cn } from "@/lib/utils";

type ConversationTurn = {
	user: ChatMessage;
	assistant: ChatMessage | null;
	messageIds: string[];
};

const HOVER_MARKER_WIDTHS = [28, 18, 12, 8] as const;
const DEFAULT_MARKER_WIDTH = 6;

function getMessagePreview(message: ChatMessage) {
	const preview = message.content.replace(/\s+/g, " ").trim();
	return preview || "Attachment or empty message";
}

function getAttachmentLabel(meta: ChatMessage["meta"]) {
	if (!meta || typeof meta !== "object") return null;

	const metadata = meta as Record<string, unknown>;
	const previews = Array.isArray(metadata.attachment_previews)
		? metadata.attachment_previews
				.map((entry) => {
					if (!entry || typeof entry !== "object") return null;
					const name = (entry as Record<string, unknown>).name;
					return typeof name === "string" && name.trim() ? name.trim() : null;
				})
				.filter((name): name is string => Boolean(name))
		: [];

	if (previews.length === 1) return previews[0];
	if (previews.length > 1) {
		return `${previews[0]} + ${previews.length - 1} more`;
	}

	const requestContext =
		metadata.request_context &&
		typeof metadata.request_context === "object" &&
		!Array.isArray(metadata.request_context)
			? (metadata.request_context as Record<string, unknown>)
			: null;
	const count = requestContext?.attachments_count;
	if (typeof count === "number" && Number.isFinite(count) && count > 0) {
		return `${count} attachment${count === 1 ? "" : "s"}`;
	}

	return null;
}

function getConversationTurns(messages: ChatMessage[]) {
	const turns: ConversationTurn[] = [];
	let currentTurn: ConversationTurn | null = null;

	for (const message of messages) {
		if (message.role === "user") {
			if (currentTurn) turns.push(currentTurn);
			currentTurn = {
				user: message,
				assistant: null,
				messageIds: [message.id],
			};
		} else if (currentTurn) {
			currentTurn.messageIds.push(message.id);
			if (!currentTurn.assistant) currentTurn.assistant = message;
		}
	}

	if (currentTurn) turns.push(currentTurn);
	return turns;
}

function getMarkerClass(
	isCurrent: boolean,
	isVisible: boolean,
	isNavigatingTarget: boolean,
	hoverDistance: number,
	isActive: boolean,
) {
	if (isCurrent) {
		return isActive && hoverDistance === 0
			? "h-0.5 bg-foreground"
			: "h-px bg-foreground";
	}
	if (isNavigatingTarget && hoverDistance === 0) {
		return "h-0.5 bg-foreground/60";
	}
	if (isActive) {
		if (hoverDistance === 0) return "h-0.5 bg-foreground";
		if (hoverDistance === 1) return "h-px bg-foreground/80";
		if (hoverDistance === 2) return "h-px bg-foreground/60";
		if (hoverDistance === 3) return "h-px bg-foreground/45";
	}
	if (isVisible) return "h-px bg-foreground";
	return "h-px bg-muted-foreground/45";
}

export function ChatMessageNavigationRail({
	messages,
	scrollViewportRef,
}: {
	messages: ChatMessage[];
	scrollViewportRef?: RefObject<HTMLDivElement | null>;
}) {
	const { scrollToMessage } = useMessageScroller();
	const { start: canScrollToStart, end: canScrollToEnd } =
		useMessageScrollerScrollable();
	const { currentAnchorId, visibleMessageIds } =
		useMessageScrollerVisibility();
	const [hoveredTurnId, setHoveredTurnId] = useState<string | null>(null);
	const [navigatingTurnId, setNavigatingTurnId] = useState<string | null>(null);
	const [isHoverTransitionReady, setIsHoverTransitionReady] = useState(false);
	const hidePreviewTimeoutRef = useRef<number | null>(null);
	const navigationTimeoutRef = useRef<number | null>(null);

	const turns = useMemo(() => getConversationTurns(messages), [messages]);
	const activeTurnId = hoveredTurnId ?? navigatingTurnId;
	const activeTurnIndex = activeTurnId
		? turns.findIndex((turn) => turn.user.id === activeTurnId)
		: -1;
	const previewTurnIndex = hoveredTurnId
		? turns.findIndex((turn) => turn.user.id === hoveredTurnId)
		: -1;
	const previewTurn = previewTurnIndex >= 0 ? turns[previewTurnIndex] : null;

	const clearHidePreview = useCallback(() => {
		if (hidePreviewTimeoutRef.current !== null) {
			window.clearTimeout(hidePreviewTimeoutRef.current);
			hidePreviewTimeoutRef.current = null;
		}
	}, []);

	const showPreview = useCallback(
		(turnId: string) => {
			clearHidePreview();
			setHoveredTurnId(turnId);
		},
		[clearHidePreview],
	);

	const scheduleHidePreview = useCallback(() => {
		clearHidePreview();
		hidePreviewTimeoutRef.current = window.setTimeout(() => {
			setHoveredTurnId(null);
			hidePreviewTimeoutRef.current = null;
		}, 120);
	}, [clearHidePreview]);

	const clearNavigation = useCallback(() => {
		if (navigationTimeoutRef.current !== null) {
			window.clearTimeout(navigationTimeoutRef.current);
			navigationTimeoutRef.current = null;
		}
		setNavigatingTurnId(null);
	}, []);

	useEffect(() => {
		return () => clearHidePreview();
	}, [clearHidePreview]);

	useEffect(() => {
		return () => {
			if (navigationTimeoutRef.current !== null) {
				window.clearTimeout(navigationTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!navigatingTurnId || currentAnchorId !== navigatingTurnId) return;
		const frame = window.requestAnimationFrame(() => {
			clearNavigation();
		});
		return () => window.cancelAnimationFrame(frame);
	}, [clearNavigation, currentAnchorId, navigatingTurnId]);

	useEffect(() => {
		const viewport = scrollViewportRef?.current;
		if (!viewport) return;
		const handleScrollEnd = () => clearNavigation();
		viewport.addEventListener("scrollend", handleScrollEnd);
		return () => viewport.removeEventListener("scrollend", handleScrollEnd);
	}, [clearNavigation, scrollViewportRef]);

	useEffect(() => {
		if (!activeTurnId || isHoverTransitionReady) return;
		const frame = window.requestAnimationFrame(() => {
			setIsHoverTransitionReady(true);
		});
		return () => window.cancelAnimationFrame(frame);
	}, [activeTurnId, isHoverTransitionReady]);

	const hasScrollRoom = canScrollToStart || canScrollToEnd;
	if (turns.length < 3 || !hasScrollRoom) return null;

	const handleNavigate = (messageId: string) => {
		clearHidePreview();
		setHoveredTurnId(messageId);
		const didNavigate = scrollToMessage(messageId, {
			align: "start",
			behavior: "smooth",
			scrollMargin: -12,
		});
		if (didNavigate) {
			clearNavigation();
			setNavigatingTurnId(messageId);
			navigationTimeoutRef.current = window.setTimeout(() => {
				clearNavigation();
			}, 2_000);
		} else {
			clearNavigation();
		}
	};

	const previewTop =
		previewTurnIndex >= 0
			? Math.min(
					84,
					Math.max(
						14,
						((previewTurnIndex + 0.5) / turns.length) * 100,
					),
				)
			: 50;
	const markerGroupHeight = Math.min(
		280,
		Math.max(40, turns.length * 9 + 5),
	);
	const markerTransitionClass = isHoverTransitionReady
		? "transition-[width,height,background-color,opacity]"
		: "transition-[background-color,opacity]";
	const attachmentLabel = previewTurn
		? getAttachmentLabel(previewTurn.user.meta)
		: null;

	return (
		<nav
			aria-label="Conversation navigation"
			className="pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-[min(32rem,100vw)] lg:block"
		>
			<div className="pointer-events-auto absolute inset-y-0 left-2 w-6">
				<div
					className="absolute left-0 top-1/2 w-6 -translate-y-1/2"
					style={{ height: `${markerGroupHeight}px` }}
					onPointerLeave={scheduleHidePreview}
					onBlurCapture={(event) => {
						const nextTarget = event.relatedTarget;
						if (
							!(nextTarget instanceof Node) ||
							!event.currentTarget.contains(nextTarget)
						) {
							scheduleHidePreview();
						}
					}}
				>
					{turns.map((turn, index) => {
						const isCurrent = currentAnchorId === turn.user.id;
						const isVisible = turn.messageIds.some((messageId) =>
							visibleMessageIds.includes(messageId),
						);
						const hoverDistance =
							activeTurnIndex >= 0
								? Math.abs(index - activeTurnIndex)
								: Number.POSITIVE_INFINITY;
						const hoverWidth =
							HOVER_MARKER_WIDTHS[hoverDistance] ?? DEFAULT_MARKER_WIDTH;
						const isHovering = activeTurnIndex >= 0;

						return (
							<button
								key={turn.user.id}
								type="button"
								aria-label={`Jump to turn ${index + 1}: ${getMessagePreview(turn.user)}`}
								aria-current={isCurrent ? "location" : undefined}
								title={getMessagePreview(turn.user)}
								onPointerEnter={() => showPreview(turn.user.id)}
								onPointerDown={() => showPreview(turn.user.id)}
								onFocus={() => showPreview(turn.user.id)}
								onClick={() => handleNavigate(turn.user.id)}
								className="absolute left-0 flex h-2 w-6 -translate-y-1/2 items-center justify-start rounded-sm outline-none"
								style={{
									top: `${((index + 0.5) / turns.length) * 100}%`,
								}}
							>
								<span
									className={cn(
										"block rounded-full duration-200 ease-out motion-reduce:transition-none",
										markerTransitionClass,
										getMarkerClass(
											isCurrent,
											isVisible,
											navigatingTurnId === turn.user.id,
											hoverDistance,
											isHovering,
										),
									)}
									style={{
										width: isHovering ? `${hoverWidth}px` : "6px",
									}}
								/>
							</button>
						);
					})}

					{previewTurn ? (
						<div
							className="pointer-events-auto absolute left-8 w-[min(28rem,calc(100vw-3.5rem))] -translate-y-1/2 rounded-2xl border border-border/80 bg-popover/95 px-3 py-2.5 text-popover-foreground shadow-xl backdrop-blur-md transition-[top,opacity,transform] duration-200 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-1 motion-safe:duration-200 motion-reduce:animate-none motion-reduce:transition-none"
							style={{ top: `${previewTop}%` }}
							onPointerEnter={() => showPreview(previewTurn.user.id)}
							onPointerLeave={scheduleHidePreview}
						>
							<button
								type="button"
				aria-label={`Jump to turn ${previewTurnIndex + 1}`}
				onPointerDown={() => showPreview(previewTurn.user.id)}
				onFocus={() => showPreview(previewTurn.user.id)}
				onClick={() => handleNavigate(previewTurn.user.id)}
								className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<div className="truncate text-sm font-medium text-foreground">
									{getMessagePreview(previewTurn.user)}
								</div>
								{previewTurn.assistant ? (
									<div className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
										{getMessagePreview(previewTurn.assistant)}
									</div>
								) : null}
								{attachmentLabel ? (
									<div className="mt-2 flex min-w-0 items-center gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
										<FileText className="size-3.5 shrink-0" />
										<span className="truncate">{attachmentLabel}</span>
									</div>
								) : null}
							</button>
						</div>
					) : null}
				</div>
			</div>
		</nav>
	);
}
