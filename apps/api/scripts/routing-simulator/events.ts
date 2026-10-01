type Event = { at: number; priority: number; seq: number; run: () => Promise<void> };
/** Stable min-heap: feedback/completions precede arrivals, observations follow. */
export class Events {
  private heap: Event[] = [];
  private sequence = 0;
  private before(a: Event, b: Event) { return a.at < b.at || (a.at === b.at && (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq))); }
  add(at: number, priority: number, run: Event["run"]) {
    const event = { at, priority, run, seq: this.sequence++ };
    let i = this.heap.push(event) - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.before(event, this.heap[p])) break;
      this.heap[i] = this.heap[p]; i = p;
    }
    this.heap[i] = event;
  }
  pop(): Event | undefined {
    const first = this.heap[0]; const last = this.heap.pop();
    if (this.heap.length && last) {
      let i = 0;
      while (2 * i + 1 < this.heap.length) {
        let child = 2 * i + 1;
        if (child + 1 < this.heap.length && this.before(this.heap[child + 1], this.heap[child])) child++;
        if (!this.before(this.heap[child], last)) break;
        this.heap[i] = this.heap[child]; i = child;
      }
      this.heap[i] = last;
    }
    return first;
  }
}
export function random(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function keyedSeed(value: string) {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}
