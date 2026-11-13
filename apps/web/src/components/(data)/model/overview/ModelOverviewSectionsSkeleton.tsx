import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "@/i18n/react";

// Kept apart from ModelOverviewSections so the route's loading state does not pull in the whole page.
export function Section({
	id,
	children,
	showDivider = true,
}: {
	id: string;
	children: ReactNode;
	showDivider?: boolean;
}) {
	return (
		<section
			id={id}
			className={`scroll-mt-28 space-y-4 ${showDivider ? "border-t border-border/60 pt-6" : ""}`}
		>
			{children}
		</section>
	);
}

export const MODEL_SECTION_STACK_CLASSNAME =
	"space-y-10 [&>section:first-of-type]:border-t-0 [&>section:first-of-type]:pt-0";

export function SectionHeader({
	title,
	description,
}: {
	title: string;
	description?: string;
}) {
	return (
		<div className={description ? "space-y-1" : undefined}>
			<h2 className="text-xl font-semibold tracking-tight">{title}</h2>
			{description ? (
				<p className="text-sm text-muted-foreground">{description}</p>
			) : null}
		</div>
	);
}

export function ProvidersSectionSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<Skeleton className="h-8 w-32 rounded-md" />
			</div>
			<div className="overflow-hidden rounded-sm border border-border/70 bg-background">
				<div className="grid min-w-[780px] grid-cols-[27%_12%_12%_11%_11%_13%_1fr] border-b px-3 py-3">
					{["Provider", "Input", "Output", "Latency", "Throughput", "Uptime"].map((label) => (
						<div key={label} className="px-2">
							<Skeleton className="h-3 w-2/3" />
						</div>
					))}
				</div>
				{Array.from({ length: 4 }).map((_, rowIndex) => (
					<div
						key={rowIndex}
						className="grid min-w-[780px] grid-cols-[27%_12%_12%_11%_11%_13%_1fr] items-center border-b px-3 py-3 last:border-b-0"
					>
						<div className="flex items-center gap-3 px-2">
							<Skeleton className="h-8 w-8 rounded-md" />
							<Skeleton className="h-4 w-28" />
						</div>
						<Skeleton className="mx-2 h-4 w-12 justify-self-end" />
						<Skeleton className="mx-2 h-4 w-12 justify-self-end" />
						<Skeleton className="mx-2 h-4 w-12 justify-self-end" />
						<Skeleton className="mx-2 h-4 w-16 justify-self-end" />
						<div className="mx-2 flex items-center justify-end gap-2">
							<Skeleton className="h-4 w-12" />
							<Skeleton className="h-5 w-12" />
						</div>
						<Skeleton className="h-4 w-4 justify-self-end" />
					</div>
				))}
			</div>
		</div>
	);
}

