import type { Metadata } from "next";
import Link from "next/link";
import {
	ArrowRight,
	ArrowUpRight,
	Check,
	Code2,
	Heart,
	Search,
	Scale,
	Sparkles,
} from "lucide-react";

import { OrbSpecimen } from "@/components/acknowledgements/orbSpecimen";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: PublicLocale }> }): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Content.acknowledgements" });
	return buildMetadata({ title: t("title"), description: t("description"), path: "/acknowledgements", keywords: ["Phaseo acknowledgements", "Phaseo open source"] });
}

type Acknowledgement = {
	id: string;
	name: string;
	href: string;
	note?: string;
	demo?: "orbs" | "primitives" | "streaming" | "icons";
};

const groups: Array<{
	id: string;
	items: Acknowledgement[];
}> = [
	{
		id: "interface",
		items: [
			{
				id: "react",
				name: "React",
				href: "https://react.dev/",
			},
			{
				id: "nextjs",
				name: "Next.js",
				href: "https://nextjs.org/",
			},
			{
				id: "tailwind",
				name: "Tailwind CSS",
				href: "https://tailwindcss.com/",
			},
			{
				id: "baseUi",
				name: "shadcn/ui & Base UI",
				href: "https://ui.shadcn.com/",
				demo: "primitives",
			},
			{
				id: "lucide",
				name: "Lucide",
				href: "https://lucide.dev/",
				demo: "icons",
			},
			{
				id: "thinkingOrbs",
				name: "Thinking Orbs",
				href: "https://orbs.jakubantalik.com/",
				note: "createdBy",
				demo: "orbs",
			},
		],
	},
	{
		id: "aiExperience",
		items: [
			{
				id: "streamdown",
				name: "Streamdown",
				href: "https://streamdown.ai/",
				demo: "streaming",
			},
			{
				id: "shiki",
				name: "Shiki",
				href: "https://shiki.style/",
			},
		],
	},
	{
		id: "platform",
		items: [
			{
				id: "cloudflare",
				name: "Cloudflare",
				href: "https://www.cloudflare.com/",
			},
			{
				id: "supabase",
				name: "Supabase",
				href: "https://supabase.com/",
			},
			{
				id: "vercel",
				name: "Vercel",
				href: "https://vercel.com/",
			},
			{
				id: "hono",
				name: "Hono",
				href: "https://hono.dev/",
			},
			{
				id: "stripe",
				name: "Stripe",
				href: "https://stripe.com/",
			},
		],
	},
	{
		id: "productIntelligence",
		items: [
			{
				id: "posthog",
				name: "PostHog",
				href: "https://posthog.com/",
			},
			{
				id: "statsig",
				name: "Statsig",
				href: "https://www.statsig.com/",
			},
		],
	},
];

type AcknowledgementsTranslate = (key: string, values?: Record<string, string | number>) => string;

function Demo({ type, translate }: { type: NonNullable<Acknowledgement["demo"]>; translate: AcknowledgementsTranslate }) {
	if (type === "orbs") return <OrbSpecimen />;
	if (type === "primitives") {
		return (
			<div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
				<Button size="sm">{translate("continue")}</Button>
				<Button size="sm" variant="outline">{translate("review")}</Button>
				<Button size="icon-sm" variant="ghost" aria-label={translate("searchExample")}><Search /></Button>
				<span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
					<Check className="h-3 w-3" /> {translate("accessibleStates")}
				</span>
			</div>
		);
	}
	if (type === "icons") {
		return (
			<div className="flex items-center gap-5 rounded-xl border border-zinc-200/80 bg-zinc-50 px-5 py-4 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
			<Search className="h-5 w-5" aria-hidden="true" />
			<Sparkles className="h-5 w-5" aria-hidden="true" />
			<Code2 className="h-5 w-5" aria-hidden="true" />
			<ArrowRight className="h-5 w-5" aria-hidden="true" />
			</div>
		);
	}
	return (
		<div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-950 p-4 font-mono text-xs leading-6 dark:border-zinc-800">
			<p className="text-zinc-500">{translate("streamingResponse")}</p>
			<p className="text-zinc-100"><span className="text-emerald-400">##</span> {translate("reliableGateway")}</p>
			<p className="text-zinc-300">{translate("routeByHealthPriceCapability")}<span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-zinc-400 align-middle" /></p>
		</div>
	);
}

function AcknowledgementRow({ item, howUsed, translate }: { item: Acknowledgement; howUsed: string; translate: AcknowledgementsTranslate }) {
	return (
		<li className="group grid gap-4 py-7 sm:grid-cols-[minmax(10rem,0.36fr)_minmax(0,1fr)] sm:items-start sm:gap-8">
			<div>
				<Link
					href={item.href}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline"
				>
					{item.name}
					<ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
				</Link>
				{item.note ? (
					<p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{translate(item.note, { name: "Jakub Antalík" })}</p>
				) : null}
			</div>
			<div className="max-w-3xl space-y-3">
				<p className="text-sm leading-6 text-foreground/85">{translate(`items.${item.id}.description`)}</p>
				<p className="text-sm leading-6 text-muted-foreground">
					<span className="font-medium text-foreground">{howUsed}</span>{" "}{translate(`items.${item.id}.usedFor`)}
				</p>
				{item.demo ? <div className="pt-2"><Demo type={item.demo} translate={translate} /></div> : null}
			</div>
		</li>
	);
}

export default async function AcknowledgementsPage({ params }: { params: Promise<{ locale: PublicLocale }> }) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Content.acknowledgements" });
	const translate = t as unknown as AcknowledgementsTranslate;
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
			<header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
				<div className="space-y-5">
					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						{t("heading")}
					</h1>
					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						{t("intro")}
					</p>
				</div>
				<div className="border-l border-zinc-200 pl-5 text-sm leading-6 text-muted-foreground dark:border-zinc-800">
					<Heart className="mb-3 h-5 w-5 text-foreground" />
					{t("thanks")}
				</div>
			</header>

			<Separator className="my-10 bg-zinc-200/70 dark:bg-zinc-800/70" />

			<div className="space-y-10">
				{groups.map((group) => (
					<section key={group.id} aria-labelledby={`group-${group.id}`}>
						<div className="grid gap-2 border-b border-zinc-200/80 pb-4 dark:border-zinc-800 sm:grid-cols-[minmax(10rem,0.36fr)_minmax(0,1fr)] sm:gap-8">
							<h2 id={`group-${group.id}`} className="text-lg font-semibold text-foreground">
								{translate(`groups.${group.id}.label`)}
							</h2>
							<p className="max-w-2xl text-sm leading-6 text-muted-foreground">{translate(`groups.${group.id}.description`)}</p>
						</div>
						<ul className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
							{group.items.map((item) => (
								<AcknowledgementRow key={item.id} item={item} howUsed={t("howUsed")} translate={translate} />
							))}
						</ul>
					</section>
				))}
			</div>

			<div className="mt-12 flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50 p-5 text-sm leading-6 text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/40">
				<Scale className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
				<p>
					{t("disclaimer")}
				</p>
			</div>
		</div>
	);
}
