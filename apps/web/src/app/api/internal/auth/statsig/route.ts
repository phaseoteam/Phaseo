import { NextResponse } from "next/server";
import {
	EMPTY_STATSIG_PROFILE,
	normalizeBetaFeatures,
	type StatsigProfile,
} from "@/lib/statsig/shared";
import { createClient } from "@/utils/supabase/server";

export type InternalAuthStatsigData = {
	signedIn: boolean;
	user?: {
		id: string;
		email: string | null;
	};
	profile: StatsigProfile;
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({
			signedIn: false,
			profile: EMPTY_STATSIG_PROFILE,
		} satisfies InternalAuthStatsigData);
	}

	const { data: profileRow, error } = await supabase
		.from("users")
		.select("beta_opt_in, beta_features")
		.eq("user_id", user.id)
		.maybeSingle();

	if (error) {
		throw new Error(
			`Failed to load Statsig profile for ${user.id}: ${error.message}`,
		);
	}

	return NextResponse.json({
		signedIn: true,
		user: {
			id: user.id,
			email: user.email ?? null,
		},
		profile: {
			betaOptIn: Boolean(profileRow?.beta_opt_in),
			betaFeatures: normalizeBetaFeatures(
				profileRow?.beta_features ?? EMPTY_STATSIG_PROFILE.betaFeatures,
			),
		},
	} satisfies InternalAuthStatsigData);
}
