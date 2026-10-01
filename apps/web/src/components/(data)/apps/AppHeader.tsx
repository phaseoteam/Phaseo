import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Activity, Zap } from "lucide-react";
import { fetchFrontendAppDetails } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { getLocale, getTranslations } from "next-intl/server";

export default async function AppHeader({ appId }: { appId: string }) {
	const locale = await getLocale();
	const [app, t] = await Promise.all([
		fetchFrontendAppDetails(appId),
		getTranslations({ locale, namespace: "Catalogue.appDetail" }),
	]);

	if (!app) {
		return (
			<Card>
				<CardContent className="p-6">
					<p className="text-muted-foreground">{t("appNotFound")}</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
			{/* App Info Card */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-lg">{t("appInformation")}</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						<div>
							<h3 className="font-semibold text-lg">{app.title}</h3>
							{app.url && app.url !== "about:blank" && (
								<a
									href={app.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
								>
									<ExternalLink className="h-3 w-3" />
									{t("visitApp")}
								</a>
							)}
						</div>
						<div className="flex items-center gap-2">
							<Badge variant={app.is_active ? "default" : "secondary"}>
								{app.is_active ? t("active") : t("inactive")}
							</Badge>
						</div>
						<div className="text-xs text-muted-foreground">
							{t("lastSeen", {
								date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(app.last_seen)),
							})}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Total Requests */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-lg flex items-center gap-2">
						<Activity className="h-4 w-4" />
						{t("totalRequests")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">
						{new Intl.NumberFormat(locale).format(app.total_requests)}
					</div>
					<p className="text-xs text-muted-foreground mt-1">
						{t("allTimeSuccessfulRequests")}
					</p>
				</CardContent>
			</Card>

			{/* Total Tokens */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-lg flex items-center gap-2">
						<Zap className="h-4 w-4" />
						{t("totalTokens")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">
						{new Intl.NumberFormat(locale).format(app.total_tokens)}
					</div>
					<p className="text-xs text-muted-foreground mt-1">
						{t("tokensConsumedAcrossRequests")}
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
