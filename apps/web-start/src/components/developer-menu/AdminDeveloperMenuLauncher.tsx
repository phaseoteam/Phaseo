"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { LazyMessages } from "@/components/i18n/LazyMessages";

const AdminDeveloperMenu = dynamic(() => import("./AdminDeveloperMenu"), {
	ssr: false,
});

export default function AdminDeveloperMenuLauncher() {
	const [requested, setRequested] = useState(false);
	const dismiss = useCallback(() => setRequested(false), []);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.repeat || !(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
			if (event.code !== "Period") return;
			event.preventDefault();
			setRequested((current) => !current);
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return requested ? <LazyMessages feature="developerMenu"><AdminDeveloperMenu onDismiss={dismiss} /></LazyMessages> : null;
}
