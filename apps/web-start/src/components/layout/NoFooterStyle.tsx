"use client";

import { useLayoutEffect } from "react";
import { registerHideFooter } from "@/components/layout/footerVisibility";

export default function NoFooterStyle() {
	useLayoutEffect(() => {
		return registerHideFooter();
	}, []);

	return null;
}
