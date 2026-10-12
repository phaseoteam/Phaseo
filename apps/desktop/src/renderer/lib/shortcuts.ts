function isMac() { return typeof window !== "undefined" && window.phaseoDesktop?.platform === "darwin"; }
export function shortcutLabel(key: string) { return isMac() ? "⌘" + key.replace("Shift+", "⇧") : "Ctrl+" + key; }
export function shortcutKeys(key: string) { return (isMac() ? "Meta+" : "Control+") + key; }
