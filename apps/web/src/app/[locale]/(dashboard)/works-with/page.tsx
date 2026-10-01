import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import apps from "@/data/works-with-phaseo.json";
import { buildMetadata } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: PublicLocale }> }) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Content.worksWith" });
	return buildMetadata({ title: t("title"), description: t("description"), path: "/works-with", keywords: ["Phaseo integrations", "AI gateway apps", "Phaseo community"] });
}

type WorksWithApp = {
	name: string;
	description: string;
	url: string;
	docs?: string;
	tags: Array<"chat" | "coding" | "productivity" | "creative" | "research" | "other">;
	open_source?: string;
	date_added: string;
	logo?: string;
};

const sortedApps = (apps as WorksWithApp[]).slice().sort((a, b) => {
	return b.date_added.localeCompare(a.date_added);
});

function LogoFallback({ name }: { name: string }) {
	const initials = name
		.split(/[\s-]+/)
		.filter(Boolean)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
	return (
		<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-700">
			{initials || "AI"}
		</div>
	);
}

export default async function WorksWithPage({ params }: { params: Promise<{ locale: PublicLocale }> }) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Content.worksWith" });
	const formatDate = (date: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
	const tagLabels: Record<WorksWithApp["tags"][number], string> = {
		chat: t("tags.chat"), coding: t("tags.coding"), productivity: t("tags.productivity"), creative: t("tags.creative"), research: t("tags.research"), other: t("tags.other"),
	};
	return (
		<section className="container mx-auto flex flex-1 flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
			<div className="space-y-4">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
						{t("title")}
					</h1>
					<Badge variant="outline">{t("community")}</Badge>
				</div>
				<p className="max-w-3xl text-base text-zinc-600 dark:text-zinc-300">
					{t("intro")}
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<Button asChild>
						<Link href="#contributing">{t("submitApp")}</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href="/contribute">{t("contribute")}</Link>
					</Button>
				</div>
			</div>

			{sortedApps.length === 0 ? (
				<Card className="border-dashed">
					<CardHeader>
						<CardTitle>{t("emptyTitle")}</CardTitle>
						<CardDescription>
							{t("emptyDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link href="#contributing">{t("addApp")}</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
					{sortedApps.map((app) => (
						<Card key={`${app.name}-${app.url}`} className="flex h-full flex-col">
							<CardHeader className="space-y-3">
								<div className="flex items-center gap-3">
									{app.logo ? (
										<div className="relative h-12 w-12 overflow-hidden rounded-lg border border-zinc-200 bg-white">
											<Image
												src={app.logo}
												alt={t("appLogoAlt", { app: app.name })}
												fill
												className="object-contain p-1"
												sizes="48px"
											/>
										</div>
									) : (
										<LogoFallback name={app.name} />
									)}
									<div>
										<CardTitle className="text-lg">{app.name}</CardTitle>
										<CardDescription className="text-xs">
											{t("added", { date: formatDate(app.date_added) })}
										</CardDescription>
									</div>
								</div>
								<CardDescription className="text-sm text-zinc-600 dark:text-zinc-300">
									{app.description}
								</CardDescription>
							</CardHeader>
							<CardContent className="mt-auto space-y-4">
								<div className="flex flex-wrap gap-2">
									{app.tags.map((tag) => (
										<Badge key={tag} variant="secondary">
											{tagLabels[tag]}
										</Badge>
									))}
								</div>
								<div className="flex flex-wrap gap-2">
									<Button size="sm" asChild>
										<Link href={app.url} target="_blank" rel="noreferrer">
										{t("visitSite")}
										</Link>
									</Button>
									{app.docs ? (
										<Button size="sm" variant="outline" asChild>
											<Link href={app.docs} target="_blank" rel="noreferrer">
														{t("setupDocs")}
											</Link>
										</Button>
									) : null}
									{app.open_source ? (
										<Button size="sm" variant="ghost" asChild>
											<Link href={app.open_source} target="_blank" rel="noreferrer">
														{t("openSource")}
											</Link>
										</Button>
									) : null}
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<Card id="contributing" className="border-zinc-200/80 bg-white">
				<CardHeader>
					<CardTitle>{t("contributing")}</CardTitle>
					<CardDescription>
						{t("contributingDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6 text-sm text-zinc-700">
					<div className="space-y-3">
						<h3 className="text-base font-semibold text-zinc-900">{t("requirements")}</h3>
						<ul className="list-disc space-y-1 pl-5">
							<li>{t("requirementModelAccess")}</li>
							<li>{t("requirementBringOwnKey")}</li>
							<li>{t("requirementPublicAccess")}</li>
							<li>{t("requirementLogo")}</li>
						</ul>
					</div>

					<div className="space-y-3">
						<h3 className="text-base font-semibold text-zinc-900">{t("howToSubmit")}</h3>
						<ol className="list-decimal space-y-2 pl-5">
							<li>{t("forkRepository")}</li>
							<li>
								{t("addCatalogEntry")} {" "}
								<code className="rounded bg-zinc-100 px-1 py-0.5">packages/data/catalog/src/data/works-with-phaseo.json</code>.
							</li>
							<li>
								{t("addLogo")} {" "}
								<code className="rounded bg-zinc-100 px-1 py-0.5">apps/web/public/works-with-phaseo/&lt;your-app-name&gt;/logo.png</code>.
							</li>
							<li>{t("submitPullRequest")}</li>
						</ol>
					</div>

					<div className="space-y-3">
						<h3 className="text-base font-semibold text-zinc-900">{t("entryFormat")}</h3>
						<pre className="overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800">
{`{
  "name": "Your App Name",
  "description": "A brief description of your app (1-2 sentences, max 300 characters)",
  "url": "https://your-app-url.com",
  "docs": "https://your-app-url.com/docs/phaseo",
  "tags": ["chat"],
  "open_source": "https://github.com/you/your-app",
  "date_added": "2026-01-28",
  "logo": "/works-with-phaseo/your-app-name/logo.png"
}`}
						</pre>
					</div>

					<div className="space-y-2">
						<h3 className="text-base font-semibold text-zinc-900">{t("validTags")}</h3>
						<div className="flex flex-wrap gap-2">
							{Object.entries(tagLabels).map(([tag, label]) => (
								<Badge key={tag} variant="outline">
									{label}
								</Badge>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<h3 className="text-base font-semibold text-zinc-900">{t("questions")}</h3>
						<p>
							{t("questionHelp")}
						</p>
					</div>
				</CardContent>
			</Card>
		</section>
	);
}
