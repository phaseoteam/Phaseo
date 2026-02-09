import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import AuthorizedAppsPanel from "@/components/(gateway)/settings/authorized-apps/AuthorizedAppsPanel";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = {
	title: "Authorized Apps - Settings",
	description: "Manage applications you've authorized to access your AI Stats account",
};

export default function AuthorizedAppsPage() {
	return (
		<div className="space-y-6">
			<div>
				<div className="flex items-center gap-2">
					<h1 className="text-2xl font-bold">Authorized Applications</h1>
					<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
						ALPHA
					</span>
				</div>
				<p className="text-sm text-muted-foreground mt-1">
					Manage third-party applications that have access to your AI Stats
					account. You can revoke access at any time.
				</p>
			</div>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AuthorizedAppsContent />
			</Suspense>
		</div>
	);
}

async function AuthorizedAppsContent() {
	const supabase = await createClient();

	// Get current user
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	// If not authenticated, redirect to sign in
	if (userError || !user) {
		redirect("/sign-in");
	}

	// Fetch user's authorized apps using the view
	const { data: authorizedApps, error: appsError } = await supabase
		.from("user_authorized_apps")
		.select("*")
		.order("last_used_at", { ascending: false, nullsFirst: false });

	if (appsError) {
		console.error("Error fetching authorized apps:", appsError);
	}

	return (
		<AuthorizedAppsPanel authorizedApps={authorizedApps ?? []} userId={user.id} />
	);
}
