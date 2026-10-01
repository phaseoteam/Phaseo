import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";
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
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { Button } from "@/components/ui/button";
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
	title,
	description,
}: {
	title: string;
	description?: string;
}) {
	return (
		<div className="space-y-2">
			<h2 className="max-w-4xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
				{title}
			</h2>
			{description ? (
				<p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
			) : null}
		</div>
	);
}

export default async function MissionPage() {
 const [tx, t] = await Promise.all([getTranslations(), getTranslations("Site.mission")]);
const principles = [
	{
		title: tx("Site.mission.broadAccess" as never),
		description:
			tx("Site.mission.broadAccessBody" as never),
		icon: Database,
	},
	{
		title: tx("Site.mission.lowestPrice" as never),
		description:
			t("current.principles.sustainablePrice"),
		icon: Wallet,
	},
	{
		title: tx("Site.mission.openByDefault" as never),
		description:
			tx("Site.mission.openByDefaultBody" as never),
		icon: GitBranch,
	},
	{
		title: tx("Site.mission.usersFirst" as never),
		description:
			t("current.principles.usersFirst"),
		icon: Users,
	},
	{
		title: tx("Site.mission.transparency" as never),
		description:
			tx("Site.mission.transparencyBody" as never),
		icon: ShieldCheck,
	},
	{
		title: tx("Site.mission.technicalExcellence" as never),
		description:
			tx("Site.mission.technicalExcellenceBody" as never),
		icon: Sparkles,
	},
	{
		title: tx("Site.mission.builtWithEveryone" as never),
		description:
			tx("Site.mission.builtWithEveryoneBody" as never),
		icon: Handshake,
	},
] as const;

const measures = [
	t("current.measures.coverage"),
	t("current.measures.multipleProviders"),
	t("current.measures.savings"),
	t("current.measures.providerDemand"),
	t("current.measures.performance"),
	t("current.measures.operatingCosts"),
	t("current.measures.community"),
	t("current.measures.publishTime"),
] as const;


	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<section className="space-y-7">
					<h1 className="max-w-5xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						{t("current.hero.title")}</h1>

					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						{t("current.hero.body")}</p>

					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<Button asChild className="h-10">
							<Link href="/models">
								{tx("Site.mission.exploreModels" as never)}<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10">
							<Link href="https://github.com/phaseoteam/Phaseo" target="_blank" rel="noopener noreferrer">
								{tx("Site.mission.viewSource" as never)}<ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="ghost" className="h-10 sm:px-3">
							<Link href="/updates">{t("current.updatesLink")}</Link>
						</Button>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<section className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="max-w-3xl space-y-3">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
								{t("current.fees.title")}</h2>
							<p className="text-sm leading-6 text-muted-foreground">
								{t("current.fees.body")}</p>
						</div>
						<div className="flex items-center gap-3 text-sm text-muted-foreground lg:justify-self-end">
							<Wallet aria-hidden="true" className="size-5 shrink-0 text-primary" />
							<span>{t("current.fees.tagline")}</span>
						</div>
					</section>
				</div>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
					<SectionTitle
						title={t("current.purpose.title")}
						description={t("current.purpose.ecosystem")}
					/>

					<div className="border-l border-zinc-200/80 pl-6 dark:border-zinc-800/80">
						<h3 className="text-lg font-semibold tracking-tight text-foreground">{tx("Site.mission.why.successTitle" as never)}</h3>
						<div className="mt-3 space-y-4 text-sm leading-6 text-muted-foreground">
							<p>
								{t("current.purpose.success")}</p>
							<p>
								{t("current.purpose.sharedSuccess")}</p>
						</div>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title={tx("Site.mission.principlesTitle" as never)}
						description={tx("Site.mission.principlesDescription" as never)}
					/>

					<div className="grid border-y border-zinc-200/80 dark:border-zinc-800/80 md:grid-cols-2 md:gap-x-8">
						{principles.map((principle, index) => {
							const Icon = principle.icon;
							return (
								<div
									key={principle.title}
									className={`flex gap-4 py-5 ${
										index < principles.length - 1 ? "border-b border-zinc-200/80 dark:border-zinc-800/80" : ""
									} ${index === principles.length - 1 ? "md:col-span-2" : ""}`}
								>
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
										<Icon className="h-4 w-4 text-foreground" />
									</div>
									<div className="space-y-1">
										<h3 className="text-base font-semibold text-foreground">{principle.title}</h3>
										<p className="text-sm leading-6 text-muted-foreground">{principle.description}</p>
									</div>
								</div>
							);
						})}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title={t("current.sustainability.title")}
						description={t("current.sustainability.intro")}
					/>

					<div className="grid border-y border-zinc-200/80 dark:border-zinc-800/80 lg:grid-cols-3 lg:divide-x lg:divide-zinc-200/80 lg:dark:divide-zinc-800/80">
						<div className="space-y-2 border-b border-zinc-200/80 py-5 dark:border-zinc-800/80 lg:border-b-0 lg:px-6 lg:first:pl-0">
							<h3 className="text-base font-semibold text-foreground">{t("current.sustainability.marginTitle")}</h3>
							<p className="text-sm leading-6 text-muted-foreground">
								{t("current.sustainability.marginBody")}</p>
						</div>

						<div className="space-y-2 border-b border-zinc-200/80 py-5 dark:border-zinc-800/80 lg:border-b-0 lg:px-6">
							<h3 className="text-base font-semibold text-foreground">{t("current.sustainability.revenueTitle")}</h3>
							<p className="text-sm leading-6 text-muted-foreground">
								{t("current.sustainability.revenueBody")}</p>
						</div>

						<div className="space-y-2 py-5 lg:px-6 lg:last:pr-0">
							<h3 className="text-base font-semibold text-foreground">{t("current.sustainability.independenceTitle")}</h3>
							<p className="text-sm leading-6 text-muted-foreground">
								{t("current.sustainability.independenceBody")}</p>
						</div>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-6 lg:grid-cols-[1fr_0.92fr] lg:items-start">
					<div className="space-y-6">
						<SectionTitle
							title={t("current.providers.title")}
							description={t("current.providers.distribution")}
						/>

						<div className="space-y-4 text-sm leading-6 text-muted-foreground">
							<p>
								{t("current.providers.costs")}</p>
							<p>
								{t("current.providers.cycle")}</p>
							<p>
								{t("current.providers.partners")}</p>
						</div>
					</div>

					<div className="border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80 lg:mt-1">
						<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
							<Route className="h-4 w-4" />
							{t("current.providers.testTitle")}</div>
						<p className="mt-3 text-sm leading-6 text-muted-foreground">
							{t("current.providers.testBody")}</p>
						<Button asChild variant="outline" className="mt-5 w-full justify-between">
							<Link href="/contact">
								{tx("Site.mission.partners.contact" as never)}<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title={t("current.evidence.title")}
						description={t("current.evidence.body")}
					/>

					<div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
						{measures.map((measure) => (
							<div
								key={measure}
								className="flex items-start gap-3"
							>
								<LineChart className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
								<span className="text-sm leading-6 text-muted-foreground">{measure}</span>
							</div>
						))}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="py-8">
					<div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="space-y-2">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground">{tx("Site.mission.closing.title" as never)}</h2>
							<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
								{t("current.commitment")}</p>
						</div>
						<div className="flex flex-col gap-3 sm:flex-row">
							<Button asChild>
								<Link href="https://github.com/phaseoteam/Phaseo/issues" target="_blank" rel="noopener noreferrer">
									{tx("Site.mission.closing.openIssue" as never)}<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline">
								<Link href="/about">{tx("Site.mission.closing.aboutPhaseo" as never)}</Link>
							</Button>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
