import { existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import path from "node:path";
import { validateKeybindings } from "../shared/keybindings";
import type { KeybindingsState } from "../shared/desktop";

/** keybindings.json in the app's data folder: the person's own shortcuts, edited from Settings or by hand. */
export class KeybindingsFile {
	private watcher?: FSWatcher;
	private timer?: ReturnType<typeof setTimeout>;
	onChange: (state: KeybindingsState) => void = () => {};
	constructor(readonly filename: string) {}

	read(): KeybindingsState {
		if (!existsSync(this.filename)) return { entries: [], path: this.filename };
		try {
			const text = readFileSync(this.filename, "utf8");
			return { entries: text.trim() ? validateKeybindings(JSON.parse(text)) : [], path: this.filename };
		} catch (error) {
			// A hand edit that does not parse keeps the defaults working and says why.
			return { entries: [], path: this.filename, error: error instanceof Error ? error.message : "keybindings.json could not be read." };
		}
	}

	save(value: unknown): KeybindingsState {
		const entries = validateKeybindings(value);
		mkdirSync(path.dirname(this.filename), { recursive: true });
		writeFileSync(this.filename, `${JSON.stringify(entries, null, "\t")}\n`);
		return this.read();
	}

	/** Creates the file if needed so it can be opened in an editor. */
	ensure() {
		if (!existsSync(this.filename)) { mkdirSync(path.dirname(this.filename), { recursive: true }); writeFileSync(this.filename, "[]\n"); }
		return this.filename;
	}

	/** Hand edits reach open windows; the folder is watched because editors replace the file. */
	watch() {
		if (this.watcher) return;
		mkdirSync(path.dirname(this.filename), { recursive: true });
		try {
			this.watcher = watch(path.dirname(this.filename), (_event, name) => {
				if (name && name.toString() !== path.basename(this.filename)) return;
				if (this.timer) clearTimeout(this.timer);
				this.timer = setTimeout(() => this.onChange(this.read()), 150);
			});
			this.watcher.unref();
		} catch { /* Without a watcher, changes still apply after the next save or restart. */ }
	}

	close() { this.watcher?.close(); this.watcher = undefined; if (this.timer) clearTimeout(this.timer); }
}
