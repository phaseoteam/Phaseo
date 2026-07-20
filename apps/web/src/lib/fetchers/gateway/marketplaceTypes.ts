export type MarketplacePreset = {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
	source_preset_id: string | null;
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
	sourcePreset: MarketplacePresetLink | null;
};
