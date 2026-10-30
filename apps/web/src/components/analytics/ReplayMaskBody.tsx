"use client";

import { useLayoutEffect } from "react";

/**
 * Masks all text in session replay while mounted, including dialogs, sheets
 * and popovers that portal to <body> outside the page's own `ph-mask` root.
 */
export function ReplayMaskBody() {
	useLayoutEffect(() => {
		document.body.classList.add("ph-mask");
		return () => document.body.classList.remove("ph-mask");
	}, []);

	return null;
}
