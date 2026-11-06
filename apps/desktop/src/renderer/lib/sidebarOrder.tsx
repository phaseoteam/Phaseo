import { useEffect, useState } from "react";
import { parseKey } from "../../shared/keybindings";
import { Kbd } from "../components/ui/kbd";
import { bindingKey, shortcut } from "./keybindings";
import { isMac } from "./shortcuts";

/** The chats the sidebar shows, top to bottom, for Ctrl+1–9 and previous/next chat. */
let order: string[] = [];
export function publishSidebarOrder(ids: string[]) { order = ids; }
export const sidebarOrder = () => order;

/** The modifiers "Open chat 1" is bound to (Ctrl, or ⌘ on macOS, unless rebound); none when it takes a plain key. */
function jumpModifiers() {
	const parsed = parseKey(bindingKey("thread.jump.1") ?? ""), mac = isMac();
	if (!parsed) return undefined;
	const held = { ctrl: parsed.ctrl || (parsed.mod && !mac), meta: parsed.meta || (parsed.mod && mac), alt: parsed.alt, shift: parsed.shift };
	return held.ctrl || held.meta || held.alt || held.shift ? held : undefined;
}

/**
 * The jump shortcuts show on the first nine rows once their modifiers have been held alone for 200 ms, so a quick
 * shortcut never flashes them, and hide as soon as one is released. Never while a terminal has focus: it takes the keys.
 */
export function useJumpHints() {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const hide = () => { if (timer) clearTimeout(timer); timer = undefined; setShown(false); };
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat) return;
			const needed = jumpModifiers(), modifierKey = ["Control", "Meta", "Alt", "Shift"].includes(event.key);
			const exact = needed && event.ctrlKey === needed.ctrl && event.metaKey === needed.meta && event.altKey === needed.alt && event.shiftKey === needed.shift;
			const terminal = Boolean((document.activeElement as HTMLElement | null)?.closest(".xterm"));
			hide();
			if (modifierKey && exact && !terminal) timer = setTimeout(() => setShown(true), 200);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", hide);
		window.addEventListener("blur", hide);
		return () => { hide(); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", hide); window.removeEventListener("blur", hide); };
	}, []);
	return shown;
}

/** A row's jump shortcut, such as Ctrl+1, in place of its status while the hints show. */
export function JumpHint({ index }: { index: number }) {
	return <Kbd aria-hidden data-jump-hint className="shrink-0">{shortcut(`thread.jump.${index}` as `thread.jump.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`)}</Kbd>;
}
