"use client";

import { useEffect } from "react";
import { publishAnalyticsIdentity } from "@/lib/analyticsIdentity";

export function AnalyticsIdentitySync({
	userId,
	workspaceId,
	signedUpAt,
}: {
	userId: string | null;
	workspaceId: string | null;
	signedUpAt: string | null;
}) {
	useEffect(() => {
		publishAnalyticsIdentity(userId ? { userId, workspaceId, signedUpAt } : null);
	}, [signedUpAt, userId, workspaceId]);

	return null;
}
