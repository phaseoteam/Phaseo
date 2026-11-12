import type { PerfTools } from "./tools";

/**
 * Load-test tools for the "Phaseo Perf" build (APP_VARIANT=perf, EXPO_PUBLIC_PERF_TOOLS=1): a stress-data seeder,
 * timing spans logged as `[PhaseoPerf] {...}` lines, and a switch to a local chat stand-in.
 *
 * Normal builds inline the variable as undefined, so this is `null` and the bundler drops `./tools` entirely.
 * Call sites use `perf?.…`, which also skips evaluating their arguments.
 */
export const perf: PerfTools | null = process.env.EXPO_PUBLIC_PERF_TOOLS === "1"
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require("./tools") as typeof import("./tools")).tools
  : null;
