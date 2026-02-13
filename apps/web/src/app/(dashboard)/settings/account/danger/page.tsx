import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountDangerZoneClient from "@/components/(gateway)/settings/account/AccountDangerZoneClient";

export default function AccountDangerPage() {
	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold leading-none">Danger zone</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Destructive actions for your user.
				</p>
			</div>

			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountDangerContent />
			</Suspense>
		</div>
	);
}

async function AccountDangerContent() {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const authUser = authData.user;

	if (!authUser) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Not signed in.
			</div>
		);
	}

	return <AccountDangerZoneClient />;
}

