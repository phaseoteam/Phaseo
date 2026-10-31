import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

export type GitHubContributor = {
	name: string;
	login: string;
	htmlUrl: string;
	avatarUrl: string;
	contributions: number;
};

// Server-side so the edge cache serves every visitor (GitHub allows 60
// unauthenticated requests an hour per IP and rejects requests without a
// User-Agent). Next cached this fetch for 24 hours.
const fetchGitHubContributors = createServerFn({ method: "GET" }).handler(async (): Promise<GitHubContributor[]> => {
	try {
		const response = await fetch("https://api.github.com/repos/phaseoteam/Phaseo/contributors?per_page=100", {
			headers: { "User-Agent": "phaseo-web", Accept: "application/vnd.github+json" },
			cf: { cacheTtl: 86_400, cacheEverything: true },
		} as RequestInit);
		if (!response.ok) return [];
		const data = (await response.json()) as Array<{ name?: string; login: string; html_url: string; avatar_url: string; contributions: number }>;
		return data.map((item) => ({
			name: item.name || item.login,
			login: item.login,
			htmlUrl: item.html_url,
			avatarUrl: item.avatar_url,
			contributions: item.contributions,
		}));
	} catch (error) {
		console.error("Failed to fetch contributors:", error);
		return [];
	}
});

export const githubContributorsQuery = () =>
	queryOptions({
		queryKey: ["github-contributors", "phaseoteam/Phaseo"],
		queryFn: () => fetchGitHubContributors(),
		staleTime: 86_400_000,
	});
