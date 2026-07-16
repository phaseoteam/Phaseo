export function canManagePasskeys(args: {
	isAdmin: boolean;
	rolloutEnabled: boolean;
}): boolean {
	return args.isAdmin && args.rolloutEnabled;
}
