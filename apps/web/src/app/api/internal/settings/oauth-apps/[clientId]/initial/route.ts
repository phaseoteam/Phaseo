import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

interface OAuthUserDirectoryRow {
	email: string | null;
	full_name: string | null;
	user_id: string;
}

export type SettingsOAuthAppDetailInitialData = {
	authorizations: any[];
	currentUserId: string | null;
	oauthApp: any | null;
	recentRequests: any[];
	signedIn: boolean;
	usageStats: any[];
	userDirectory: OAuthUserDirectoryRow[];
};

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ clientId: string }> },
) {
	const { clientId } = await params;
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({
			authorizations: [],
			currentUserId: null,
			oauthApp: null,
			recentRequests: [],
			signedIn: false,
			usageStats: [],
			userDirectory: [],
		} satisfies SettingsOAuthAppDetailInitialData);
	}

	const { data: oauthApp } = await supabase
		.from("oauth_apps_with_stats")
		.select("*")
		.eq("client_id", clientId)
		.single();

	if (!oauthApp) {
		return NextResponse.json({
			authorizations: [],
			currentUserId: user.id,
			oauthApp: null,
			recentRequests: [],
			signedIn: true,
			usageStats: [],
			userDirectory: [],
		} satisfies SettingsOAuthAppDetailInitialData);
	}

	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	const [authorizationsResult, usageStatsResult, recentRequestsResult, authorizationUsersResult] =
		await Promise.all([
			supabase
				.from("oauth_authorizations")
				.select(`
					*,
					users:user_id (
						user_id,
						full_name,
						email
					),
					teams:workspaces (
						id,
						name
					)
				`)
				.eq("client_id", clientId)
				.is("revoked_at", null)
				.order("last_used_at", { ascending: false, nullsFirst: false })
				.limit(10),
			supabase
				.from("gateway_requests")
				.select("created_at, success, cost_nanos")
				.eq("oauth_client_id", clientId)
				.eq("auth_method", "oauth")
				.gte("created_at", thirtyDaysAgo.toISOString())
				.order("created_at", { ascending: true }),
			supabase
				.from("gateway_requests")
				.select(
					"request_id, created_at, oauth_user_id, endpoint, model_id, provider, success, status_code, error_code, cost_nanos, latency_ms",
				)
				.eq("oauth_client_id", clientId)
				.eq("auth_method", "oauth")
				.order("created_at", { ascending: false })
				.limit(250),
			supabase
				.from("oauth_authorizations")
				.select(`
					user_id,
					users:user_id (
						user_id,
						full_name,
						email
					)
				`)
				.eq("client_id", clientId)
				.order("last_used_at", { ascending: false, nullsFirst: false }),
		]);

	const userDirectoryMap = new Map<string, OAuthUserDirectoryRow>();
	for (const entry of authorizationUsersResult.data ?? []) {
		const directoryUser = Array.isArray((entry as any).users)
			? (entry as any).users[0]
			: (entry as any).users;
		const userId =
			typeof (entry as any)?.user_id === "string"
				? (entry as any).user_id
				: typeof directoryUser?.user_id === "string"
					? directoryUser.user_id
					: null;
		if (!userId || userDirectoryMap.has(userId)) continue;
		userDirectoryMap.set(userId, {
			user_id: userId,
			full_name:
				typeof directoryUser?.full_name === "string"
					? directoryUser.full_name
					: null,
			email:
				typeof directoryUser?.email === "string" ? directoryUser.email : null,
		});
	}

	return NextResponse.json({
		authorizations: authorizationsResult.data ?? [],
		currentUserId: user.id,
		oauthApp,
		recentRequests: recentRequestsResult.data ?? [],
		signedIn: true,
		usageStats: usageStatsResult.data ?? [],
		userDirectory: Array.from(userDirectoryMap.values()),
	} satisfies SettingsOAuthAppDetailInitialData);
}
