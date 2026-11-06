import { lazy, Suspense, useEffect, useRef, useState, type ReactElement } from "react";
import type { TaskOverview } from "../../shared/workspaceOverview";

// The card loads on the first hover, so the sidebar costs nothing extra at launch.
const Popup = lazy(() => import("./ChatHoverCardPopup"));

/** Hovering a chat in the sidebar for a moment shows what it is, where it stands and its latest reply, without opening it. */
export function ChatHoverCard({ task, disabled, children }: { task: TaskOverview; disabled?: boolean; children: ReactElement }) {
	const [anchor, setAnchor] = useState<DOMRect>();
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const hide = () => { if (timer.current) clearTimeout(timer.current); timer.current = undefined; setAnchor(undefined); };
	useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
	useEffect(() => { if (disabled) hide(); }, [disabled]);
	return <div onPointerLeave={hide} onPointerDown={hide} onDragStart={hide}
		onPointerEnter={event => {
			if (disabled || event.pointerType !== "mouse") return;
			const row = event.currentTarget; hide();
			timer.current = setTimeout(() => setAnchor(row.getBoundingClientRect()), 700);
		}}>
		{children}
		{anchor && !disabled && <Suspense><Popup task={task} anchor={anchor} /></Suspense>}
	</div>;
}
