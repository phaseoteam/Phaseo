import {
	Card,
	CardContent,
} from "@/components/ui/card";
import { CircleHelp, Lock, Scale, Unlock } from "lucide-react";
import type { ExtendedModel } from "@/data/types";
import Link from "next/link";

interface LicenseTypeProps {
	selectedModels: ExtendedModel[];
}

function getLicenseDescriptionCard(models: ExtendedModel[]) {
	if (models.length < 2) return null;
	const [first, second] = models;
	const firstNormalized = normalizeLicense(first.license);
	const secondNormalized = normalizeLicense(second.license);
	const firstPhrase =
		firstNormalized.kind === "proprietary"
			? "a proprietary license"
			: firstNormalized.kind === "unknown"
				? "an unknown license"
				: firstNormalized.label;
	const secondPhrase =
		secondNormalized.kind === "proprietary"
			? "a proprietary license"
			: secondNormalized.kind === "unknown"
				? "an unknown license"
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
								All models are licensed under proprietary
								licenses.
							</span>
							<span className="block text-xs text-muted-foreground mt-1">
								All models have usage restrictions defined by
								their respective organizations.
							</span>
						</>
					) : (
						<>
							<span className="block font-medium">
								<Link
									href={`/models/${encodeURIComponent(
										first.id
									)}`}
									className="group"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
										{first.name}
									</span>
								</Link>{" "}
								is licensed under{" "}
								{firstPhrase}
								, while{" "}
								<Link
									href={`/models/${encodeURIComponent(
										second.id
									)}`}
									className="group"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
										{second.name}
									</span>
								</Link>{" "}
								uses{" "}
								{secondPhrase}
								.
							</span>
							<span className="block text-xs text-muted-foreground mt-1">
								License differences may affect how you can use
								these models in commercial or open-source
								projects.
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

function getLicenseIcon(license: string | null) {
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
					aria-label="Proprietary license"
				/>
			) : isUnknown ? (
				<CircleHelp
					className="h-4 w-4 text-muted-foreground"
					aria-label="Unknown license"
				/>
			) : isOpen ? (
				<Unlock
					className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
					aria-label="Open license"
				/>
			) : (
				<Scale
					className="h-4 w-4 text-amber-700 dark:text-amber-400"
					aria-label="License terms"
				/>
			)}
		</span>
	);
}

export default function LicenseType({ selectedModels }: LicenseTypeProps) {
	if (!selectedModels || selectedModels.length === 0) return null;
	return (
		<section className="space-y-3">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold">License</h2>
				<p className="text-sm text-muted-foreground">
					Usage and distribution terms.
				</p>
			</header>

			<div className="space-y-4">
				{getLicenseDescriptionCard(selectedModels)}
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-2 w-full">
					{selectedModels.map((model) => (
						<Card
							key={model.id}
							className="flex flex-col items-start p-6 border-none shadow-lg min-w-0"
						>
							<div className="flex items-center mb-2">
								{getLicenseIcon(model.license)}
								<span className="font-semibold ml-2 text-base">
									<Link
										href={`/models/${encodeURIComponent(
											model.id
										)}`}
										className="group"
									>
										<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
											{model.name}
										</span>
									</Link>
								</span>
							</div>
							<span className="text-sm text-muted-foreground">
								{normalizeLicense(model.license).label}
							</span>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}
