import { NextResponse } from "next/server";
import {
	EMPTY_STATSIG_PROFILE,
	normalizeBetaFeatures,
	type StatsigProfile,
	type WebFeatureGate,
} from "@/lib/statsig/shared";
import { getVisibleWebBetaFeatures } from "@/lib/statsig/feature-visibility";
import { createClient } from "@/utils/supabase/server";

export type SettingsBetaInitialData = {
	features: WebFeatureGate[];
	profile: StatsigProfile;
	signedIn: boolean;
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({
			features: [],
			profile: EMPTY_STATSIG_PROFILE,
			signedIn: false,
		} satisfies SettingsBetaInitialData);
	}

	const profileResult = await supabase
		.from("users")
		.select("beta_opt_in, beta_features")
		.eq("user_id", user.id)
		.maybeSingle();

	if (profileResult.error) {
		throw new Error(
			`Failed to load beta preferences for ${user.id}: ${profileResult.error.message}`,
		);
	}

	return NextResponse.json({
		features: await getVisibleWebBetaFeatures(),
		profile: {
			betaOptIn: Boolean(profileResult.data?.beta_opt_in),
			betaFeatures: normalizeBetaFeatures(
				profileResult.data?.beta_features ?? EMPTY_STATSIG_PROFILE.betaFeatures,
			),
		},
		signedIn: true,
	} satisfies SettingsBetaInitialData);
}
