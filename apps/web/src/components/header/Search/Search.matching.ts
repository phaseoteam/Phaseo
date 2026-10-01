type TypoMatchIndex = {
	searchTokens: string[];
};

function isOneEditAway(query: string, candidate: string): boolean {
	if (query === candidate || Math.abs(query.length - candidate.length) > 1) return false;
	if (Math.min(query.length, candidate.length) < 3) return false;

	let queryIndex = 0;
	let candidateIndex = 0;
	let edits = 0;

	while (queryIndex < query.length && candidateIndex < candidate.length) {
		if (query[queryIndex] === candidate[candidateIndex]) {
			queryIndex++;
			candidateIndex++;
			continue;
		}

		if (
			query.length === candidate.length &&
			query[queryIndex] === candidate[candidateIndex + 1] &&
			query[queryIndex + 1] === candidate[candidateIndex] &&
			query.slice(queryIndex + 2) === candidate.slice(candidateIndex + 2)
		) {
			return true;
		}
		if (Math.min(query.length, candidate.length) < 4) return false;

		edits++;
		if (edits > 1) return false;

		if (query.length > candidate.length) queryIndex++;
		else if (candidate.length > query.length) candidateIndex++;
		else {
			queryIndex++;
			candidateIndex++;
		}
	}

	if (queryIndex < query.length || candidateIndex < candidate.length) edits++;
	return edits === 1;
}

export function getTypoMatchScore(
	indexedItem: TypoMatchIndex,
	normalizedTerm: string,
): number {
	const queryTokens = normalizedTerm.split(" ").filter(Boolean);
	if (queryTokens.length === 0 || queryTokens.length > 4) return 0;

	let typoCount = 0;
	for (const queryToken of queryTokens) {
		if (indexedItem.searchTokens.includes(queryToken)) continue;
		if (!indexedItem.searchTokens.some((candidate) => isOneEditAway(queryToken, candidate))) {
			return 0;
		}
		typoCount++;
	}

	return typoCount > 0 ? 250 - typoCount * 10 : 0;
}
