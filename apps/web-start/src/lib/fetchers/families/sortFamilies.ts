import type {
	FamilyCard,
	FamilyInfo,
} from "@/lib/fetchers/families/types";

function getCreatedAtTimestamp(family: FamilyCard) {
	const value = family.created_at ?? family.recent_activity_at;
	if (!value) return 0;
	const timestamp = new Date(value).getTime();
	return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getLatestMemberDate(family: FamilyInfo | null) {
	let latestTimestamp = 0;
	let latestDate: string | null = null;
	for (const member of family?.models ?? []) {
		const value = member.release_date ?? member.announcement_date;
		if (!value) continue;
		const timestamp = new Date(value).getTime();
		if (!Number.isNaN(timestamp) && timestamp > latestTimestamp) {
			latestTimestamp = timestamp;
			latestDate = value;
		}
	}
	return latestDate;
}

export async function addFamilyRecencyFallbacks(
	families: FamilyCard[],
	fetchFamily: (familyId: string) => Promise<FamilyInfo | null>,
) {
	return Promise.all(
		families.map(async (family) => {
			if (family.created_at) return family;
			try {
				const detail = await fetchFamily(family.family_id);
				return {
					...family,
					recent_activity_at: getLatestMemberDate(detail),
				};
			} catch {
				return family;
			}
		}),
	);
}

export function sortFamiliesByRecentAddition(families: FamilyCard[]) {
	return families.toSorted((left, right) => {
		const timestampDifference =
			getCreatedAtTimestamp(right) - getCreatedAtTimestamp(left);
		if (timestampDifference !== 0) return timestampDifference;
		return left.family_name.localeCompare(right.family_name);
	});
}
