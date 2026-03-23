"use client";

import { useEffect } from "react";
import { registerHideFooter } from "@/components/layout/footerVisibility";

export default function NoFooterStyle() {
	useEffect(() => {
		return registerHideFooter();
	}, []);

	return null;
}
