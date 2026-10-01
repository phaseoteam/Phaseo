import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchFrontendRecentAppRequests } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { Clock, Zap } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

export default async function RecentRequestsForApp({
	appId,
	range = "1m"
}: {
	appId: string;
	range?: RangeKey;
}) {
	void range;
	const locale = await getLocale();
	const [rows, t] = await Promise.all([
		fetchFrontendRecentAppRequests(appId, 25),
		getTranslations({ locale, namespace: "Catalogue.appDetail" }),
	]);

	// Get recent successful requests
	const recentRequests = rows
		.filter(r => r.success)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
		.slice(0, 10);

	if (!recentRequests.length) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("recentRequests")}</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">{t("noRecentRequests")}</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("recentRequests")}</CardTitle>
				<p className="text-sm text-muted-foreground">
					{t("latestApiCalls")}
				</p>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{recentRequests.map((request, index) => (
						<div key={`${request.created_at}-${index}`} className="flex items-center justify-between p-3 border rounded-lg">
							<div className="flex items-center gap-3">
								<div className="text-sm font-medium text-muted-foreground">
									{request.provider}
								</div>
								<div>
									<div className="font-medium">{request.model_id}</div>
									<div className="text-sm text-muted-foreground flex items-center gap-1">
										<Clock className="h-3 w-3" />
										{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(request.created_at))}
									</div>
								</div>
							</div>
							<div className="text-right space-y-1">
								<div className="flex items-center gap-1 text-sm">
									<Zap className="h-3 w-3" />
									{new Intl.NumberFormat(locale).format(request.usage?.total_tokens ? Number(request.usage.total_tokens) : 0)} {t("tokensUnit")}
								</div>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
