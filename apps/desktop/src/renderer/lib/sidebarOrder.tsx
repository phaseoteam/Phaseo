import { useEffect, useState } from "react";
import { isMac } from "./shortcuts";

/** The chats the sidebar shows, top to bottom, for Ctrl+1–9 and previous/next chat. */
let order: string[] = [];
export function publishSidebarOrder(ids: string[]) { order = ids; }
export const sidebarOrder = () => order;

/** Jump numbers show on the first nine rows once Ctrl (⌘ on macOS) has been held alone for 200 ms. */
export function useJumpHints() {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const hide = () => { if (timer) clearTimeout(timer); timer = undefined; setShown(false); };
		const onKeyDown = (event: KeyboardEvent) => {
			const modifier = isMac() ? "Meta" : "Control";
			if (event.key === modifier && !event.repeat && !event.altKey && !event.shiftKey) { hide(); timer = setTimeout(() => setShown(true), 200); }
			else if (event.key !== modifier) hide();
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", hide);
		window.addEventListener("blur", hide);
		return () => { hide(); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", hide); window.removeEventListener("blur", hide); };
	}, []);
	return shown;
}

export function JumpHint({ index }: { index: number }) {
	return <span aria-hidden className="grid size-4.5 shrink-0 place-items-center rounded border border-border bg-background font-sans text-[10.5px] font-medium text-muted-foreground">{index}</span>;
}
