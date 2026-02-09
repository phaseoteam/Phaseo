"use client";

import React, { useState, useEffect } from "react";
import { formatRelativeToNow } from "@/lib/formatRelative";

interface LastUpdatedProps {
	deployTime: string;
}

export default function LastUpdated({ deployTime }: LastUpdatedProps) {
	const [lastUpdated, setLastUpdated] = useState<string>("");

	useEffect(() => {
		const targetMs = Date.parse(deployTime);
		if (!Number.isFinite(targetMs)) {
			setLastUpdated("");
			return;
		}

		function updateLastUpdated() {
			setLastUpdated(formatRelativeToNow(targetMs, Date.now()));
		}

		updateLastUpdated();

		// Update every minute to keep the relative time fresh
		const interval = setInterval(updateLastUpdated, 60000);

		return () => clearInterval(interval);
	}, [deployTime]);

	if (!deployTime) {
		return null;
	}

	return <span className="mt-1">Last updated: {lastUpdated}</span>;
}
