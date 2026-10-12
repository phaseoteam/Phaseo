import { useEffect, useRef, useState } from "react";
import type { TaskHistoryPage, TaskHistoryQuery } from "../../shared/taskHistory";

export function useTaskHistory(read: ((query: TaskHistoryQuery) => Promise<TaskHistoryPage>) | undefined, query: string, archived: boolean, revision: string, projectId?: string | null) {
	const key = JSON.stringify([query, archived, projectId === undefined ? "all" : projectId]);
	const [pages, setPages] = useState({ key, count: 1 });
	useEffect(() => { setPages({ key, count: 1 }); }, [key]);
	const count = pages.key === key ? pages.count : 1;
	const [result, setResult] = useState<{ key: string; page: TaskHistoryPage }>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [retry, setRetry] = useState(0);
	const confirmed = useRef<{ key: string; revision: string; read: typeof read; count: number; page: TaskHistoryPage } | undefined>(undefined);
	useEffect(() => {
		if (!read) return;
		let active = true;
		setLoading(true); setError("");
		const timer = setTimeout(() => {
			void (async () => {
				const previous = confirmed.current;
				const append = previous && previous.key === key && previous.revision === revision && previous.read === read && previous.count < count;
				const tasks: TaskHistoryPage["tasks"] = append ? [...previous.page.tasks] : [];
				let hasMore = append ? previous.page.hasMore : false;
				let completed = append ? previous.count : 0;
				for (let index = completed; index < count; index++) {
					if (index > 0 && !hasMore) break;
					const page = await read({ query, archived, offset: index * 50, limit: 50, ...(projectId !== undefined ? { projectId } : {}) });
					if (!active) return;
					tasks.push(...page.tasks); hasMore = page.hasMore;
					completed = index + 1;
					if (!hasMore) break;
				}
				if (active) {
					const page = { tasks: [...new Map(tasks.map(task => [task.id, task])).values()], hasMore };
					confirmed.current = { key, revision, read, count: completed, page };
					setResult({ key, page });
				}
			})().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (active) setLoading(false); });
		}, 150);
		return () => { active = false; clearTimeout(timer); };
	}, [read, query, archived, revision, key, count, retry, projectId]);
	const page = result?.key === key ? result.page : { tasks: [], hasMore: false };
	return { ...page, hasMore: page.hasMore && count <= 20_000, loading: loading && result?.key !== key, error, loadMore: () => setPages({ key, count: count + 1 }), retry: () => setRetry(value => value + 1) };
}