export function BenchmarksSectionSkeleton() {
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{Array.from({ length: 3 }).map((_, index) => (
				<div key={index} className="space-y-3 rounded-md border border-border/70 p-4">
					<Skeleton className="h-5 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			))}
		</div>
	);
}

export function AboutSectionSkeleton() {
	return (
		<div className="space-y-5">
			<div className="grid gap-2 sm:grid-cols-3">
				<Skeleton className="h-16 w-full rounded-md" />
				<Skeleton className="h-16 w-full rounded-md" />
				<Skeleton className="h-16 w-full rounded-md" />
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				<Skeleton className="h-24 w-full rounded-md" />
				<Skeleton className="h-24 w-full rounded-md" />
			</div>
		</div>
	);
}

export function PerformanceSectionSkeleton() {
	return (
		<div className="space-y-4">
			<div className="grid gap-3 md:grid-cols-3">
				{Array.from({ length: 3 }).map((_, index) => (
					<div key={index} className="rounded-md border border-border/70 p-4">
						<Skeleton className="mb-3 h-3 w-20" />
						<Skeleton className="h-7 w-24" />
					</div>
				))}
			</div>
			<div className="rounded-md border border-border/70 p-4">
				<div className="mb-4 flex items-center justify-between">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-7 w-28 rounded-md" />
				</div>
				<Skeleton className="h-56 w-full rounded-sm" />
			</div>
		</div>
	);
}

export function PricingSectionSkeleton() {
	return (
		<div className="space-y-6">
			<div className="overflow-hidden rounded-md border border-border/70">
				{Array.from({ length: 4 }).map((_, index) => (
					<div key={index} className="grid grid-cols-4 gap-3 border-b p-3 last:border-b-0">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-4 w-16 justify-self-end" />
						<Skeleton className="h-4 w-16 justify-self-end" />
						<Skeleton className="h-4 w-16 justify-self-end" />
					</div>
				))}
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<Skeleton className="h-56 w-full rounded-md" />
				<Skeleton className="h-56 w-full rounded-md" />
			</div>
		</div>
	);
}

export function ActivitySectionSkeleton() {
	return (
		<div className="space-y-3">
			<div className="flex justify-end">
				<Skeleton className="h-9 w-32 rounded-md" />
			</div>
			<div className="rounded-md border border-border/70 p-4">
				<Skeleton className="h-64 w-full rounded-sm" />
			</div>
		</div>
	);
}

export function AppsSectionSkeleton() {
	return (
		<div className="grid gap-3 md:grid-cols-2">
			{Array.from({ length: 4 }).map((_, index) => (
				<div key={index} className="space-y-3 rounded-md border border-border/70 p-4">
					<Skeleton className="h-4 w-2/5" />
					<Skeleton className="h-3 w-3/5" />
					<div className="flex gap-2">
						<Skeleton className="h-5 w-20 rounded-full" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
				</div>
			))}
		</div>
	);
}

export function UptimeSectionSkeleton() {
	return (
		<div className="rounded-lg border border-border/70 bg-background p-6">
			<Skeleton className="h-5 w-32" />
			<Skeleton className="mt-4 h-[260px] w-full rounded-sm" />
		</div>
	);
}

export function SubscriptionsSectionSkeleton() {
	return (
		<div className="space-y-3">
			{Array.from({ length: 3 }).map((_, index) => (
				<div key={index} className="rounded-md border border-border/70 p-4">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-2">
							<Skeleton className="h-4 w-36" />
							<Skeleton className="h-3 w-64" />
						</div>
						<Skeleton className="h-5 w-20" />
					</div>
				</div>
			))}
		</div>
	);
}

export function ModelCreatorModelsSkeleton() {
	return (
		<Section id="other-models-loading">
			<div className="space-y-1">
				<Skeleton className="h-6 w-72" />
				<Skeleton className="h-4 w-56" />
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<div key={index} className="space-y-3 py-1">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-1/3" />
					</div>
				))}
			</div>
		</Section>
	);
}

export function ModelOverviewSectionsSkeleton() {
	const t = useTranslations("Catalogue.models.detail");
	return (
		<div className={MODEL_SECTION_STACK_CLASSNAME}>
			<Section id="providers">
				<SectionHeader
					title={t("navigation.providers")}
					description={t("sections.providersDescription")}
				/>
				<ProvidersSectionSkeleton />
			</Section>
			<Section id="performance">
				<SectionHeader
					title={t("navigation.performance")}
					description={t("sections.performanceSummaryDescription")}
				/>
				<PerformanceSectionSkeleton />
			</Section>
			<Section id="pricing">
				<SectionHeader
					title={t("navigation.pricing")}
					description={t("sections.pricingContextDescription")}
				/>
				<PricingSectionSkeleton />
			</Section>
			<Section id="benchmarks">
				<SectionHeader title={t("navigation.benchmarks")} />
				<BenchmarksSectionSkeleton />
			</Section>
			<Section id="activity">
				<SectionHeader
					title={t("navigation.activity")}
					description={t("sections.activityDescription")}
				/>
				<ActivitySectionSkeleton />
			</Section>
			<Section id="apps">
				<SectionHeader
						title={t("sections.appsTitle")}
						description={t("sections.appsDescription")}
				/>
				<AppsSectionSkeleton />
			</Section>
			<Section id="uptime">
				<SectionHeader
						title={t("sections.uptimeTitle")}
						description={t("sections.uptimeDescription")}
				/>
				<UptimeSectionSkeleton />
			</Section>
			<Section id="about">
				<SectionHeader
						title={t("navigation.about")}
						description={t("sections.aboutDescription")}
				/>
				<AboutSectionSkeleton />
			</Section>
			<Section id="subscriptions">
				<SectionHeader
						title={t("navigation.subscriptions")}
						description={t("sections.subscriptionsDescription")}
				/>
				<SubscriptionsSectionSkeleton />
			</Section>
		</div>
	);
}
