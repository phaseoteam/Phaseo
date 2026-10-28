import { perf } from "@/perf";

/** Incoming links pass straight through; only the perf build (APP_VARIANT=perf) reads its own `perf/…` links. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  return perf ? perf.handleLink(path, initial) : path;
}
