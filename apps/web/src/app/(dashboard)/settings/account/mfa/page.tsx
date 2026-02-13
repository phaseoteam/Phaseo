import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountMFAClient from "@/components/(gateway)/settings/account/AccountMFAClient";

export default function AccountMFAPage() {
	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold leading-none">MFA</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Manage two-factor authentication for your user.
				</p>
			</div>

			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountMFAContent />
			</Suspense>
		</div>
	);
}

async function AccountMFAContent() {
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

	const { data: mfaData } = await supabase.auth.mfa.listFactors();
	const mfaFactor = mfaData?.totp?.find((f) => f.status === "verified");
	const mfaEnabled = !!mfaFactor;
	const mfaFactorId = mfaFactor?.id ?? null;

	const provider = authUser.app_metadata?.provider;
	const isOAuthUser = provider && provider !== "email";
	const hasPassword = !isOAuthUser;

	return (
		<AccountMFAClient
			mfaEnabled={mfaEnabled}
			mfaFactorId={mfaFactorId}
			hasPassword={hasPassword}
		/>
	);
}

