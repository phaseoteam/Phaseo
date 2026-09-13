type RankedSearchCategory = {
	score: number;
};

export function compareSearchCategories(
	left: RankedSearchCategory,
	right: RankedSearchCategory,
): number {
	return right.score - left.score;
}

export function searchContextScore(pathname: string, href?: string): number {
	if (!href || !href.startsWith("/") || pathname === "/") return 0;
	const current = pathname.split("/").filter(Boolean);
	const target = href.split(/[?#]/)[0].split("/").filter(Boolean);
	let shared = 0;
	while (shared < current.length && current[shared] === target[shared]) shared++;
	return Math.min(shared, 4) * 10;
}
