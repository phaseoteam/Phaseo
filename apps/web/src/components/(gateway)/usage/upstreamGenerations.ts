import type { UsageUpstreamRequestRow } from "@/lib/fetchers/internal/settingsTypes";

export type UpstreamGeneration = UsageUpstreamRequestRow & {
	attempts: UsageUpstreamRequestRow[];
	totalAttempts: number;
};

export function groupUpstreamGenerations(
	rows: UsageUpstreamRequestRow[],
): UpstreamGeneration[] {
	const groups = new Map<string, UsageUpstreamRequestRow[]>();
	for (const row of rows) {
		const id = row.gateway_request_id || row.request_id;
		const group = groups.get(id) ?? [];
		if (!group.some((attempt) => attempt.id === row.id)) group.push(row);
		groups.set(id, group);
	}
	return Array.from(groups.values())
		.map((attempts) => {
			attempts.sort(
				(a, b) =>
					b.sequence - a.sequence ||
					Date.parse(b.created_at) - Date.parse(a.created_at),
			);
			const final = attempts[0];
			return {
				...final,
			created_at: final.request_created_at ?? attempts[attempts.length - 1].created_at,
				attempts,
				totalAttempts: Math.max(
					attempts.length,
					...attempts.map((row) => row.attempt_count ?? row.sequence ?? 1),
				),
			};
		})
		.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
