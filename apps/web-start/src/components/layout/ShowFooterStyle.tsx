"use client";

import { useLayoutEffect } from "react";
import { registerShowFooter } from "@/components/layout/footerVisibility";

export default function ShowFooterStyle() {
	useLayoutEffect(() => {
		return registerShowFooter();
	}, []);

	return null;
}
