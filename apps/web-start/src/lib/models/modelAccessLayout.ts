export function getModelAccessLayout({
	hasSubscriptions,
	hasApiProviders,
	isPrivateModel = false,
	status,
	hasProviderPreviews = false,
}: {
	hasSubscriptions: boolean | null;
	hasApiProviders: boolean;
	isPrivateModel?: boolean;
	status?: string | null;
	hasProviderPreviews?: boolean;
}) {
	const subscriptionOnly = hasSubscriptions === true && !hasApiProviders && !isPrivateModel;
	return {
		subscriptionOnly,
		canUseApi: isPrivateModel || hasApiProviders || hasSubscriptions === false,
		showProviders: !subscriptionOnly && (hasApiProviders || status === "Announced" || hasProviderPreviews),
	};
}
