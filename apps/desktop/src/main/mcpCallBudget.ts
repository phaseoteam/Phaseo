/** A tool's active execution budget excludes time spent in human forms. */
export class McpCallBudget {
 readonly controller = new AbortController();
 private remaining: number;
 private started = 0;
 private timer?: ReturnType<typeof setTimeout>;
 private paused = false;
 constructor(milliseconds = 60000) { this.remaining = milliseconds; this.arm(); }
 get signal() { return this.controller.signal; }
 private arm() {
  this.started = performance.now();
  this.timer = setTimeout(() => { this.timer = undefined; this.controller.abort(new Error("MCP tool exceeded its active execution deadline.")); }, this.remaining);
 }
 pause() {
  if (this.paused || this.signal.aborted) return;
  this.paused = true;
  if (this.timer !== undefined) clearTimeout(this.timer);
  this.timer = undefined;
  this.remaining = Math.max(0, this.remaining - (performance.now() - this.started));
 }
 resume() { if (!this.paused || this.signal.aborted) return; this.paused = false; this.arm(); }
 dispose() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
}
