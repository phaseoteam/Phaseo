"use client";

import { useLayoutEffect } from "react";

const CHAT_VIEWPORT_HEIGHT = "--chat-viewport-height";
const CHAT_VIEWPORT_TOP = "--chat-viewport-top";
const CHAT_KEYBOARD_INSET = "--chat-keyboard-inset";

type VirtualKeyboardLike = EventTarget & {
	boundingRect?: DOMRectReadOnly;
	overlaysContent: boolean;
};

type NavigatorWithVirtualKeyboard = Navigator & {
	virtualKeyboard?: VirtualKeyboardLike;
};

function getVirtualKeyboard() {
	return (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard ?? null;
}

export function ChatViewportLock() {
	useLayoutEffect(() => {
		const html = document.documentElement;
		const body = document.body;
		const visualViewport = window.visualViewport;
		const virtualKeyboard = getVirtualKeyboard();
		let animationFrame: number | null = null;
		let focusUpdateTimer: number | null = null;
		let usesVirtualKeyboardOverlay = false;
		const previous = {
			bodyHeight: body.style.height,
			bodyInset: body.style.inset,
			bodyOverflow: body.style.overflow,
			bodyPosition: body.style.position,
			bodyWidth: body.style.width,
			htmlOverflow: html.style.overflow,
			keyboardInset: html.style.getPropertyValue(CHAT_KEYBOARD_INSET),
			virtualKeyboardOverlaysContent: virtualKeyboard?.overlaysContent,
			viewportHeight: html.style.getPropertyValue(CHAT_VIEWPORT_HEIGHT),
			viewportTop: html.style.getPropertyValue(CHAT_VIEWPORT_TOP),
		};
		const scrollX = window.scrollX;
		const scrollY = window.scrollY;

		if (virtualKeyboard) {
			try {
				virtualKeyboard.overlaysContent = true;
				usesVirtualKeyboardOverlay = virtualKeyboard.overlaysContent;
			} catch {
				usesVirtualKeyboardOverlay = false;
			}
		}

		const getKeyboardHeight = () => {
			if (!usesVirtualKeyboardOverlay) return 0;
			return Math.max(0, virtualKeyboard?.boundingRect?.height ?? 0);
		};

		const resetDocumentScroll = () => {
			const chatRoot = document.querySelector<HTMLElement>(
				"[data-chat-viewport-root='true']"
			);
			if (chatRoot && chatRoot.scrollTop !== 0) {
				chatRoot.scrollTop = 0;
			}
			if (window.scrollX === 0 && window.scrollY === 0) return;
			window.scrollTo(0, 0);
		};

		const updateViewport = () => {
			const visualHeight = visualViewport?.height ?? window.innerHeight;
			const keyboardHeight = getKeyboardHeight();
			const keyboardAdjustedHeight =
				keyboardHeight > 0
					? Math.max(0, window.innerHeight - keyboardHeight)
					: Number.POSITIVE_INFINITY;
			const height = Math.min(visualHeight, keyboardAdjustedHeight);
			const top =
				keyboardAdjustedHeight < visualHeight
					? 0
					: (visualViewport?.offsetTop ?? 0);
			html.style.setProperty(CHAT_VIEWPORT_HEIGHT, `${height}px`);
			html.style.setProperty(CHAT_VIEWPORT_TOP, `${top}px`);
			html.style.setProperty(CHAT_KEYBOARD_INSET, `${keyboardHeight}px`);
			resetDocumentScroll();
		};

		const scheduleViewportUpdate = () => {
			if (animationFrame !== null) return;
			animationFrame = window.requestAnimationFrame(() => {
				animationFrame = null;
				updateViewport();
			});
		};

		const scheduleFocusViewportUpdate = () => {
			scheduleViewportUpdate();
			if (focusUpdateTimer !== null) {
				window.clearTimeout(focusUpdateTimer);
			}
			focusUpdateTimer = window.setTimeout(() => {
				focusUpdateTimer = null;
				scheduleViewportUpdate();
			}, 120);
		};

		// Mobile keyboards can resize or offset only the visual viewport, so the
		// chat route follows that visible area while its internal pane gives up space.
		html.style.overflow = "hidden";
		body.style.position = "fixed";
		body.style.inset = "0";
		body.style.width = "100%";
		body.style.height = "100%";
		body.style.overflow = "hidden";
		updateViewport();
		resetDocumentScroll();

		visualViewport?.addEventListener("resize", scheduleViewportUpdate);
		visualViewport?.addEventListener("scroll", scheduleViewportUpdate);
		virtualKeyboard?.addEventListener("geometrychange", scheduleViewportUpdate);
		window.addEventListener("focusin", scheduleFocusViewportUpdate);
		window.addEventListener("focusout", scheduleFocusViewportUpdate);
		window.addEventListener("resize", scheduleViewportUpdate);
		window.addEventListener("scroll", resetDocumentScroll, { passive: true });

		return () => {
			if (animationFrame !== null) {
				window.cancelAnimationFrame(animationFrame);
			}
			if (focusUpdateTimer !== null) {
				window.clearTimeout(focusUpdateTimer);
			}
			visualViewport?.removeEventListener("resize", scheduleViewportUpdate);
			visualViewport?.removeEventListener("scroll", scheduleViewportUpdate);
			virtualKeyboard?.removeEventListener(
				"geometrychange",
				scheduleViewportUpdate
			);
			window.removeEventListener("focusin", scheduleFocusViewportUpdate);
			window.removeEventListener("focusout", scheduleFocusViewportUpdate);
			window.removeEventListener("resize", scheduleViewportUpdate);
			window.removeEventListener("scroll", resetDocumentScroll);
			html.style.overflow = previous.htmlOverflow;
			body.style.position = previous.bodyPosition;
			body.style.inset = previous.bodyInset;
			body.style.width = previous.bodyWidth;
			body.style.height = previous.bodyHeight;
			body.style.overflow = previous.bodyOverflow;
			if (
				virtualKeyboard &&
				typeof previous.virtualKeyboardOverlaysContent === "boolean"
			) {
				try {
					virtualKeyboard.overlaysContent =
						previous.virtualKeyboardOverlaysContent;
				} catch {}
			}
			if (previous.keyboardInset) {
				html.style.setProperty(CHAT_KEYBOARD_INSET, previous.keyboardInset);
			} else {
				html.style.removeProperty(CHAT_KEYBOARD_INSET);
			}
			if (previous.viewportHeight) {
				html.style.setProperty(CHAT_VIEWPORT_HEIGHT, previous.viewportHeight);
			} else {
				html.style.removeProperty(CHAT_VIEWPORT_HEIGHT);
			}
			if (previous.viewportTop) {
				html.style.setProperty(CHAT_VIEWPORT_TOP, previous.viewportTop);
			} else {
				html.style.removeProperty(CHAT_VIEWPORT_TOP);
			}
			window.scrollTo(scrollX, scrollY);
		};
	}, []);

	return null;
}
