import { useEffect, useRef, useState } from "react";
import type { Task } from "../../shared/workspace";

// The last chats read, shared by every view, so a chat opens from what hovering its row already fetched.
const cache = new Map<string, Task>(), prefetching = new Set<string>();
function remember(id: string, task: Task) { cache.delete(id); cache.set(id, task); if (cache.size > 20) cache.delete(cache.keys().next().value!); }

/** Reads a chat ahead of opening it (its sidebar row is under the pointer); the open view still re-reads it. */
export function prefetchTask(id: string) {
	const read = window.phaseoDesktop?.workspace.task;
	if (!read || cache.has(id) || prefetching.has(id)) return;
	prefetching.add(id);
	void read(id).then(task => { if (!cache.has(id)) remember(id, task); }, () => undefined).finally(() => prefetching.delete(id));
}

export function useSelectedTask(read: ((id: string) => Promise<Task>) | undefined, id: string | undefined, revision: string | undefined) {
	const [result, setResult] = useState<{ id?: string; task?: Task; error?: string }>({});
	const refresh = useRef<(() => void) | undefined>(undefined);
	useEffect(() => {
		if (!read || !id) return;
		let active = true; let pending = false; let inFlight = false;
		setResult({ id, task: cache.get(id) });
		const request = () => {
			pending = true;
			if (inFlight) return;
			inFlight = true;
			void (async () => {
				while (active && pending) {
					pending = false;
					const task = await read(id);
					if (active) {
						remember(id, task);
						setResult({ id, task });
					}
				}
			})().catch(reason => { if (active) setResult(current => ({ ...current, id, error: reason instanceof Error ? reason.message : String(reason) })); }).finally(() => {
				inFlight = false;
				if (active && pending) request();
			});
		};
		refresh.current = request;
		return () => { active = false; if (refresh.current === request) refresh.current = undefined; };
	}, [read, id]);
	useEffect(() => { refresh.current?.(); }, [read, id, revision]);
	return { ...(result.id === id ? result : { task: id ? cache.get(id) : undefined }), retry: () => refresh.current?.() };
}
