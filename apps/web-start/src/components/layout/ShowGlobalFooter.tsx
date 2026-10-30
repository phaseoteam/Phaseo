"use client";

import { useLayoutEffect } from "react";
import { registerShowFooter } from "@/components/layout/footerVisibility";

export default function ShowGlobalFooter() {
	useLayoutEffect(() => {
		return registerShowFooter();
	}, []);

	return null;
}
