"use client";

import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Users, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface OAuthAppCardProps {
	app: any;
	currentUserId: string;
}

export default function OAuthAppCard({ app }: OAuthAppCardProps) {
	const statusColor = {
		active: "bg-emerald-500",
		suspended: "bg-amber-500",
		deleted: "bg-red-500",
	}[(app.status as string)] || "bg-gray-500";

	const statusText = {
		active: "Active",
		suspended: "Suspended",
		deleted: "Deleted",
	}[(app.status as string)] || "Unknown";

	return (
		<Card className="flex flex-col hover:shadow-md transition-shadow">
			<CardHeader className="space-y-3">
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1 min-w-0">
						<CardTitle className="text-lg truncate">{app.name}</CardTitle>
						<div className="flex items-center gap-2 mt-1">
							<Badge variant="outline" className="text-xs">
								{app.client_id.substring(0, 12)}...
							</Badge>
							<div className="flex items-center gap-1">
								<span className={`size-2 rounded-full ${statusColor}`} />
								<span className="text-xs text-muted-foreground">{statusText}</span>
							</div>
						</div>
					</div>
					{app.logo_url && (
						<img
							src={app.logo_url}
							alt={app.name}
							className="size-12 rounded-md object-cover border"
						/>
					)}
				</div>
				{app.description && (
					<CardDescription className="line-clamp-2">
						{app.description}
					</CardDescription>
				)}
			</CardHeader>

			<CardContent className="flex-1 space-y-2">
				<div className="grid grid-cols-2 gap-2 text-sm">
					<div className="flex items-center gap-2 text-muted-foreground">
						<Users className="size-4" />
						<span>{app.active_authorizations || 0} users</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground">
						<Activity className="size-4" />
						<span>{app.requests_last_30d || 0} requests</span>
					</div>
				</div>

				{app.homepage_url && (
					<a
						href={app.homepage_url}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
					>
						<ExternalLink className="size-3" />
						<span>Visit website</span>
					</a>
				)}

				<div className="text-xs text-muted-foreground pt-2">
					Created {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
				</div>
			</CardContent>

			<CardFooter>
				<Button variant="outline" size="sm" asChild className="w-full">
					<Link href={`/settings/oauth-apps/${app.client_id}`}>
						View Details
					</Link>
				</Button>
			</CardFooter>
		</Card>
	);
}
