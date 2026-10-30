"use client";

import { useEffect } from "react";

import {
	PRODUCT_ANALYTICS_EVENT,
	type ProductAnalyticsPayload,
} from "@/lib/productAnalytics";

export function ProductAnalyticsGaBridge() {
	useEffect(() => {
		const forwardEvent = (event: Event) => {
			const payload = (event as CustomEvent<ProductAnalyticsPayload>).detail;
			if (!payload || typeof window.gtag !== "function") return;

			window.gtag("event", payload.event, payload.properties);
		};

		window.addEventListener(PRODUCT_ANALYTICS_EVENT, forwardEvent);
		return () => window.removeEventListener(PRODUCT_ANALYTICS_EVENT, forwardEvent);
	}, []);

	return null;
}
