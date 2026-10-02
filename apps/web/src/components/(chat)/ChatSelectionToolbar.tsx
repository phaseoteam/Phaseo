"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import {
	CheckCheck,
	MessageCircleQuestion,
	Scissors,
	SlidersHorizontal,
	Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	buildChatSelectionPrompt,
	type ChatSelectionAction,
} from "./chatSelectionActions";
import {
	getChatSelectionToolbarPosition,
	type ChatSelectionAnchor,
} from "./chatSelectionPosition";

type SelectionState = ChatSelectionAnchor & {
	text: string;
};

function getAssistantSelection(): SelectionState | null {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return null;
	}

	const text = selection.toString().trim();
	if (!text) return null;

	const anchorElement =
		selection.anchorNode instanceof Element
			? selection.anchorNode
			: selection.anchorNode?.parentElement;
	const focusElement =
		selection.focusNode instanceof Element
			? selection.focusNode
			: selection.focusNode?.parentElement;
	const anchorContent = anchorElement?.closest<HTMLElement>(
		"[data-chat-assistant-content='true']",
	);
	const focusContent = focusElement?.closest<HTMLElement>(
		"[data-chat-assistant-content='true']",
	);
	if (!anchorContent || anchorContent !== focusContent) return null;

	const range = selection.getRangeAt(0);
	const rects = Array.from(range.getClientRects()).filter(
		(rect) => rect.width > 0 || rect.height > 0,
	);
	const lastRect = rects.at(-1) ?? range.getBoundingClientRect();
	return {
		text,
		anchorLeft: lastRect.left + lastRect.width / 2,
		anchorTop: lastRect.top,
		anchorBottom: lastRect.bottom,
	};
}

type ChatSelectionToolbarProps = {
	onAction: (prompt: string) => void;
};

export function ChatSelectionToolbar({ onAction }: ChatSelectionToolbarProps) {
	const t = useTranslations("Product.chat.selectionActions");
	const [selection, setSelection] = useState<SelectionState | null>(null);
	const [position, setPosition] = useState({ left: 0, top: 0 });
	const selectingWithPointerRef = useRef(false);
	const toolbarRef = useRef<HTMLDivElement>(null);

	const dismiss = useCallback(() => {
		setSelection(null);
		window.getSelection()?.removeAllRanges();
	}, []);

	useEffect(() => {
		const updateSelection = () => setSelection(getAssistantSelection());
		const handleSelectionChange = () => {
			if (!selectingWithPointerRef.current) updateSelection();
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") dismiss();
		};
		const handlePointerDown = (event: PointerEvent) => {
			if ((event.target as Element | null)?.closest("[data-chat-selection-toolbar]")) {
				return;
			}
			selectingWithPointerRef.current = true;
			setSelection(null);
		};
		const handlePointerUp = () => {
			if (!selectingWithPointerRef.current) return;
			selectingWithPointerRef.current = false;
			updateSelection();
		};
		const handlePointerCancel = () => {
			selectingWithPointerRef.current = false;
		};

		document.addEventListener("selectionchange", handleSelectionChange);
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("pointerup", handlePointerUp);
		document.addEventListener("pointercancel", handlePointerCancel);
		document.addEventListener("keydown", handleKeyDown);
		window.addEventListener("resize", updateSelection);
		window.addEventListener("scroll", updateSelection, true);
		return () => {
			document.removeEventListener("selectionchange", handleSelectionChange);
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("pointerup", handlePointerUp);
			document.removeEventListener("pointercancel", handlePointerCancel);
			document.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("resize", updateSelection);
			window.removeEventListener("scroll", updateSelection, true);
		};
	}, [dismiss]);

	useLayoutEffect(() => {
		if (!selection || !toolbarRef.current) return;
		const toolbarRect = toolbarRef.current.getBoundingClientRect();
		setPosition(
			getChatSelectionToolbarPosition(
				selection,
				{ width: toolbarRect.width, height: toolbarRect.height },
				{ width: window.innerWidth, height: window.innerHeight },
			),
		);
	}, [selection]);

	if (!selection) return null;

	const applyAction = (action: ChatSelectionAction) => {
		onAction(buildChatSelectionPrompt(action, selection.text));
		dismiss();
	};

	return createPortal(
		<div
			ref={toolbarRef}
			data-chat-selection-toolbar
			role="toolbar"
			aria-label={t("ariaLabel")}
			className="fixed z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
			style={{ left: position.left, top: position.top }}
			onPointerDown={(event) => event.preventDefault()}
		>
			<Button size="xs" variant="ghost" onClick={() => applyAction("explain")}>
				<MessageCircleQuestion /> {t("explain")}
			</Button>
			<Button size="xs" variant="ghost" onClick={() => applyAction("improve")}>
				<Sparkles /> {t("improve")}
			</Button>
			<Button size="xs" variant="ghost" onClick={() => applyAction("shorten")}>
				<Scissors /> {t("shorten")}
			</Button>
			<Button size="xs" variant="ghost" onClick={() => applyAction("change-tone")}>
				<SlidersHorizontal /> {t("changeTone")}
			</Button>
			<Button size="xs" variant="ghost" onClick={() => applyAction("fix-grammar")}>
				<CheckCheck /> {t("fixGrammar")}
			</Button>
		</div>,
		document.body,
	);
}
