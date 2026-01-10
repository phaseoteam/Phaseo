"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Shield,
	Users,
	Database,
} from "lucide-react";

export function InternalClient() {
	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						System Status
					</CardTitle>
					<CardDescription>
						Current system configuration and health status
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Users className="h-4 w-4" />
							<span>User Signups</span>
						</div>
						<span className="text-sm text">
							Open-muted-foreground for all users
						</span>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
