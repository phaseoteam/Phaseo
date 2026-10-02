import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import {
	ArrowRight,
	GitBranch,
	Handshake,
	Heart,
	Route,
	Scale,
	ShieldCheck,
	Users,
	Wallet,
} from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export async function generateMetadata({ params }: { params: Promise<{ locale: PublicLocale }> }): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Site.about" });
	return buildMetadata({
		title: t("metadataTitle"),
		description: t("metadataDescription"),
		path: "/about",
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
			<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
			{description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
		</div>
	);
}

function TextLink({
	href,
	label,
	external = false,
}: {
	href: string;
	label: string;
	external?: boolean;
}) {
	return (
		<Link
			href={href}
			{...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
			className="inline-flex items-center text-sm font-medium text-foreground underline decoration-zinc-300 underline-offset-4 hover:decoration-foreground dark:decoration-zinc-700 dark:hover:decoration-foreground"
		>
			{label}
			<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
		</Link>
	);
}

export default async function AboutPage() {
	const t = await getTranslations("Site.about");
const beliefs = [
	{
		title: t("current.beliefs.openSource.title"),
		description: t("current.beliefs.openSource.body"),
		icon: GitBranch,
	},
	{
		title: t("current.beliefs.fees.title"),
		description: t("current.beliefs.fees.body"),
		icon: Wallet,
	},
	{
		title: t("current.beliefs.access.title"),
		description: t("current.beliefs.access.body"),
		icon: Users,
	},
	{
		title: t("current.beliefs.choice.title"),
		description: t("current.beliefs.choice.body"),
		icon: Route,
	},
	{
		title: t("current.beliefs.transparency.title"),
		description: t("current.beliefs.transparency.body"),
		icon: ShieldCheck,
	},
	{
		title: t("current.beliefs.revenue.title"),
		description: t("current.beliefs.revenue.body"),
		icon: Scale,
	},
] as const;

const forYou = {
	title: t("current.forYou.title"),
	description: t("current.forYou.body"),
	icon: Heart,
} as const;
const ForYouIcon = forYou.icon;

const builtFor = [
	{
		title: t("current.audiences.people.title"),
		description: t("current.audiences.people.body"),
		icon: Users,
	},
	{
		title: t("current.audiences.developers.title"),
		description: t("current.audiences.developers.body"),
		icon: Route,
	},
	{
		title: t("current.audiences.providers.title"),
		description: t("current.audiences.providers.body"),
		icon: Handshake,
	},
] as const;


	return (
		<main className="relative min-h-screen overflow-hidden">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<section className="space-y-7">
					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						{t("current.hero.title")}</h1>
					<p className="max-w-none text-base leading-7 text-muted-foreground">
						{t("current.hero.body")}</p>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
						<TextLink href="/mission" label={t("current.missionLink")} />
						<TextLink href="/models" label={t("current.catalogLink")} />
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
					<SectionTitle
						title={t("current.who.title")}
						description={t("current.who.intro")}
					/>
					<div className="space-y-4 border-l border-zinc-200/80 pl-6 text-sm leading-7 text-muted-foreground dark:border-zinc-800/80">
						<p>
							{t("current.who.project")}</p>
						<p>
							{t("current.who.goal")}</p>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title={t("current.beliefsTitle")}
						description={t("current.beliefsIntro")}
					/>
					<div className="grid gap-x-8 gap-y-7 md:grid-cols-2">
						{beliefs.map((belief) => {
							const Icon = belief.icon;
							return (
								<div
									key={belief.title}
									className="flex gap-4"
								>
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
										<Icon className="h-4 w-4 text-foreground" aria-hidden="true" />
									</div>
									<div className="space-y-1">
										<h3 className="text-base font-semibold text-foreground">{belief.title}</h3>
										<p className="text-sm leading-6 text-muted-foreground">{belief.description}</p>
									</div>
								</div>
							);
						})}
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-8 lg:grid-cols-[1fr_0.86fr] lg:items-start">
					<div className="space-y-6">
						<SectionTitle
							title={t("current.gateway.title")}
							description={t("current.gateway.intro")}
						/>
						<div className="space-y-4 text-sm leading-7 text-muted-foreground">
							<p>
								{t("current.gateway.fragmentation")}</p>
							<p>
								{t("current.gateway.role")}</p>
						</div>
					</div>
					<blockquote className="border-l border-emerald-500/50 pl-6 dark:border-emerald-400/50">
						<p className="text-xl font-medium leading-8 tracking-tight text-foreground sm:text-2xl">
							{t("current.gateway.quote")}</p>
						<footer className="mt-4 text-sm leading-6 text-muted-foreground">
							{t("current.gateway.community")}</footer>
					</blockquote>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
					<SectionTitle
						title={t("current.inspiration.title")}
						description={t("current.inspiration.intro")}
					/>
					<div className="space-y-4 text-sm leading-7 text-muted-foreground">
						<p>
							{t("current.inspiration.openai")}</p>
						<p>
							{t("current.inspiration.benefit")}</p>
						<p>
							{t("current.inspiration.independence")}</p>
						<p>
							{t("current.inspiration.economics")}</p>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="space-y-7">
					<SectionTitle
						title={t("current.community.title")}
						description={t("current.community.body")}
					/>
					<div className="space-y-8">
						<div className="w-full">
							<div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:gap-12">
								<div className="space-y-3">
									<ForYouIcon className="h-7 w-7 text-primary" aria-hidden="true" />
									<h3 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{forYou.title}</h3>
								</div>
								<p className="max-w-none text-base leading-8 text-muted-foreground">{forYou.description}</p>
							</div>
						</div>
						<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
						<div className="grid gap-8 lg:grid-cols-3">
							{builtFor.map((item) => {
								const Icon = item.icon;
								return (
									<div key={item.title} className="space-y-3">
										<Icon className="h-5 w-5 text-primary" aria-hidden="true" />
										<h3 className="text-base font-semibold text-foreground">{item.title}</h3>
										<p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
									</div>
								);
							})}
						</div>
					</div>
				</section>

				<div className="my-10 sm:my-12">
					<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>

				<section className="py-8">
					<div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="space-y-2">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t("current.cta.title")}</h2>
							<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
								{t("current.cta.body")}</p>
						</div>
						<div className="flex flex-wrap items-center gap-3 lg:justify-end">
							<Button asChild size="lg">
								<Link href="/sign-up">
									{t("current.cta.start")}<ArrowRight className="size-4" aria-hidden="true" />
								</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link href="/mission">{t("current.missionLink")}</Link>
							</Button>
							<Button asChild className="px-1 text-foreground hover:text-foreground/70 dark:text-white dark:hover:text-white/70" size="lg" variant="link">
								<Link href="/contact">
									{t("current.cta.contact")}<ArrowRight className="size-4" aria-hidden="true" />
								</Link>
							</Button>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
