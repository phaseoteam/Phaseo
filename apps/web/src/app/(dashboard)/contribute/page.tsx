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
	title: "Contributors & Sponsors | AI Stats",
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

function isBotIdentity(value?: string | null) {
	return Boolean(value && value.toLowerCase().includes("[bot]"));
}

function formatDisplayName(value: string) {
	const cleaned = value.replace(/\[bot\]/gi, "").trim();
	return cleaned.length ? cleaned : value;
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
							<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
								{sortedContributors.map((contributor) => {
									const profileUrl =
										getContributorProfileUrl(contributor);
									const displayName =
										getDisplayName(contributor);
									const isBot =
										isBotIdentity(displayName) ||
										isBotIdentity(contributor.login);
									const readableName =
										formatDisplayName(displayName);
									const hasGithubHandle = Boolean(
										contributor.login
									);

									return (
										<Card
											key={
												contributor.login ??
												`${displayName}-${contributor.contributions}`
											}
											className={
												isBot
													? "border-dashed border-zinc-300/80 bg-zinc-50/70 dark:border-zinc-700/80 dark:bg-zinc-900/40"
													: undefined
											}
										>
											<CardContent className="flex flex-col items-center gap-2 p-2.5">
												<Avatar className="h-10 w-10">
													{contributor.avatarUrl ? (
														<AvatarImage
															src={
																contributor.avatarUrl
															}
															alt={readableName}
														/>
													) : (
														<AvatarFallback>
															{getInitials(
																readableName
															)}
														</AvatarFallback>
													)}
												</Avatar>
												<div className="text-center">
													{hasGithubHandle && profileUrl ? (
														<a
															href={profileUrl}
															target="_blank"
															rel="noreferrer"
															className="text-xs font-semibold text-zinc-950 transition-colors hover:text-blue-600 dark:text-zinc-50 dark:hover:text-blue-400"
														>
															{readableName}
														</a>
													) : (
														<p className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">
															{readableName}
														</p>
													)}
												</div>
												<Badge
													variant="outline"
													className="h-5 shrink-0 px-2 text-[10px]"
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
							<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
								{sponsors.map((sponsor) => {
									const displayName = sponsor.name ?? sponsor.login;
									const isBot =
										isBotIdentity(displayName) ||
										isBotIdentity(sponsor.login);
									const readableName =
										formatDisplayName(displayName);

									return (
										<Card
											key={sponsor.login}
											className={
												isBot
													? "border-dashed border-zinc-300/80 bg-zinc-50/70 dark:border-zinc-700/80 dark:bg-zinc-900/40"
													: undefined
											}
										>
											<CardContent className="flex flex-col items-center gap-2 p-2.5">
												<Avatar className="h-10 w-10">
													{sponsor.avatarUrl ? (
														<AvatarImage
															src={sponsor.avatarUrl}
															alt={readableName}
														/>
													) : (
														<AvatarFallback>
															{getInitials(
																readableName
															)}
														</AvatarFallback>
													)}
												</Avatar>
												<div className="text-center">
													<p className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">
														{readableName}
													</p>
													<p className="text-[11px] text-zinc-500 dark:text-zinc-400">
														{isBot
															? "GitHub Sponsors bot"
															: "GitHub Sponsors"}
													</p>
												</div>
												{sponsor.url ? (
													<a
														href={sponsor.url}
														target="_blank"
														rel="noreferrer"
														className="text-[10px] font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400"
													>
														View profile
													</a>
												) : (
													<span className="text-[10px] text-zinc-500 dark:text-zinc-400">
														Link unavailable
													</span>
												)}
											</CardContent>
										</Card>
									);
								})}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
