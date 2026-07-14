import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { fetchFrontendAppDetails } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export default async function AppDetailShell({
	appId,
	children,
	app,
}: {
	appId: string;
	children: React.ReactNode;
	app?: { id: string; title: string; url?: string | null } | null;
}) {
	let appData = app;

	if (!appData) {
		const fetchedApp = await fetchFrontendAppDetails(appId).catch(() => null);

		if (!fetchedApp) {
			return (
				<main className="flex min-h-screen flex-col">
					<div className="container mx-auto px-4 py-8">
						<Card>
							<CardHeader>
								<CardTitle>App Not Found</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									The app you&apos;re looking for doesn&apos;t exist.
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
		};
	}

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-6 flex flex-wrap items-center gap-3">
					<h1 className="text-3xl font-bold">{appData.title}</h1>
					{appData.url && appData.url !== "about:blank" ? (
						<Button asChild size="sm" variant="outline">
							<Link
								href={appData.url}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-1"
							>
								Visit app
								<ExternalLink className="h-4 w-4" />
							</Link>
						</Button>
					) : null}
				</div>
				{children}
			</div>
		</main>
	);
}
