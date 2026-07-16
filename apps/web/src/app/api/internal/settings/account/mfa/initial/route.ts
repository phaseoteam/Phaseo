import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export type SettingsAccountMfaInitialData = {
	hasPassword: boolean;
	mfaEnabled: boolean;
	mfaFactorId: string | null;
	signedIn: boolean;
};

export async function GET() {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const authUser = authData.user;

	if (!authUser) {
		return NextResponse.json({
			hasPassword: false,
			mfaEnabled: false,
			mfaFactorId: null,
			signedIn: false,
		} satisfies SettingsAccountMfaInitialData);
	}

	const { data: mfaData } = await supabase.auth.mfa.listFactors();
	const mfaFactor = mfaData?.totp?.find((factor) => factor.status === "verified");
	const provider = authUser.app_metadata?.provider;
	const hasPassword = !provider || provider === "email";
	return NextResponse.json({
		hasPassword,
		mfaEnabled: Boolean(mfaFactor),
		mfaFactorId: mfaFactor?.id ?? null,
		signedIn: true,
	} satisfies SettingsAccountMfaInitialData);
}
