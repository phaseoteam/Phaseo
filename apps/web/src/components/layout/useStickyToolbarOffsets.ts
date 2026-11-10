import { useEffect, useState, type RefObject } from "react";

type StickyToolbarOffsets = { toolbarTop: number; tableHeaderTop: number };

function readNoticeHeight() {
	const value = window.getComputedStyle(document.documentElement).getPropertyValue("--site-notice-height");
	return Number.parseFloat(value) || 0;
}

/**
 * Pixel offsets for a toolbar that sticks under the site header and a table
 * header that sticks under the toolbar. The header itself sticks below the
 * fixed notice bars (`--site-notice-height`), so their height is included;
 * without it the toolbar slides behind the header whenever a notice shows.
 */
export function useStickyToolbarOffsets(toolbarRef: RefObject<HTMLElement | null>) {
	const [offsets, setOffsets] = useState<StickyToolbarOffsets>({ toolbarTop: 60, tableHeaderTop: 60 });

	useEffect(() => {
		const toolbar = toolbarRef.current;
		if (!toolbar || typeof window === "undefined") return;
		const siteHeader = document.querySelector<HTMLElement>("#dashboard-shell > header");
		const mediumViewport = window.matchMedia("(min-width: 768px)");
		const updateOffsets = () => {
			const toolbarTop = Math.ceil(readNoticeHeight() + (siteHeader?.getBoundingClientRect().height ?? 60));
			const toolbarHeight = mediumViewport.matches ? Math.ceil(toolbar.getBoundingClientRect().height) : 0;
			const tableHeaderTop = toolbarTop + toolbarHeight;
			setOffsets((current) => current.toolbarTop === toolbarTop && current.tableHeaderTop === tableHeaderTop ? current : { toolbarTop, tableHeaderTop });
		};
		updateOffsets();
		const resizeObserver = new ResizeObserver(updateOffsets);
		resizeObserver.observe(toolbar);
		if (siteHeader) resizeObserver.observe(siteHeader);
		// Notice bars write their height onto <html>'s inline style (lib/noticeStack).
		const noticeObserver = new MutationObserver(updateOffsets);
		noticeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
		mediumViewport.addEventListener("change", updateOffsets);
		window.addEventListener("resize", updateOffsets);
		return () => {
			resizeObserver.disconnect();
			noticeObserver.disconnect();
			mediumViewport.removeEventListener("change", updateOffsets);
			window.removeEventListener("resize", updateOffsets);
		};
	}, [toolbarRef]);

	return offsets;
}
