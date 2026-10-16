"use client";

import { useEffect, useState } from "react";
import { setNoticeStackHeight, type NoticeStackSource } from "@/lib/noticeStack";

/**
 * Measures a fixed notice bar and adds its height to the shared notice stack.
 * Attach the returned callback ref to the bar; the height resets to 0 when the
 * bar is not rendered or the component unmounts.
 */
export function useNoticeStackHeight(source: NoticeStackSource) {
	const [element, setElement] = useState<HTMLElement | null>(null);

	useEffect(() => {
		if (!element) {
			setNoticeStackHeight(source, 0);
			return;
		}
		const update = () => setNoticeStackHeight(source, element.offsetHeight);
		update();
		window.addEventListener("resize", update);
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
		observer?.observe(element);
		return () => {
			window.removeEventListener("resize", update);
			observer?.disconnect();
			setNoticeStackHeight(source, 0);
		};
	}, [element, source]);

	return setElement;
}
