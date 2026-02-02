"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import OAuthAppCard from "./OAuthAppCard";

interface OAuthAppsPanelProps {
	oauthApps: any[];
	initialTeamId: string | null;
	currentUserId: string;
}

export default function OAuthAppsPanel({
	oauthApps,
	initialTeamId,
	currentUserId,
}: OAuthAppsPanelProps) {
	if (!oauthApps || oauthApps.length === 0) {
		return (
			<Card className="p-8 text-center">
				<div className="text-muted-foreground">
					<p className="text-lg font-medium mb-2">No OAuth apps yet</p>
					<p className="text-sm">
						Create your first OAuth app to enable third-party integrations
						with your AI Stats account.
					</p>
				</div>
			</Card>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{oauthApps.map((app) => (
				<OAuthAppCard
					key={app.id}
					app={app}
					currentUserId={currentUserId}
				/>
			))}
		</div>
	);
}
