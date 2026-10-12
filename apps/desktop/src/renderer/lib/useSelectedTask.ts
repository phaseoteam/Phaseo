import { useEffect, useRef, useState } from "react";
import type { Task } from "../../shared/workspace";

export function useSelectedTask(read: ((id: string) => Promise<Task>) | undefined, id: string | undefined, revision: string | undefined) {
	const [result, setResult] = useState<{ id?: string; task?: Task; error?: string }>({});
	const refresh = useRef<(() => void) | undefined>(undefined);
	const cache = useRef(new Map<string, Task>());
	useEffect(() => {
		if (!read || !id) return;
		let active = true; let pending = false; let inFlight = false;
		setResult({ id, task: cache.current.get(id) });
		const request = () => {
			pending = true;
			if (inFlight) return;
			inFlight = true;
			void (async () => {
				while (active && pending) {
					pending = false;
					const task = await read(id);
					if (active) {
						cache.current.delete(id); cache.current.set(id, task);
						if (cache.current.size > 20) cache.current.delete(cache.current.keys().next().value!);
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
	return { ...(result.id === id ? result : { task: id ? cache.current.get(id) : undefined }), retry: () => refresh.current?.() };
}
