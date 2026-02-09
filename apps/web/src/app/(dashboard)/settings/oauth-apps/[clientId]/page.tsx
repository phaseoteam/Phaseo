import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import OAuthAppDetailPanel from "@/components/(gateway)/settings/oauth-apps/OAuthAppDetailPanel";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = {
	title: "OAuth App Details - Settings",
};

interface OAuthAppDetailPageProps {
	params: Promise<{
		clientId: string;
	}>;
}

export default function OAuthAppDetailPage({ params }: OAuthAppDetailPageProps) {
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/settings/oauth-apps">
						<ChevronLeft className="h-5 w-5" />
					</Link>
				</Button>
				<div className="flex-1">
					<h1 className="text-2xl font-bold">OAuth Application</h1>
					<p className="text-sm text-muted-foreground mt-1">
						OAuth Application Details
					</p>
				</div>
			</div>
			<Suspense fallback={<SettingsSectionFallback />}>
				<OAuthAppDetailContent params={params} />
			</Suspense>
		</div>
	);
}

async function OAuthAppDetailContent({ params }: OAuthAppDetailPageProps) {
	const { clientId } = await params;
	const supabase = await createClient();

	// Get current user
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return notFound();
	}

	// Fetch OAuth app with stats
	const { data: oauthApp } = await supabase
		.from("oauth_apps_with_stats")
		.select("*")
		.eq("client_id", clientId)
		.single();

	if (!oauthApp) {
		return notFound();
	}

	// Fetch recent authorizations for this app
	const { data: authorizations } = await supabase
		.from("oauth_authorizations")
		.select(`
			*,
			users:user_id (
				user_id,
				full_name,
				email
			),
			teams:team_id (
				id,
				name
			)
		`)
		.eq("client_id", clientId)
		.is("revoked_at", null)
		.order("last_used_at", { ascending: false, nullsFirst: false })
		.limit(10);

	// Fetch usage analytics (last 30 days)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	const { data: usageStats } = await supabase
		.from("gateway_requests")
		.select("created_at, success, cost_nanos")
		.eq("oauth_client_id", clientId)
		.gte("created_at", thirtyDaysAgo.toISOString())
		.order("created_at", { ascending: true });

	return (
		<OAuthAppDetailPanel
			oauthApp={oauthApp}
			authorizations={authorizations ?? []}
			usageStats={usageStats ?? []}
			currentUserId={user.id}
		/>
	);
}
