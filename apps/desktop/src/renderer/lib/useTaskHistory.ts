import { useEffect, useState } from "react";
import type { TaskHistoryPage, TaskHistoryQuery } from "../../shared/taskHistory";

export function useTaskHistory(read: ((query: TaskHistoryQuery) => Promise<TaskHistoryPage>) | undefined, query: string, archived: boolean, revision: string) {
	const key = JSON.stringify([query, archived]);
	const [pages, setPages] = useState({ key, count: 1 });
	useEffect(() => { setPages({ key, count: 1 }); }, [key]);
	const count = pages.key === key ? pages.count : 1;
	const [result, setResult] = useState<{ key: string; page: TaskHistoryPage }>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [retry, setRetry] = useState(0);
	useEffect(() => {
		if (!read) return;
		let active = true;
		setLoading(true); setError("");
		const timer = setTimeout(() => {
			void (async () => {
				const tasks: TaskHistoryPage["tasks"] = [];
				let hasMore = false;
				for (let index = 0; index < count; index++) {
					const page = await read({ query, archived, offset: index * 50, limit: 50 });
					if (!active) return;
					tasks.push(...page.tasks); hasMore = page.hasMore;
					if (!hasMore) break;
				}
				if (active) setResult({ key, page: { tasks: [...new Map(tasks.map(task => [task.id, task])).values()], hasMore } });
			})().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (active) setLoading(false); });
		}, 150);
		return () => { active = false; clearTimeout(timer); };
	}, [read, query, archived, revision, key, count, retry]);
	const page = result?.key === key ? result.page : { tasks: [], hasMore: false };
	return { ...page, hasMore: page.hasMore && count <= 20_000, loading, error, loadMore: () => setPages({ key, count: count + 1 }), retry: () => setRetry(value => value + 1) };
}
