export const CATALOGUE_ROUTE_ROOTS = [
	"/models",
	"/api-providers",
	"/countries",
	"/organisations",
	"/benchmarks",
	"/families",
	"/subscription-plans",
	"/apps",
] as const;

export const PUBLIC_DATA_ROUTE_ROOTS = [
	...CATALOGUE_ROUTE_ROOTS,
	"/collections",
	"/compare",
	"/performance",
	"/pricing",
] as const;

export function isPublicDataPathname(pathname: string | null | undefined) {
	if (!pathname) return false;

	return PUBLIC_DATA_ROUTE_ROOTS.some(
		(root) => pathname === root || pathname.startsWith(`${root}/`),
	);
}
