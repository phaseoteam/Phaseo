type SessionCountSource = {
	session_id: string | null;
	app_id: string | null;
	model_id: string | null;
	provider: string | null;
};
type SessionCounts = {
	app_counts: Array<{ app_id: string; request_count: number }>;
	model_counts: Array<{ model_id: string; request_count: number }>;
	model_provider_counts: Array<{
		model_id: string;
		provider: string;
		request_count: number;
	}>;
};

export function collectSessionCounts(
	rows: SessionCountSource[],
): Map<string, SessionCounts> {
	const sessions = new Map<string, SessionCounts>();
	for (const row of rows) {
		const id = row.session_id?.trim();
		if (!id) continue;
		const counts = sessions.get(id) ?? {
			app_counts: [],
			model_counts: [],
			model_provider_counts: [],
		};
		const app = row.app_id?.trim();
		const model = row.model_id?.trim();
		const provider = row.provider?.trim();
		if (app) {
			const count = counts.app_counts.find((entry) => entry.app_id === app);
			if (count) count.request_count++;
			else counts.app_counts.push({ app_id: app, request_count: 1 });
		}
		if (model) {
			const count = counts.model_counts.find(
				(entry) => entry.model_id === model,
			);
			if (count) count.request_count++;
			else counts.model_counts.push({ model_id: model, request_count: 1 });
			if (provider) {
				const pair = counts.model_provider_counts.find(
					(entry) => entry.model_id === model && entry.provider === provider,
				);
				if (pair) pair.request_count++;
				else
					counts.model_provider_counts.push({
						model_id: model,
						provider,
						request_count: 1,
					});
			}
		}
		sessions.set(id, counts);
	}
	for (const counts of sessions.values()) {
		counts.app_counts.sort(
			(a, b) =>
				b.request_count - a.request_count || a.app_id.localeCompare(b.app_id),
		);
		counts.model_counts.sort(
			(a, b) =>
				b.request_count - a.request_count ||
				a.model_id.localeCompare(b.model_id),
		);
		counts.model_provider_counts.sort(
			(a, b) =>
				b.request_count - a.request_count ||
				a.model_id.localeCompare(b.model_id) ||
				a.provider.localeCompare(b.provider),
		);
	}
	return sessions;
}
