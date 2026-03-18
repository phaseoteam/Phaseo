"use client";

import { useEffect } from "react";
import { registerHideFooter } from "@/components/layout/footerVisibility";

export default function HideGlobalFooter() {
	useEffect(() => {
		return registerHideFooter();
	}, []);

	return null;
}
