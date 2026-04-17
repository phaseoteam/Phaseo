import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

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

export async function getPublicMarketplacePresetsCached(): Promise<MarketplacePreset[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("data:presets");
	cacheTag("data:presets:public");

	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("presets")
		.select("id, name, description, created_at, source_preset_id")
		.eq("visibility", "public")
		.order("created_at", { ascending: false });

	if (error) {
		console.error("[marketplace] failed to load public presets", error);
		return [];
	}

	return (data ?? []) as MarketplacePreset[];
}

export async function getPublicMarketplacePresetDetailCached(
	presetId: string,
): Promise<MarketplacePresetDetail | null> {
	"use cache";

	const normalizedId = String(presetId ?? "").trim();
	if (!normalizedId) return null;

	cacheLife("hours");
	cacheTag("data:presets");
	cacheTag("data:presets:public");
	cacheTag(`data:presets:${normalizedId}`);

	const supabase = createAdminClient();
	const { data: preset, error: presetError } = await supabase
		.from("presets")
		.select("id, name, description, config, visibility, created_at, source_preset_id")
		.eq("id", normalizedId)
		.maybeSingle();

	if (presetError) {
		console.error("[marketplace] failed to load preset detail", presetError);
		return null;
	}
	if (!preset || preset.visibility !== "public") {
		return null;
	}

	let sourcePreset: MarketplacePresetLink | null = null;
	if (preset.source_preset_id) {
		const { data: sourceData, error: sourceError } = await supabase
			.from("presets")
			.select("id, name")
			.eq("id", preset.source_preset_id)
			.maybeSingle();
		if (!sourceError && sourceData) {
			sourcePreset = sourceData as MarketplacePresetLink;
			cacheTag(`data:presets:${sourceData.id}`);
		}
	}

	return {
		preset: preset as MarketplacePresetDetail["preset"],
		sourcePreset,
	};
}
