import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import type { ThreadServer } from "../../shared/threadServers";
import { errorText } from "../app/workspace";
import { openInChatBrowser } from "../lib/actionPreview";
import { showToast } from "../components/ui/toast";

/**
 * The local web servers this chat's terminals and background commands started, read when the details open: Open shows
 * one in the chat's browser, Stop ends just that server and leaves its terminal open.
 */
export function ThreadServers({ taskId }: { taskId: string }) {
	const api = window.phaseoDesktop?.workspace;
	const [servers, setServers] = useState<ThreadServer[]>();
	const [error, setError] = useState("");
	const [stopping, setStopping] = useState<number>();
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.threadServers(taskId).then(value => { if (active) setServers(value); }, reason => { if (active) setError(errorText(reason)); });
		return () => { active = false; };
	}, [api, taskId]);
	if (!servers?.length && !error) return null;
	const stop = async (server: ThreadServer) => {
		setStopping(server.port);
		try { await api!.stopThreadServer(taskId, server.port); setServers(current => current?.filter(value => value.port !== server.port)); }
		catch (reason) { showToast("error", `Could not stop the server on port ${server.port}`, errorText(reason)); }
		finally { setStopping(undefined); }
	};
	const open = (server: ThreadServer) => { try { openInChatBrowser(taskId, server.url); } catch (reason) { showToast("error", "Could not open the server", errorText(reason)); } };
	return <div className="border-t border-border/65 px-1.5 pt-2 pb-1.5 text-xs">
		<div className="px-1.5 pb-1 font-medium">Servers</div>
		{error && <p role="alert" className="px-1.5 py-1 text-destructive">{error}</p>}
		{servers?.map(server => <div key={server.port} className="flex h-7 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent/60">
			<Globe className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="shrink-0 font-mono">localhost:{server.port}</span>
			<span className="min-w-0 flex-1 truncate text-muted-foreground" title={`${server.process ?? "Process"} ${server.pid} · from ${server.startedBy}`}>{server.startedBy}</span>
			<button type="button" onClick={() => open(server)} className="shrink-0 rounded-md px-1.5 py-0.5 font-medium hover:bg-accent">Open</button>
			<button type="button" disabled={stopping !== undefined} onClick={() => void stop(server)} className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-destructive hover:bg-accent disabled:opacity-50">{stopping === server.port ? "Stopping…" : "Stop"}</button>
		</div>)}
	</div>;
}
