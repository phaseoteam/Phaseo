"use client";

import {
	Card,
	CardContent,
} from "@/components/ui/card";
import { CircleHelp, Lock, Scale, Unlock } from "lucide-react";
import type { ExtendedModel } from "@/data/types";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface LicenseTypeProps {
	selectedModels: ExtendedModel[];
}

type CompareTranslator = ReturnType<typeof useTranslations<"Catalogue.compare">>;

function getLicenseDescriptionCard(models: ExtendedModel[], t: CompareTranslator) {
	if (models.length < 2) return null;
	const [first, second] = models;
	const firstNormalized = normalizeLicense(first.license);
	const secondNormalized = normalizeLicense(second.license);
	const firstPhrase =
		firstNormalized.kind === "proprietary"
			? t("proprietaryLicense")
			: firstNormalized.kind === "unknown"
				? t("unknownLicense")
				: firstNormalized.label;
	const secondPhrase =
		secondNormalized.kind === "proprietary"
			? t("proprietaryLicense")
			: secondNormalized.kind === "unknown"
				? t("unknownLicense")
				: secondNormalized.label;

	// Check if all models have proprietary licenses
	const allProprietary = models.every(
		(model) => model.license?.toLowerCase() === "proprietary"
	);

	return (
		<Card className="mb-4 border border-border/60 bg-background/60 shadow-none">
			<Card className="flex items-center gap-2 p-4 border-none bg-transparent">
				<span className="relative flex h-4 w-4 items-center justify-center mr-4 shrink-0">
					<span className="absolute h-6 w-6 rounded-full bg-emerald-400/20" />
					<Scale className="relative h-full w-full text-emerald-700 dark:text-emerald-400" />
				</span>
				<div className="text-sm">
					{allProprietary ? (
						<>
							<span className="block font-medium">
								{t("allModelsProprietary")}
							</span>
							<span className="block text-xs text-muted-foreground mt-1">
								{t("allModelsHaveRestrictions")}
							</span>
						</>
					) : (
						<>
							<span className="block font-medium">
								{t.rich("licenseComparison", {
									first: (chunks) => (
										<Link href={`/models/${first.id}`} className="group">
											<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200 font-semibold">{chunks}</span>
										</Link>
									),
									firstLicense: firstPhrase,
									second: (chunks) => (
										<Link href={`/models/${second.id}`} className="group">
											<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200 font-semibold">{chunks}</span>
										</Link>
									),
									secondLicense: secondPhrase,
								})}
							</span>
							<span className="block text-xs text-muted-foreground mt-1">
								{t("licenseImpact")}
							</span>
						</>
					)}
				</div>
			</Card>
		</Card>
	);
}

type LicenseKind = "unknown" | "proprietary" | "open" | "custom";

function normalizeLicense(license: string | null | undefined): {
	kind: LicenseKind;
	label: string;
} {
	const raw = typeof license === "string" ? license.trim() : "";
	const lower = raw.toLowerCase();

	const isUnknown =
		!raw ||
		lower === "unknown" ||
		lower === "n/a" ||
		lower === "na" ||
		lower === "-" ||
		lower === "tbd";
	if (isUnknown) return { kind: "unknown", label: "Unknown" };

	if (lower.includes("proprietary")) {
		return { kind: "proprietary", label: "Proprietary" };
	}

	const openKeywords = [
		"mit",
		"apache",
		"bsd",
		"mpl",
		"epl",
		"gpl",
		"lgpl",
		"agpl",
		"cc-by",
		"creative commons",
		"unlicense",
		"isc",
		"zlib",
	];
	if (openKeywords.some((k) => lower.includes(k))) {
		// Keep the raw string, but normalize a few common one-word cases.
		if (lower === "mit") return { kind: "open", label: "MIT" };
		return { kind: "open", label: raw };
	}

	return { kind: "custom", label: raw };
}

function formatLicenseDisplay(license: string | null | undefined, t: CompareTranslator): string {
	const normalized = normalizeLicense(license);
	if (normalized.kind === "unknown") return t("unknownLicense");
	if (normalized.kind === "proprietary") return t("proprietaryLicense");
	return normalized.label;
}

function getLicenseIcon(license: string | null, t: CompareTranslator) {
	const normalized = normalizeLicense(license);
	const isProprietary = normalized.kind === "proprietary";
	const isOpen = normalized.kind === "open";
	const isUnknown = normalized.kind === "unknown";
	return (
		<span
			className={`rounded-md p-1 flex items-center justify-center ${
				isProprietary
					? "bg-amber-500/10"
					: isOpen
						? "bg-emerald-500/10"
						: isUnknown
							? "bg-muted"
							: "bg-amber-500/10"
			}`}
		>
			{isProprietary ? (
				<Lock
					className="h-4 w-4 text-amber-700 dark:text-amber-400"
					aria-label={t("proprietaryLicense")}
				/>
			) : isUnknown ? (
				<CircleHelp
					className="h-4 w-4 text-muted-foreground"
					aria-label={t("unknownLicense")}
				/>
			) : isOpen ? (
				<Unlock
					className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
					aria-label={t("openLicense")}
				/>
			) : (
				<Scale
					className="h-4 w-4 text-amber-700 dark:text-amber-400"
					aria-label={t("licenseTerms")}
				/>
			)}
		</span>
	);
}

export default function LicenseType({ selectedModels }: LicenseTypeProps) {
	const t = useTranslations("Catalogue.compare");
	if (!selectedModels || selectedModels.length === 0) return null;
	return (
		<section className="space-y-3">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold">{t("license")}</h2>
				<p className="text-sm text-muted-foreground">
					{t("licenseDescription")}
				</p>
			</header>

			<div className="space-y-4">
				{getLicenseDescriptionCard(selectedModels, t)}
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-2 w-full">
					{selectedModels.map((model) => (
						<Card
							key={model.id}
							className="flex flex-col items-start p-6 border-none shadow-lg min-w-0"
						>
							<div className="flex items-center mb-2">
								{getLicenseIcon(model.license, t)}
								<span className="font-semibold ml-2 text-base">
									<Link
										href={`/models/${
											model.id
										}`}
										className="group"
									>
										<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
											{model.name}
										</span>
									</Link>
								</span>
							</div>
							<span className="text-sm text-muted-foreground">
								{formatLicenseDisplay(model.license, t)}
							</span>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}
