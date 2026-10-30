export type MarketplacePreset = {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
	source_preset_id: string | null;
	slug: string;
	forkCount: number;
	descendantCount: number;
	canonicalModel: string;
	publisher: { handle: string; aliases?: string[]; displayName: string };
};

export type MarketplacePresetLink = {
	id: string;
	name: string;
};

export type MarketplacePresetDetail = {
	preset: MarketplacePreset & {
		config: Record<string, unknown> | null;
		visibility: "private" | "team" | "public";
	};
	versions: Array<{ id: string; version_number: number; version_label: string; versioning_method: "sequential" | "semver" | "date"; release_notes: string | null; created_at: string }>;
	sourcePreset: MarketplacePresetLink | null;
};
