import type { DailyActivityPoint, HeatmapDay } from "@/lib/profile";

export type ProfileUsageSummary = {
	requestSeries: DailyActivityPoint[];
	tokenSeries: DailyActivityPoint[];
	activitySeries30: DailyActivityPoint[];
	requestChange: number | null;
	tokenChange: number | null;
	totalRequests: number;
	totalTokens: number;
	avgPerDay: number;
	avgPerWeek: number;
	currentStreak: number;
	longestStreak: number;
	activeDays: number;
	topModels: Array<{ id: string; name: string; requests: number; tokens: number; spendNanos: number }>;
	modelActivity: Array<{
		date: string;
		id: string;
		name: string;
		requests: number;
		tokens: number;
		spendNanos: number;
	}>;
	heatmapDays: HeatmapDay[];
	creditsUsage: { today: string; week: string; month: string };
	byokUsage: { today: string; week: string; month: string };
	usageWorkspaceCount: number;
};

export type ProfileSnapshot = ProfileUsageSummary & {
	userId: string;
	displayName: string;
	email: string | null;
	avatarUrl: string | null;
	memberSince: string;
	workspaceName: string | null;
	publicProfileEnabled: boolean;
	publicProfileSlug: string | null;
	suggestedProfileSlug?: string;
	shareUrl: string | null;
};

export type SettingsProfileInitialData = {
	obfuscateInfo: boolean;
	profile: ProfileSnapshot | null;
};

export type SettingsProfileUsageData = {
	usage: ProfileUsageSummary | null;
};

export type ProfileGameSummary = {
	totalPlayed: number;
	totalWins: number;
	currentStreak: number;
	averageScore: number;
	games: Array<{
		game: "modele" | "timeline" | "pricele" | "head-to-head" | "sprint";
		label: string;
		played: number;
		wins: number;
		bestScore: number;
		lastPlayedAt: string | null;
	}>;
};

export type SettingsProfileGamesData = { games: ProfileGameSummary | null };
