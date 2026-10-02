"use client";

import React, { useState, useEffect } from "react";
import { formatRelativeToNow } from "@/lib/formatRelative";
import { useLocale, useTranslations } from "next-intl";

interface LastUpdatedProps {
	deployTime: string;
}

export default function LastUpdated({ deployTime }: LastUpdatedProps) {
	const locale = useLocale();
	const t = useTranslations("Common.ui.localisationGaps");
	const [lastUpdated, setLastUpdated] = useState<string>("");

	useEffect(() => {
		const targetMs = Date.parse(deployTime);
		if (!Number.isFinite(targetMs)) {
			setLastUpdated("");
			return;
		}

		function updateLastUpdated() {
			setLastUpdated(formatRelativeToNow(targetMs, Date.now(), locale));
		}

		updateLastUpdated();

		// Update every minute to keep the relative time fresh
		const interval = setInterval(updateLastUpdated, 60000);

		return () => clearInterval(interval);
	}, [deployTime, locale]);

	if (!deployTime) {
		return null;
	}

	return <span className="mt-1">{t("lastUpdated", {time: lastUpdated})}</span>;
}
