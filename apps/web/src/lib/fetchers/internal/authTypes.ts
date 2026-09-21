import type { StatsigProfile } from "@/lib/statsig/shared";
import type { DisplayPreferences } from "@/lib/displayPreferences";

export type InternalAuthStatus = {
	isAdmin: boolean;
	role?: string | null;
	signedIn: boolean;
};

export type InternalAuthHeaderUser = {
	id: string;
	email: string | null;
	displayName: string | null;
	avatarUrl: string | null;
};

export type InternalAuthHeaderData = {
	isLoggedIn: boolean;
	user?: InternalAuthHeaderUser;
	teams: Array<{ id: string; name: string }>;
	displayPreferences?: DisplayPreferences;
	currentTeamId?: string;
	userRole?: string;
	providerMode?: boolean;
};

export type InternalAuthStatsigData = {
	signedIn: boolean;
	user?: { id: string; email: string | null };
	profile: StatsigProfile;
};
