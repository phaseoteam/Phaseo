"use client";

import React from "react";
import OAuthAppCard from "./OAuthAppCard";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { AppWindow } from "lucide-react";

interface OAuthAppsPanelProps {
	oauthApps: any[];
}

export default function OAuthAppsPanel({
	oauthApps,
}: OAuthAppsPanelProps) {
	if (!oauthApps || oauthApps.length === 0) {
		return (
			<Empty className="rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AppWindow className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>No OAuth apps yet</EmptyTitle>
					<EmptyDescription>
						Create your first OAuth app to enable third-party integrations with
						your AI Stats account.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{oauthApps.map((app) => (
				<OAuthAppCard
					key={app.id}
					app={app}
				/>
			))}
		</div>
	);
}
