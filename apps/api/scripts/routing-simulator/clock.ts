/** Date-only virtual clock. Timers remain real, matching the simulator's event queue. */
export function installClock(epoch: number) {
  const original = globalThis.Date;
  let now = epoch;
  globalThis.Date = new Proxy(original, {
    construct(target, args) { return Reflect.construct(target, args.length ? args : [Math.trunc(now)]); },
    apply() { return new original(Math.trunc(now)).toString(); },
    get(target, key, receiver) { return key === "now" ? () => Math.trunc(now) : Reflect.get(target, key, receiver); },
  });
  return { set(value: number) { now = value; }, restore() { globalThis.Date = original; } };
}
