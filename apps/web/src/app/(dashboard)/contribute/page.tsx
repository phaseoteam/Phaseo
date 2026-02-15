import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { Metadata } from "next";

type StaticContributor = {
	name?: string;
	login?: string;
	htmlUrl?: string;
	avatarUrl?: string;
	contributions: number;
};

type StaticSponsor = {
	name?: string;
	login: string;
	avatarUrl?: string;
	url?: string;
};

export const metadata: Metadata = {
	title: "Contribute To The AI Stats Database",
	description: "See which contributors and sponsors are supporting AI Stats.",
};

const staticSponsors = null;

function getInitials(name: string) {
	const parts = name
		.split(/[\s-]+/)
		.filter((segment) => Boolean(segment))
		.map((segment) => segment.charAt(0));
	if (!parts.length) return "";
	if (parts.length === 1) {
		return parts[0].substring(0, 2).toUpperCase();
	}
	return `${parts[0]}${parts[parts.length - 1]}`.toUpperCase();
}

function getDisplayName(contributor: StaticContributor) {
	return contributor.name ?? contributor.login ?? "Community contributor";
}

function getContributorProfileUrl(contributor: StaticContributor) {
	if (contributor.htmlUrl) {
		return contributor.htmlUrl;
	}
	if (contributor.login) {
		return `https://github.com/${contributor.login}`;
	}
	return null;
}

export default async function Page() {
	let contributors: StaticContributor[] = [];
	try {
		const response = await fetch(
			"https://api.github.com/repos/DanielButler1/AI-Stats/contributors?per_page=100",
			{
				next: { revalidate: 86400 }, // Cache for 24 hour
			}
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
	const sponsors: StaticSponsor[] = staticSponsors || [];
	const sortedContributors = [...contributors].sort(
		(a, b) => b.contributions - a.contributions
	);

	return (
		<section className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
			<div className="space-y-8">
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
						Contributors & Sponsors
					</h1>
					<p className="text-base text-zinc-600 dark:text-zinc-300">
						We build in public. These lists show everyone who has
						contributed to the AI Stats repository and those who
						sponsor its development via GitHub Sponsors. These are
						great people!
					</p>
				</div>

				<Card className="h-full">
					<CardHeader className="space-y-2">
						<div className="flex items-center justify-between gap-4">
							<CardTitle className="text-lg font-semibold">
								Repository contributors
							</CardTitle>
							<Badge variant="secondary" className="shrink-0">
								{sortedContributors.length} contributors
							</Badge>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						{!sortedContributors.length ? (
							<p className="text-sm text-zinc-500 dark:text-zinc-400">
								Contributor data is still building. Trigger the
								export workflow or check back soon.
							</p>
						) : (
							<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
								{sortedContributors.map((contributor) => {
									const profileUrl =
										getContributorProfileUrl(contributor);
									const displayName =
										getDisplayName(contributor);
									const hasGithubHandle = Boolean(
										contributor.login
									);

									return (
										<Card
											key={
												contributor.login ??
												`${displayName}-${contributor.contributions}`
											}
										>
											<CardContent className="flex flex-col items-center gap-4 p-4">
												<Avatar className="w-16 h-16">
													{contributor.avatarUrl ? (
														<AvatarImage
															src={
																contributor.avatarUrl
															}
															alt={displayName}
														/>
													) : (
														<AvatarFallback>
															{getInitials(
																displayName
															)}
														</AvatarFallback>
													)}
												</Avatar>
												<div className="text-center">
													<p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
														{displayName}
													</p>
													{hasGithubHandle &&
													profileUrl ? (
														<a
															href={profileUrl}
															target="_blank"
															rel="noreferrer"
															className="text-xs text-zinc-500 transition-colors hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400"
														>
															@{contributor.login}
														</a>
													) : (
														<p className="text-xs text-zinc-500 dark:text-zinc-400">
															GitHub handle not
															published
														</p>
													)}
												</div>
												<Badge
													variant="outline"
													className="shrink-0"
												>
													{(
														contributor.contributions ??
														0
													).toLocaleString()}{" "}
													commits
												</Badge>
											</CardContent>
										</Card>
									);
								})}
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="h-full">
					<CardHeader className="space-y-2">
						<div className="flex items-center justify-between gap-4">
							<CardTitle className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
								Sponsors
							</CardTitle>
							<Badge variant="secondary" className="shrink-0">
								{sponsors.length} listed
							</Badge>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						{!sponsors.length ? (
							<p className="text-sm text-zinc-500 dark:text-zinc-400">
								No sponsors recorded yet; join the community and
								your name will appear here soon!
							</p>
						) : (
							<div className="grid gap-4 grid-cols-1">
								{sponsors.map((sponsor) => (
									<Card key={sponsor.login}>
										<CardContent className="flex flex-col items-center gap-4 p-4">
											<Avatar className="w-16 h-16">
												{sponsor.avatarUrl ? (
													<AvatarImage
														src={sponsor.avatarUrl}
														alt={
															sponsor.name ??
															sponsor.login
														}
													/>
												) : (
													<AvatarFallback>
														{getInitials(
															sponsor.login
														)}
													</AvatarFallback>
												)}
											</Avatar>
											<div className="text-center">
												<p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
													{sponsor.name ??
														sponsor.login}
												</p>
												<p className="text-xs text-zinc-500 dark:text-zinc-400">
													GitHub Sponsors
												</p>
											</div>
											{sponsor.url ? (
												<a
													href={sponsor.url}
													target="_blank"
													rel="noreferrer"
													className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400"
												>
													View profile
												</a>
											) : (
												<span className="text-xs text-zinc-500 dark:text-zinc-400">
													Link unavailable
												</span>
											)}
										</CardContent>
									</Card>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
