import type { StatsigProfile } from "@/lib/statsig/shared";

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
	currentTeamId?: string;
	userRole?: string;
};

export type InternalAuthStatsigData = {
	signedIn: boolean;
	user?: { id: string; email: string | null };
	profile: StatsigProfile;
};
