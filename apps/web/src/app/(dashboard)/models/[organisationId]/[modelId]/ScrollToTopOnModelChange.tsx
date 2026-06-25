"use client";

import { useLayoutEffect } from "react";

export default function ScrollToTopOnModelChange({
	routeKey,
}: {
	routeKey: string;
}) {
	useLayoutEffect(() => {
		window.scrollTo(0, 0);
	}, [routeKey]);

	return null;
}
