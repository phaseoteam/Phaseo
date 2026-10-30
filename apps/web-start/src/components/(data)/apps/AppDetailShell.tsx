import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { fetchFrontendAppDetails } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import EntityStickyHeader from "@/components/(data)/EntityStickyHeader";
import ModelPageToc, { type ModelPageTocItem } from "@/components/(data)/model/ModelPageToc";
import AppLogo from "@/components/(data)/apps/AppLogo";

export default async function AppDetailShell({
	appId,
	children,
	app,
	tocItems = [],
}: {
	appId: string;
	children: React.ReactNode;
	app?: { id: string; title: string; url?: string | null; image_url?: string | null; slug?: string } | null;
	tocItems?: ModelPageTocItem[];
}) {
	const t = await getTranslations("Product.appsDetail");
	let appData = app;

	if (!appData) {
		const fetchedApp = await fetchFrontendAppDetails(appId).catch(() => null);

		if (!fetchedApp) {
			return (
				<main className="flex min-h-screen flex-col">
					<div className="container mx-auto px-4 py-8">
						<Card>
							<CardHeader>
								<CardTitle>{t("notFound")}</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									{t("notFoundDescription")}
								</p>
							</CardContent>
						</Card>
					</div>
				</main>
			);
		}

		appData = {
			id: fetchedApp.id,
			title: fetchedApp.title,
			url: fetchedApp.url ?? null,
			image_url: fetchedApp.image_url ?? null,
			slug: fetchedApp.slug,
		};
	}
	const routeId = appData.slug?.trim() || appId;
	const baseHref = `/apps/${encodeURIComponent(routeId)}`;
	const appInitial = appData.title.trim().slice(0, 1).toUpperCase() || "A";

	return (
		<main className="flex flex-col">
			<EntityStickyHeader kind="app" id={appData.id} name={appData.title} observeId="app-detail-primary-header" baseHref={baseHref} navigation={[]} imageUrl={appData.image_url} />
			<div className="container mx-auto px-4 py-6 md:py-8">
				<div id="app-detail-primary-header" className="mb-6 flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 items-center gap-4">
						<AppLogo
							src={appData.image_url}
							alt={appData.title}
							fallback={appInitial}
							className="size-14 shrink-0"
							fallbackClassName="text-lg"
						/>
						<div className="min-w-0">
							<h1 className="truncate text-3xl font-bold tracking-tight">{appData.title}</h1>
							<p className="mt-1.5 text-sm text-muted-foreground">{t("publicUsageDescription")}</p>
						</div>
					</div>
					{appData.url && appData.url !== "about:blank" ? (
						<Button asChild size="sm" variant="outline" className="rounded-lg">
							<Link
								href={appData.url}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-1"
							>
								{t("visitApp")}
								<ExternalLink className="h-4 w-4" />
							</Link>
						</Button>
					) : null}
				</div>
				<div className="mt-6 min-h-full">{tocItems.length ? <div className="flex flex-col gap-6 lg:flex-row lg:items-start"><ModelPageToc items={tocItems} className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44" /><div className="min-w-0 flex-1">{children}</div></div> : children}</div>
			</div>
		</main>
	);
}
