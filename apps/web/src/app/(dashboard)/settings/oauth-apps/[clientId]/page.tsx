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

interface OAuthRequestRow {
	request_id: string;
	created_at: string;
	oauth_user_id: string | null;
	endpoint: string | null;
	model_id: string | null;
	provider: string | null;
	success: boolean;
	status_code: number | null;
	error_code: string | null;
	cost_nanos: number | null;
	latency_ms: number | null;
}

interface OAuthUserDirectoryRow {
	user_id: string;
	full_name: string | null;
	email: string | null;
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
		.eq("auth_method", "oauth")
		.gte("created_at", thirtyDaysAgo.toISOString())
		.order("created_at", { ascending: true });

	const { data: recentRequests } = await supabase
		.from("gateway_requests")
		.select(
			"request_id, created_at, oauth_user_id, endpoint, model_id, provider, success, status_code, error_code, cost_nanos, latency_ms"
		)
		.eq("oauth_client_id", clientId)
		.eq("auth_method", "oauth")
		.order("created_at", { ascending: false })
		.limit(250);

	const { data: authorizationUsers } = await supabase
		.from("oauth_authorizations")
		.select(
			`
			user_id,
			users:user_id (
				user_id,
				full_name,
				email
			)
		`
		)
		.eq("client_id", clientId)
		.order("last_used_at", { ascending: false, nullsFirst: false });

	const userDirectoryMap = new Map<string, OAuthUserDirectoryRow>();
	for (const entry of authorizationUsers ?? []) {
		const user = Array.isArray((entry as any).users)
			? (entry as any).users[0]
			: (entry as any).users;
		const userId =
			typeof (entry as any)?.user_id === "string"
				? (entry as any).user_id
				: typeof user?.user_id === "string"
					? user.user_id
					: null;
		if (!userId || userDirectoryMap.has(userId)) continue;
		userDirectoryMap.set(userId, {
			user_id: userId,
			full_name: typeof user?.full_name === "string" ? user.full_name : null,
			email: typeof user?.email === "string" ? user.email : null,
		});
	}

	return (
		<OAuthAppDetailPanel
			oauthApp={oauthApp}
			authorizations={authorizations ?? []}
			usageStats={usageStats ?? []}
			recentRequests={(recentRequests ?? []) as OAuthRequestRow[]}
			userDirectory={Array.from(userDirectoryMap.values())}
			currentUserId={user.id}
		/>
	);
}
