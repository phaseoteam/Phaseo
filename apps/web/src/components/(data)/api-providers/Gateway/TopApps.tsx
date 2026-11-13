import React from "react";
import Link from "@/components/link";
import { Users } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { apiProviderTopAppsQuery } from "../apiProvider.queries";
import { useLocale, useTranslations } from "@/i18n/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DisplayCount } from "@/components/display/DisplayValue";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

export default function TopApps({
	count = 20,
	apiProviderId,
	period = "day",
}: {
	count?: number;
	apiProviderId: string;
	period?: "day" | "week" | "month";
}) {
	const t = useTranslations("Catalogue.providers");
	const locale = useLocale();
	const { data: topApps } = useSuspenseQuery(apiProviderTopAppsQuery(
		apiProviderId,
		period,
		count,
	));

	return (
		<section className="space-y-4">
			<h3 className="text-xl font-semibold">{t("topApps")}</h3>

			{topApps.length > 0 ? (
				<div className="overflow-x-auto">
					<Table wrapInContainer={false} className="w-full min-w-[640px] text-sm">
						<TableHeader>
							<TableRow className="text-xs text-muted-foreground border-b border-border hover:bg-transparent dark:hover:bg-transparent">
								<TableHead className="h-auto p-0 text-inherit dark:text-inherit text-left font-medium py-2 px-2">{t("appLabel")}</TableHead>
								<TableHead className="h-auto p-0 text-inherit dark:text-inherit text-right font-medium py-2 px-2">{t("tokensLabel")}</TableHead>
								<TableHead className="h-auto p-0 text-inherit dark:text-inherit text-right font-medium py-2 px-2">{t("websiteLabel")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{topApps.map((app, index) => (
								<TableRow
									key={app.app_id}
									className="border-b border-border/60 last:border-b-0 hover:bg-muted/20 dark:hover:bg-muted/20"
								>
									<TableCell className="p-0 py-2 px-2 min-w-0">
										<div className="flex min-w-0 items-center gap-3">
											<span className="w-7 shrink-0 text-xs font-semibold text-muted-foreground">
												#{index + 1}
											</span>
											<Link
												href={`/apps/${app.app_id}`}
												className="flex min-w-0 items-center gap-2"
											>
												<Avatar className="h-5 w-5 rounded-md border border-border/60">
													<AvatarImage
														src={app.image_url ?? undefined}
														alt={app.title}
														className="object-cover"
													/>
													<AvatarFallback className="rounded-md text-[10px] font-semibold">
														{app.title.slice(0, 1).toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<span className="truncate font-medium text-foreground hover:text-primary">
													<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
														{app.title}
													</span>
												</span>
											</Link>
										</div>
									</TableCell>
									<TableCell className="p-0 py-2 px-2 text-right tabular-nums">
										<DisplayCount value={app.total_tokens} />
									</TableCell>
									<TableCell className="p-0 py-2 px-2 text-right">
										{app.url && app.url !== "about:blank" ? (
											<a
												href={app.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-foreground hover:text-primary text-xs font-medium"
											>{t("visitWebsite")}</a>
										) : (
											<span className="text-muted-foreground text-xs">-</span>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Users />
						</EmptyMedia>
						<EmptyTitle>{t("noAppDataYet")}</EmptyTitle>
						<EmptyDescription className="max-w-md mx-auto">
							{t("appDataAppearsAfterRequests")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}
