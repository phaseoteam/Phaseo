/**
 * Mod+Alt+Shift+T asks Settings → Appearance to open the current theme's editor, or close it. Appearance loads with
 * Settings, so a request made before it mounts waits for it.
 */
let pending = false;
const listeners = new Set<() => void>();

export function requestThemeEditor() {
	if (listeners.size) for (const listener of listeners) listener();
	else pending = true;
}

export function onThemeEditorRequest(listener: () => void) {
	listeners.add(listener);
	if (pending) { pending = false; listener(); }
	return () => { listeners.delete(listener); };
}
