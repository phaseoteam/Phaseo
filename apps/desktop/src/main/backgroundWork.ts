/**
 * Background commands a harness started in one turn (Claude's run_in_background shells and monitors), and the ones its agent
 * asked to wait for with background_wait. While any awaited task is unfinished the turn stays open, so the chat shows it working
 * and the harness, which ends its background work when its session ends, is not stopped under it.
 */
export class BackgroundWork {
	private readonly started = new Set<string>();
	private readonly finished = new Set<string>();
	private readonly awaited = new Set<string>();
	private readonly listeners = new Set<() => void>();
	start(id: string) { this.started.add(id); this.changed(); }
	finish(id: string) { this.finished.add(id); this.changed(); }
	/** Marks (or with waiting false, unmarks) tasks to wait for; ids the harness never reported are unmatched. */
	wait(ids: string[], waiting = true) {
		const matched = ids.filter(id => this.started.has(id) || this.finished.has(id)), unmatched = ids.filter(id => !matched.includes(id));
		for (const id of matched) if (waiting) this.awaited.add(id); else this.awaited.delete(id);
		this.changed();
		return { matched, unmatched };
	}
	get pending() { return [...this.awaited].some(id => !this.finished.has(id)); }
	onChange(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
	private changed() { for (const listener of [...this.listeners]) listener(); }
}
