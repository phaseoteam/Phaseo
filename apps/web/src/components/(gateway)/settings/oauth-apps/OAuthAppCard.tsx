"use client";

import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Users, Activity } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

interface OAuthAppCardProps {
	app: any;
}

export default function OAuthAppCard({ app }: OAuthAppCardProps) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const statusColor = {
		active: "bg-emerald-500",
		suspended: "bg-amber-500",
		deleted: "bg-red-500",
	}[(app.status as string)] || "bg-gray-500";

	const statusText = {
		active: t("labels.active"),
		suspended: t("strings.Suspended" as never),
		deleted: t("strings.Deleted" as never),
	}[(app.status as string)] || t("strings.Unknown" as never);

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
						<span>{t("oauthCardCopy.usersCount" as never, { count: app.active_authorizations || 0 } as never)}</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground">
						<Activity className="size-4" />
						<span>{t("oauthCardCopy.requestsCount" as never, { count: app.requests_last_30d || 0 } as never)}</span>
					</div>
				</div>

				{app.homepage_url && (
					<a
						href={app.homepage_url}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 underline decoration-transparent hover:decoration-current transition-colors duration-200"
					>
						<ExternalLink className="size-3" />
						<span>{t("strings.Visit website" as never)}</span>
					</a>
				)}

				<div className="text-xs text-muted-foreground pt-2">
					{t("strings.Created" as never)} {formatRelativeTime(new Date(app.created_at), locale)}
				</div>
			</CardContent>

			<CardFooter>
				<Button variant="outline" size="sm" asChild className="w-full">
					<Link href={`/settings/oauth-apps/${app.client_id}`}>
						{t("strings.View Details" as never)}
					</Link>
				</Button>
			</CardFooter>
		</Card>
	);
}

function formatRelativeTime(date: Date, locale: string): string {
	const seconds = Math.round((date.getTime() - Date.now()) / 1000);
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		["year", 31_536_000],
		["month", 2_592_000],
		["day", 86_400],
		["hour", 3_600],
		["minute", 60],
	];
	for (const [unit, size] of units) {
		if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
	}
	return formatter.format(seconds, "second");
}
