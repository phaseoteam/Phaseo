"use client";

import { useEffect } from "react";

export default function ShowGlobalFooter() {
	useEffect(() => {
		document.body.removeAttribute("data-hide-footer");
		return () => {
			document.body.setAttribute("data-hide-footer", "true");
		};
	}, []);

	return null;
}
