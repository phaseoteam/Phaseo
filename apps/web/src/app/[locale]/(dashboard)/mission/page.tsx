import Link from "next/link";
import type { Metadata } from "next";
import {
	ArrowRight,
	Database,
	GitBranch,
	Handshake,
	LineChart,
	Route,
	ShieldCheck,
	Sparkles,
	Users,
	Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import type { PublicLocale } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export async function generateMetadata({ params }: { params: Promise<{ locale: PublicLocale }> }): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.mission" });
	return buildLocalizedPageMetadata({
		locale,
		pathname: "/mission",
		title: t("title"),
		description: t("intro"),
		keywords: t.raw("metadataKeywords" as never) as string[],
	});
}

function SectionTitle({
	eyebrow,
	title,
	description,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
}) {
	return (
		<div className="space-y-2">
			{eyebrow ? (
				<div className="text-[11px] font-semibold tracking-[0.26em] uppercase text-muted-foreground">
					{eyebrow}
				</div>
			) : null}
			<h2 className="max-w-4xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
				{title}
			</h2>
			{description ? (
				<p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
			) : null}
		</div>
	);
}

const principleIcons = [Database, Wallet, GitBranch, Users, ShieldCheck, Sparkles, Handshake] as const;

const principleKeys = [
	{ title: "broadAccess", body: "broadAccessBody" },
	{ title: "lowestPrice", body: "lowestPriceBody" },
	{ title: "openByDefault", body: "openByDefaultBody" },
	{ title: "usersFirst", body: "usersFirstBody" },
	{ title: "transparency", body: "transparencyBody" },
	{ title: "technicalExcellence", body: "technicalExcellenceBody" },
	{ title: "builtWithEveryone", body: "builtWithEveryoneBody" },
] as const;

export default function MissionPage() {
	const t = useTranslations("Site.mission");
	const heroBadges = t.raw("heroBadges" as never) as string[];
	const why = t.raw("why" as never) as Record<string, string>;
	const independence = t.raw("independence" as never) as Record<string, string>;
	const partners = t.raw("partners" as never) as Record<string, string>;
	const progress = t.raw("progress" as never) as Record<string, string>;
	const measures = t.raw("measures" as never) as string[];
	const closing = t.raw("closing" as never) as Record<string, string>;
	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary" className="text-[11px]">
							{t("title")}
						</Badge>
						{heroBadges.map((badge) => <Badge key={badge} variant="outline" className="text-[11px]">{badge}</Badge>)}
					</div>

					<h1 className="max-w-5xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						{t("title")}
					</h1>

					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						{t("intro")}
					</p>

					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<Button asChild className="h-10">
							<Link href="/models">
								{t("exploreModels")}
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10">
							<Link href="https://github.com/phaseoteam/Phaseo" target="_blank" rel="noopener noreferrer">
								{t("viewSource")}
								<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="ghost" className="h-10 sm:px-3">
							<Link href="/roadmap">{t("roadmap")}</Link>
						</Button>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow={why.eyebrow}
						title={why.title}
						description={why.description}
					/>

					<Card className="border-zinc-200/70 bg-white/75 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
						<CardHeader>
							<CardTitle className="text-lg">{why.successTitle}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
							<p>
								{why.successFirst}
							</p>
							<p>
								{why.successSecond}
							</p>
						</CardContent>
					</Card>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow={t("principles")}
						title={t("principlesTitle")}
						description={t("principlesDescription")}
					/>

					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{principleKeys.map((principle, index) => {
							const Icon = principleIcons[index];
							return (
								<Card
									key={principle.title}
									className={`border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60 ${
										index === principleKeys.length - 1 ? "md:col-span-2 xl:col-span-3" : ""
									}`}
								>
									<CardHeader className="space-y-3">
										<div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200/70 bg-white dark:border-zinc-800/70 dark:bg-zinc-950">
											<Icon className="h-4 w-4 text-foreground" />
										</div>
										<CardTitle className="text-base">{t(principleKeys[index].title)}</CardTitle>
										<p className="text-sm leading-6 text-muted-foreground">{t(principleKeys[index].body)}</p>
									</CardHeader>
								</Card>
							);
						})}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow={independence.eyebrow}
						title={independence.title}
						description={independence.description}
					/>

					<div className="grid gap-4 lg:grid-cols-3">
						<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
							<CardHeader className="space-y-2">
								<CardTitle className="text-base">{independence.noVcTitle}</CardTitle>
								<p className="text-sm leading-6 text-muted-foreground">
									{independence.noVcDescription}
								</p>
							</CardHeader>
						</Card>

						<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
							<CardHeader className="space-y-2">
								<CardTitle className="text-base">{independence.revenueTitle}</CardTitle>
								<p className="text-sm leading-6 text-muted-foreground">
									{independence.revenueDescription}
								</p>
							</CardHeader>
						</Card>

						<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
							<CardHeader className="space-y-2">
								<CardTitle className="text-base">{independence.financingTitle}</CardTitle>
								<p className="text-sm leading-6 text-muted-foreground">
									{independence.financingDescription}
								</p>
							</CardHeader>
						</Card>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-6 lg:grid-cols-[1fr_0.92fr] lg:items-start animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<div className="space-y-6">
						<SectionTitle
							eyebrow={partners.eyebrow}
							title={partners.title}
							description={partners.description}
						/>

						<div className="space-y-4 text-sm leading-6 text-muted-foreground">
							<p>
								{partners.first}
							</p>
							<p>
								{partners.second}
							</p>
						</div>
					</div>

					<Card className="border-zinc-200/70 bg-white/75 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
						<CardHeader className="space-y-2">
							<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
								<Route className="h-4 w-4" />
								{partners.testTitle}
							</div>
							<p className="text-sm leading-6 text-muted-foreground">
								{partners.testDescription}
							</p>
						</CardHeader>
						<CardContent>
							<Button asChild variant="outline" className="w-full justify-between">
								<Link href="/contact">
									{partners.contact}
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
						</CardContent>
					</Card>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<SectionTitle
						eyebrow={progress.eyebrow}
						title={progress.title}
						description={progress.description}
					/>

					<Card className="border-zinc-200/70 bg-white/75 dark:border-zinc-800/70 dark:bg-zinc-950/60">
						<CardContent className="grid gap-3 p-5 md:grid-cols-2">
							{measures.map((measure) => (
								<div key={measure} className="flex items-start gap-3 rounded-lg border border-zinc-200/70 p-3 dark:border-zinc-800/70">
									<LineChart className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
									<span className="text-sm leading-6 text-muted-foreground">{measure}</span>
								</div>
							))}
						</CardContent>
					</Card>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="rounded-2xl border border-zinc-200/70 bg-white/75 p-6 dark:border-zinc-800/70 dark:bg-zinc-950/60 sm:p-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
					<div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="space-y-2">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground">{closing.title}</h2>
							<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
								{closing.description}
							</p>
						</div>
						<div className="flex flex-col gap-3 sm:flex-row">
							<Button asChild>
								<Link href="https://github.com/phaseoteam/Phaseo/issues" target="_blank" rel="noopener noreferrer">
									{closing.openIssue}
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline">
								<Link href="/about">{closing.aboutPhaseo}</Link>
							</Button>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
