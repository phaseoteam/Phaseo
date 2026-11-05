import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type Request = { title: string; description: ReactNode; detail?: string; confirm: string; resolve: (allowed: boolean) => void };
const listeners = new Set<(request: Request) => void>();

/** Asks the person to allow something a page or app wants to do; resolves false when they decline or close it. */
export function askConsent(request: Omit<Request, "resolve">): Promise<boolean> {
	if (!listeners.size) return Promise.resolve(false);
	return new Promise(resolve => { for (const listener of listeners) listener({ ...request, resolve }); });
}

/** Mounted once at the app root; shows one request at a time, the rest wait their turn. */
export function ConsentHost() {
	const [queue, setQueue] = useState<Request[]>([]);
	useEffect(() => { const listen = (request: Request) => setQueue(current => [...current, request]); listeners.add(listen); return () => { listeners.delete(listen); }; }, []);
	const current = queue[0];
	const answer = (allowed: boolean) => { current?.resolve(allowed); setQueue(rest => rest.slice(1)); };
	return <Dialog open={Boolean(current)} onOpenChange={open => { if (!open) answer(false); }}>
		{current && <DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>{current.title}</DialogTitle>
				<DialogDescription>{current.description}</DialogDescription>
			</DialogHeader>
			{current.detail && <pre data-selectable className="max-h-48 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap">{current.detail}</pre>}
			<DialogFooter>
				<Button variant="ghost" onClick={() => answer(false)}>Don't allow</Button>
				<Button autoFocus onClick={() => answer(true)}>{current.confirm}</Button>
			</DialogFooter>
		</DialogContent>}
	</Dialog>;
}
