"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Calendar, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import RevokeDialog from "./RevokeDialog";

interface AuthorizationCardProps {
	authorization: any;
	userId: string;
}

export default function AuthorizationCard({ authorization }: AuthorizationCardProps) {
	const scopeLabels: Record<string, string> = {
		openid: "Identity",
		email: "Email",
		profile: "Profile",
		"gateway:access": "API Gateway Access",
	};

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-3 flex-1 min-w-0">
						{authorization.app_logo_url ? (
							<img
								src={authorization.app_logo_url}
								alt={authorization.app_name}
								className="size-12 rounded-md object-cover border shrink-0"
							/>
						) : (
							<div className="size-12 rounded-md border bg-muted flex items-center justify-center shrink-0">
								<Activity className="size-6 text-muted-foreground" />
							</div>
						)}
						<div className="flex-1 min-w-0">
							<CardTitle className="text-lg truncate">
								{authorization.app_name}
							</CardTitle>
							<CardDescription className="mt-1">
								{authorization.app_description || "No description provided"}
							</CardDescription>
							{authorization.app_homepage_url && (
								<a
									href={authorization.app_homepage_url}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2"
								>
									<ExternalLink className="size-3" />
									<span>Visit website</span>
								</a>
							)}
						</div>
					</div>
					<RevokeDialog
						authorizationId={authorization.authorization_id}
						appName={authorization.app_name}
					/>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Scopes */}
				<div>
					<div className="text-sm font-medium mb-2">Permissions</div>
					<div className="flex flex-wrap gap-2">
						{(authorization.scopes || []).map((scope: string) => (
							<Badge key={scope} variant="secondary" className="text-xs">
								{scopeLabels[scope] || scope}
							</Badge>
						))}
					</div>
				</div>

				{/* Team */}
				<div>
					<div className="text-sm font-medium mb-1">Team</div>
					<div className="text-sm text-muted-foreground">
						{authorization.team_name}
					</div>
				</div>

				{/* Metadata */}
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div>
						<div className="flex items-center gap-1 text-muted-foreground mb-1">
							<Calendar className="size-3" />
							<span>Authorized</span>
						</div>
						<div className="font-medium">
							{formatDistanceToNow(new Date(authorization.authorized_at), {
								addSuffix: true,
							})}
						</div>
					</div>
					<div>
						<div className="flex items-center gap-1 text-muted-foreground mb-1">
							<Activity className="size-3" />
							<span>Last Used</span>
						</div>
						<div className="font-medium">
							{authorization.last_used_at
								? formatDistanceToNow(new Date(authorization.last_used_at), {
										addSuffix: true,
								  })
								: "Never"}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
