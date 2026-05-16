import type {
	ResidencyMode,
	ZeroDataRetentionMode,
} from "@/lib/providers/providerResidency";

export type ResidencyBadge = {
	key: string;
	label: string;
};

const REGION_DISPLAY: Record<string, { label: string }> = {
	global: { label: "Global" },
	us: { label: "US" },
	eu: { label: "EU" },
	uk: { label: "UK" },
	gb: { label: "UK" },
};

export function formatResidencyRegion(region: string): string {
	const normalized = region.trim().toLowerCase();
	const mapped = REGION_DISPLAY[normalized];
	return mapped?.label ?? normalized.toUpperCase();
}

export function formatResidencyRegionCode(region: string): string {
	return formatResidencyRegion(region);
}

export function formatResidencyRegionList(regions: string[]): string {
	return regions.map(formatResidencyRegionCode).join(", ");
}

export function formatResidencyMode(mode: ResidencyMode | "mixed"): string {
	switch (mode) {
		case "provider_managed":
			return "Provider managed";
		case "customer_selectable":
			return "Customer selectable";
		case "account_selected":
			return "Account selected";
		case "mixed":
			return "Varies by mapping";
		default:
			return "Unknown";
	}
}

export function formatZeroDataRetention(
	mode: ZeroDataRetentionMode | "mixed"
): string {
	switch (mode) {
		case "default":
			return "Enabled by default";
		case "optional":
			return "Available as an option";
		case "unsupported":
			return "Not supported";
		case "mixed":
			return "Varies by mapping";
		default:
			return "Unknown";
	}
}

export function buildResidencyBadges(args: {
	executionRegions: string[];
	dataRegions: string[];
	zeroDataRetention: ZeroDataRetentionMode | "mixed" | null;
	maxBadges?: number;
}): ResidencyBadge[] {
	const maxBadges = Math.max(1, args.maxBadges ?? 4);
	const badges: ResidencyBadge[] = [];

	if (args.executionRegions.length > 0) {
		const executionLabel =
			args.executionRegions.length === 1
				? `Exec ${formatResidencyRegionCode(args.executionRegions[0])}`
				: `Exec ${args.executionRegions
						.map(formatResidencyRegionCode)
						.join("/")}`;
		badges.push({
			key: `execution-${args.executionRegions.join("-")}`,
			label: executionLabel,
		});
	}

	if (args.dataRegions.length > 0) {
		const dataLabel =
			args.dataRegions.length === 1
				? `Data ${formatResidencyRegionCode(args.dataRegions[0])}`
				: `Data ${args.dataRegions.map(formatResidencyRegionCode).join("/")}`;
		badges.push({
			key: `data-${args.dataRegions.join("-")}`,
			label: dataLabel,
		});
	}

	if (args.zeroDataRetention === "default") {
		badges.push({ key: "zdr-default", label: "ZDR Default" });
	} else if (args.zeroDataRetention === "optional") {
		badges.push({ key: "zdr-optional", label: "ZDR Option" });
	}

	return badges.slice(0, maxBadges);
}
