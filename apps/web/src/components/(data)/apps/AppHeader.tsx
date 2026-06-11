import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Activity, Zap } from "lucide-react";
import { fetchFrontendAppDetails } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export default async function AppHeader({ appId }: { appId: string }) {
	const app = await fetchFrontendAppDetails(appId);

	if (!app) {
		return (
			<Card>
				<CardContent className="p-6">
					<p className="text-muted-foreground">App not found</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
			{/* App Info Card */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-lg">App Information</CardTitle>
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
									Visit App
								</a>
							)}
						</div>
						<div className="flex items-center gap-2">
							<Badge variant={app.is_active ? "default" : "secondary"}>
								{app.is_active ? "Active" : "Inactive"}
							</Badge>
						</div>
						<div className="text-xs text-muted-foreground">
							Last seen: {new Date(app.last_seen).toLocaleDateString()}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Total Requests */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-lg flex items-center gap-2">
						<Activity className="h-4 w-4" />
						Total Requests
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">
						{app.total_requests.toLocaleString()}
					</div>
					<p className="text-xs text-muted-foreground mt-1">
						All time successful requests
					</p>
				</CardContent>
			</Card>

			{/* Total Tokens */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-lg flex items-center gap-2">
						<Zap className="h-4 w-4" />
						Total Tokens
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">
						{app.total_tokens.toLocaleString()}
					</div>
					<p className="text-xs text-muted-foreground mt-1">
						Tokens consumed across all requests
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
