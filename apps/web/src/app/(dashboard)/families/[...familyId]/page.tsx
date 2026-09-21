import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	ArrowLeft,
	ArrowRight,
	ArrowUpRight,
	CalendarDays,
	ChevronRight,
	Layers3,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import EntityStickyHeader from "@/components/(data)/EntityStickyHeader";
import ModelPageToc from "@/components/(data)/model/ModelPageToc";
import { Badge } from "@/components/ui/badge";
import type { FamilyModelItem } from "@/lib/fetchers/families/types";
import { fetchFrontendFamily } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { buildMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { DisplayCalendarDate, DisplayNumber } from "@/components/display/DisplayValue";

const STATUS_STYLES: Record<string, string> = {
	Available:
		"border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	Announced: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	Preview: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
	"Limited Access":
		"border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
	Withheld:
		"border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
	Rumoured:
		"border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
	Deprecated:
		"border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
	Retired:
		"border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
	default: "border-border bg-muted/40 text-muted-foreground",
};

function parseFamilyId(input: string[] | string | undefined): string {
	if (!input) return "";
	return Array.isArray(input) ? input.join("/") : input;
}

function getMemberDate(member: FamilyModelItem): Date | null {
	const value = member.release_date ?? member.announcement_date;
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function sortMembers(members: FamilyModelItem[]) {
	return [...members].sort((left, right) => {
		const leftDate = getMemberDate(left);
		const rightDate = getMemberDate(right);
		if (leftDate && rightDate) return rightDate.getTime() - leftDate.getTime();
		if (leftDate) return -1;
		if (rightDate) return 1;
		return left.name.localeCompare(right.name);
	});
}

function getReleaseSpan(members: FamilyModelItem[]) {
	const dates = members
		.map(getMemberDate)
		.filter((date): date is Date => Boolean(date))
		.sort((left, right) => left.getTime() - right.getTime());
	if (!dates.length) return null;

	const first = dates[0];
	const last = dates[dates.length - 1];
	if (!first || !last) return null;
	return { first, last };
}

async function fetchFamily(familyId: string) {
	try {
		return await fetchFrontendFamily(familyId);
	} catch (error) {
		console.warn("[seo] failed to load family metadata", { familyId, error });
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ familyId: string[] }>;
}): Promise<Metadata> {
	const { familyId: rawFamilyId } = await props.params;
	const familyId = parseFamilyId(rawFamilyId);
	const family = await fetchFamily(familyId);
	const path = `/families/${familyId}`;

	if (!family) {
		return buildMetadata({
			title: "AI Model Family",
			description:
				"Explore related AI models within the same family and follow their release history on Phaseo.",
			path,
			keywords: ["AI model family", "AI models", "Phaseo"],
		});
	}

	return buildMetadata({
		title: `${family.family_name} Family - Related AI Models`,
		description: `${family.family_name} family on Phaseo. Explore ${family.models.length} related models and their release history.`,
		path,
		keywords: [
			family.family_name,
			`${family.family_name} family`,
			"AI model family",
			"Phaseo",
		],
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ familyId: string[] }>;
}) {
	const { familyId: rawFamilyId } = await params;
	const familyId = parseFamilyId(rawFamilyId);
	const family = await fetchFrontendFamily(familyId);

	if (!family) notFound();

	const members = sortMembers(family.models ?? []);
	const primaryOrganisationId = members[0]?.organisation_id ?? null;
	const primaryOrganisationName =
		members[0]?.organisation?.name ?? primaryOrganisationId;
	const releaseSpan = getReleaseSpan(members);

	return (
		<main className="min-h-screen">
			<EntityStickyHeader kind="family" id={familyId} name={family.family_name} observeId="family-detail-primary-header" baseHref={`/families/${familyId}`} navigation={[]} />
			<div className="container mx-auto px-4 py-7 md:py-9">
				<Link
					href="/families"
					className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
					All model families
				</Link>

				<header id="family-detail-primary-header" className="mt-7 scroll-mt-36 grid gap-6 border-b border-border/70 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.65fr)] lg:items-center">
					<div className="flex items-start gap-4 md:gap-5">
						<div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background md:size-14">
							{primaryOrganisationId ? (
								<div className="relative size-7 md:size-8">
									<Logo
										id={primaryOrganisationId}
										alt={primaryOrganisationName ?? family.family_name}
										fill
										className="object-contain"
									/>
								</div>
							) : (
								<Layers3 className="size-6 text-muted-foreground" />
							)}
						</div>
						<div>
							<h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
								{family.family_name}
							</h1>
							{primaryOrganisationId ? (
								<Link
									href={`/organisations/${primaryOrganisationId}`}
									className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
								>
									By {primaryOrganisationName}
									<ArrowUpRight className="size-3.5" />
								</Link>
							) : null}
						</div>
					</div>

					<dl className="grid grid-cols-2 border-y border-border/70 lg:border-y-0">
						{[
							{ label: "Models", value: <DisplayNumber value={members.length} /> },
							{
								label: "Release span",
								value: releaseSpan ? (
									<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
										<DisplayCalendarDate value={releaseSpan.first} />
										{releaseSpan.first.getTime() !== releaseSpan.last.getTime() ? (
											<>
												<ArrowRight
													className="size-3.5 shrink-0 text-muted-foreground"
													aria-hidden="true"
												/>
											<DisplayCalendarDate value={releaseSpan.last} />
											</>
										) : null}
									</span>
								) : (
									"Dates pending"
								),
							},
						].map((stat) => (
							<div
								key={stat.label}
								className="border-r border-border/70 px-4 py-4 last:border-r-0"
							>
								<dt className="text-xs font-medium text-muted-foreground">
									{stat.label}
								</dt>
								<dd className="mt-2 text-sm font-semibold text-foreground">
									{stat.value}
								</dd>
							</div>
						))}
					</dl>
				</header>

				<div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
					<ModelPageToc items={[{ id: "family-detail-primary-header", label: "Overview" }, { id: "family-members", label: "Family Members" }]} className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44" />
					<div className="min-w-0 flex-1">
				<section id="family-members" className="scroll-mt-36 py-8 md:py-10" aria-labelledby="family-members-heading">
					<div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<h2
								id="family-members-heading"
								className="text-xl font-semibold tracking-tight md:text-2xl"
							>
								Family members
							</h2>
						</div>
						<p className="text-sm text-muted-foreground">Newest to oldest</p>
					</div>

					{members.length ? (
						<ol className="border-y border-border/70 divide-y divide-border/70">
							{members.map((member, index) => {
								const date = getMemberDate(member);
								const organisationName =
									member.organisation?.name ?? member.organisation_id;
								const statusClass =
									STATUS_STYLES[member.status ?? "default"] ??
									STATUS_STYLES.default;

								return (
									<li key={member.model_id}>
										<Link
											href={`/models/${member.model_id}`}
											className="group grid gap-4 py-4 transition-colors hover:bg-muted/25 sm:grid-cols-[48px_minmax(0,1fr)_160px_135px_20px] sm:items-center sm:px-3 md:py-5"
										>
											<span className="font-mono text-xs text-muted-foreground">
												{String(index + 1).padStart(2, "0")}
											</span>
											<div className="min-w-0">
												<h3 className="text-base font-semibold tracking-tight transition-colors group-hover:text-primary md:text-lg">
													{member.name}
												</h3>
												<p className="mt-0.5 text-sm text-muted-foreground">
													{organisationName}
												</p>
											</div>
											<div className="flex items-center gap-2 text-sm text-muted-foreground">
												<CalendarDays className="size-4" />
												{date ? <DisplayCalendarDate value={date} /> : "Date pending"}
											</div>
											<div>
												<Badge
													variant="outline"
													className={cn("rounded-full", statusClass)}
												>
													{member.status ?? "Status pending"}
												</Badge>
											</div>
											<ChevronRight className="hidden size-5 text-muted-foreground transition-transform group-hover:translate-x-1 sm:block" />
										</Link>
									</li>
								);
							})}
						</ol>
					) : (
						<div className="border-y border-dashed border-border/70 py-14 text-center">
							<Layers3 className="mx-auto size-6 text-muted-foreground" />
							<p className="mt-3 text-sm text-muted-foreground">
								No family members are recorded yet.
							</p>
						</div>
					)}
				</section>
					</div>
				</div>
			</div>
		</main>
	);
}
