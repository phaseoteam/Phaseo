import { useEffect, useRef, useState, type RefObject } from "react";
import { conversationWindow, type ConversationPage, type ConversationPageQuery } from "../../shared/conversationPage";
import type { Task } from "../../shared/workspace";

function recentPage(task: Task, kind: ConversationPage["kind"]): ConversationPage {
	const entries = task[kind] ?? [];
	return { kind, entries, earlier: Math.max(0, (task.conversationCounts?.[kind] ?? entries.length) - entries.length), later: 0, revision: task.revision ?? 0 };
}

export function useConversationPage(task: Task, kind: ConversationPage["kind"], following: RefObject<boolean>, beforeUpdate: () => void) {
	const [page, setPage] = useState(() => recentPage(task, kind));
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const current = useRef(page);
	const source = useRef(task); source.current = task;
	const mounted = useRef(true);
	const pending = useRef(false);
	const refreshPending = useRef(false);
	const lastRequest = useRef<{ query: ConversationPageQuery; mode: "older" | "newer" | "replace" } | undefined>(undefined);
	const read = window.phaseoDesktop?.workspace.conversationPage;
	useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
	function apply(next: ConversationPage) {
		if (!mounted.current) return;
		if (!following.current) beforeUpdate();
		current.current = next; setPage(next);
	}
	async function request(query: ConversationPageQuery, mode: "older" | "newer" | "replace") {
		if (!read || pending.current) return;
		if (mode !== "replace" || !following.current) beforeUpdate();
		pending.current = true; lastRequest.current = { query, mode }; setLoading(true); setError("");
		try {
			const result = await read(query);
			if (!mounted.current) return;
			const previous = current.current;
			const total = result.earlier + result.entries.length + result.later;
			const entries = mode === "older" ? conversationWindow([...result.entries, ...previous.entries], "start") : mode === "newer" ? conversationWindow([...previous.entries, ...result.entries], "end") : result.entries;
			const earlier = mode === "newer" ? total - result.later - entries.length : result.earlier;
			apply({ ...result, entries, earlier, later: total - earlier - entries.length });
			if ((mode !== "replace" && previous.revision !== result.revision) || result.revision < (source.current.revision ?? 0)) refreshPending.current = true;
		} catch (reason) { if (mounted.current) setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); }
		finally {
			pending.current = false;
			if (mounted.current) { setLoading(false); if (refreshPending.current) { refreshPending.current = false; refresh(true); } }
		}
	}
	function refresh(force = false) {
		if (pending.current) { refreshPending.current = true; return; }
		const previous = current.current, latest = recentPage(source.current, kind);
		if (!force && latest.revision < previous.revision) return;
		if (force || previous.later > 0 || previous.entries.length > latest.entries.length || (!following.current && previous.entries.length >= 100)) {
			const added = Math.max(0, latest.earlier + latest.entries.length - previous.earlier - previous.entries.length - previous.later);
			const limit = Math.min(100, Math.max(50, previous.entries.length + added));
			if (previous.entries[0]) void request({ taskId: task.id, kind, limit, ...(!following.current || previous.later > 0 ? { fromId: previous.entries[0].id } : {}) }, "replace");
			else apply(latest);
			return;
		}
		const start = previous.entries.findIndex(entry => entry.id === latest.entries[0]?.id);
		if (start < 0) {
			if (!following.current && previous.entries[0] && latest.entries.length) void request({ taskId: task.id, kind, limit: 100, fromId: previous.entries[0].id }, "replace");
			else apply(latest);
			return;
		}
		const entries = conversationWindow([...previous.entries.slice(0, start), ...latest.entries], "end");
		apply({ ...latest, entries, earlier: latest.earlier + latest.entries.length - entries.length });
	}
	useEffect(() => { refresh(); }, [task]); // Refresh the visible window as task revisions arrive.
	return {
		page, loading, error,
		older: () => { if (page.entries[0]) void request({ taskId: task.id, kind, limit: 50, beforeId: page.entries[0].id }, "older"); },
		newer: () => { if (page.entries.at(-1)) void request({ taskId: task.id, kind, limit: 50, afterId: page.entries.at(-1)!.id }, "newer"); },
		latest: () => { if (pending.current) return; setError(""); lastRequest.current = undefined; if (error || current.current.later > 0) apply(recentPage(source.current, kind)); },
		retry: () => { if (lastRequest.current) void request(lastRequest.current.query, lastRequest.current.mode); },
	};
}
