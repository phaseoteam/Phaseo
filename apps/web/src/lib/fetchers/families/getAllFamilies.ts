import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type FamilyCard = {
	family_id: string;
	family_name: string;
	organisation_id: string;
};

export async function getAllFamilies(): Promise<FamilyCard[]> {
	const supabase = createAdminClient();

	const { data, error } = await supabase
		.from("data_model_families")
		.select("family_id, family_name, organisation_id")
		.order("family_name", { ascending: true });

	if (error) {
		throw error;
	}

	if (!data || !Array.isArray(data)) return [];

	return data
		.map((row: any) => ({
			family_id: row.family_id,
			family_name: row.family_name ?? row.family_id,
			organisation_id:
				row.organisation_id ??
				(typeof row.family_id === "string"
					? row.family_id.split("/")[0] ?? ""
					: ""),
		}))
		.filter((family) => family.family_id);
}

export async function getAllFamiliesCached(): Promise<FamilyCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("data:families");
	cacheTag("frontend:families");

	console.log("[fetch] HIT for families");
	return getAllFamilies();
}
