type ModelCount = { model_id: string; request_count: number };
type ModelProviderCount = ModelCount & { provider: string };

export function getSessionPrimary(session: {
	model_ids: string[] | null;
	model_counts?: ModelCount[];
	model_provider_counts?: ModelProviderCount[];
}) {
	const ranked = [...(session.model_counts ?? [])].sort(
		(a, b) =>
			b.request_count - a.request_count || a.model_id.localeCompare(b.model_id),
	);
	const primary =
		ranked[0] ??
		(session.model_ids?.length === 1
			? { model_id: session.model_ids[0], request_count: 0 }
			: null);
	const provider = primary
		? ([...(session.model_provider_counts ?? [])]
				.filter((entry) => entry.model_id === primary.model_id)
				.sort(
					(a, b) =>
						b.request_count - a.request_count ||
						a.provider.localeCompare(b.provider),
				)[0]?.provider ?? null)
		: null;
	const models = ranked.length
		? ranked
		: (session.model_ids ?? []).map((model_id) => ({
				model_id,
				request_count: 0,
			}));
	return {
		primary,
		provider,
		other: models.filter((entry) => entry.model_id !== primary?.model_id),
	};
}
