import { NextResponse } from "next/server";
import { getUserObfuscationPreference } from "@/lib/fetchers/account/getUserObfuscationPreference";
import {
	getOwnProfileSnapshot,
	type ProfileSnapshot,
} from "@/lib/fetchers/profile/getProfileSnapshot";

export type SettingsProfileInitialData = {
	obfuscateInfo: boolean;
	profile: ProfileSnapshot | null;
};

export async function GET() {
	const profile = await getOwnProfileSnapshot();

	if (!profile) {
		return NextResponse.json({
			obfuscateInfo: false,
			profile: null,
		} satisfies SettingsProfileInitialData);
	}

	const obfuscateInfo = await getUserObfuscationPreference(profile.userId);

	return NextResponse.json({
		obfuscateInfo,
		profile,
	} satisfies SettingsProfileInitialData);
}
