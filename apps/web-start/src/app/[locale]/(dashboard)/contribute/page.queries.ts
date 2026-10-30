import { queryOptions } from "@tanstack/react-query";

export type GitHubContributor = {
	name: string;
	login: string;
	htmlUrl: string;
	avatarUrl: string;
	contributions: number;
};

export const githubContributorsQuery = () =>
	queryOptions({
		queryKey: ["github-contributors", "phaseoteam/Phaseo"],
		queryFn: async (): Promise<GitHubContributor[]> => {
			let contributors: GitHubContributor[] = [];
			try {
				const response = await fetch(
					"https://api.github.com/repos/phaseoteam/Phaseo/contributors?per_page=100",
				);
				if (response.ok) {
					const data = await response.json();
					contributors = data.map((item: any) => ({
						name: item.name || item.login,
						login: item.login,
						htmlUrl: item.html_url,
						avatarUrl: item.avatar_url,
						contributions: item.contributions,
					}));
				}
			} catch (error) {
				console.error("Failed to fetch contributors:", error);
				// Fallback to empty array
			}
			return contributors;
		},
		// Next cached this fetch for 24 hours.
		staleTime: 86_400_000,
	});
