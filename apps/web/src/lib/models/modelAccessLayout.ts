export function getModelAccessLayout({
	hasSubscriptions,
	hasApiProviders,
	isPrivateModel = false,
	status,
	hasProviderPreviews = false,
}: {
	hasSubscriptions: boolean;
	hasApiProviders: boolean;
	isPrivateModel?: boolean;
	status?: string | null;
	hasProviderPreviews?: boolean;
}) {
	const subscriptionOnly = hasSubscriptions && !hasApiProviders && !isPrivateModel;
	return {
		subscriptionOnly,
		showProviders: !subscriptionOnly && (hasApiProviders || status === "Announced" || hasProviderPreviews),
	};
}
