import { cacheLife, cacheTag } from "next/cache";
import getModelOverviewHeader from "./getModelOverviewHeader";
import getFamilyModels, { FamilyModelItem, getFamilyModelsCached } from "./getFamilyModels";

async function fetchFamilyMembers(
	modelId: string,
	includeHidden: boolean
): Promise<FamilyModelItem[]> {
	const header = await getModelOverviewHeader(modelId, includeHidden);
	const familyId = header?.family_id;
	if (!familyId) {
		return [];
	}

	// Prefer cached family fetch to avoid extra DB hits.
	const family = await getFamilyModelsCached(familyId, includeHidden);
	if (!family || !Array.isArray(family.models)) {
		return [];
	}

	return family.models;
}

/**
 * Cached family members by model id.
 */
export async function getModelFamilyMembersCached(
	modelId: string,
	includeHidden: boolean
): Promise<FamilyModelItem[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:models");

	return fetchFamilyMembers(modelId, includeHidden);
}

export default fetchFamilyMembers;
