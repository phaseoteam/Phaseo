import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import type { FamilyCard } from "@/lib/fetchers/families/types";
import {
	addFamilyRecencyFallbacks,
	sortFamiliesByRecentAddition,
} from "@/lib/fetchers/families/sortFamilies";
import {
	fetchFrontendFamilies,
	fetchFrontendFamily,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.families");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/families",
		title: t("title"),
		description: t("description"),
		keywords: ["AI model families", "model families", "AI model variants", "AI providers", "Phaseo"],
	});
}

async function FamiliesSection() {
	const t = await getTranslations("Catalogue.families");
	const families = sortFamiliesByRecentAddition(
		await addFamilyRecencyFallbacks(
			(await fetchFrontendFamilies()) as FamilyCard[],
			fetchFrontendFamily,
		),
	);

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{t("title")}</h1>
					<p className="text-sm text-muted-foreground">
						{t("description")}
					</p>
				</div>
				<span className="text-sm text-muted-foreground">
					{t("tracked", { count: families.length })}
				</span>
			</div>

			<div className="overflow-hidden rounded-xl border border-border/70 bg-border/70">
				<div className="grid grid-cols-1 gap-px sm:grid-cols-2 2xl:grid-cols-3">
					{families.map((family) => (
						<Link
							key={family.family_id}
							href={`/families/${family.family_id}`}
							className="group flex min-h-20 items-center gap-3 bg-background px-4 py-3 transition-colors hover:bg-muted/25 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
						>
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
								<div className="relative h-6 w-6">
									{family.organisation_id ? (
										<Logo
											id={family.organisation_id}
											alt=""
											fill
											className="object-contain"
										/>
									) : null}
								</div>
							</div>
							<span className="min-w-0 flex-1 truncate">
								<span className="text-sm font-semibold">
									{family.family_name}
								</span>
								{family.organisation_name ? (
									<span className="ml-1.5 text-xs font-normal text-muted-foreground">
										{t("by", { name: family.organisation_name })}
									</span>
								) : null}
							</span>
							<ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}

function FamiliesFallback() {
	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-2">
					<Skeleton className="h-8 w-56" />
					<Skeleton className="h-5 w-80 max-w-full" />
				</div>
				<Skeleton className="h-5 w-36" />
			</div>
			<div className="overflow-hidden rounded-xl border border-border/70">
				<div className="grid grid-cols-1 gap-px bg-border/70 sm:grid-cols-2 2xl:grid-cols-3">
					{Array.from({ length: 6 }).map((_, index) => (
						<div key={index} className="flex h-20 items-center gap-3 bg-background px-4">
							<Skeleton className="h-10 w-10 rounded-lg" />
							<Skeleton className="h-4 w-32" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export default function FamiliesPage() {
	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<Suspense fallback={<FamiliesFallback />}>
					<FamiliesSection />
				</Suspense>
			</div>
		</main>
	);
}
