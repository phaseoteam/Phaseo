"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import AuthorizationCard from "./AuthorizationCard";

interface AuthorizedAppsPanelProps {
	authorizedApps: any[];
	userId: string;
}

export default function AuthorizedAppsPanel({
	authorizedApps,
	userId,
}: AuthorizedAppsPanelProps) {
	if (!authorizedApps || authorizedApps.length === 0) {
		return (
			<Card className="p-8 text-center">
				<div className="text-muted-foreground">
					<p className="text-lg font-medium mb-2">No authorized apps</p>
					<p className="text-sm">
						You haven&apos;t authorized any third-party applications yet.
						When you do, they&apos;ll appear here.
					</p>
				</div>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			{authorizedApps.map((auth) => (
				<AuthorizationCard
					key={auth.authorization_id}
					authorization={auth}
					userId={userId}
				/>
			))}
		</div>
	);
}
