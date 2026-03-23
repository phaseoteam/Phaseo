"use client";

import { useEffect } from "react";
import { registerShowFooter } from "@/components/layout/footerVisibility";

export default function ShowFooterStyle() {
	useEffect(() => {
		return registerShowFooter();
	}, []);

	return null;
}
