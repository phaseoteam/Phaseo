# Performance suite

`pnpm --filter @phaseo/desktop perf` builds the app, measures it on fixture workspaces and writes
`output/perf/<time>/report.md`, `report.json` and `report.html`. The HTML page shows headline changes, a before/after dot
chart per section, time to interactive per profile, and the distribution of every keystroke and frame; rebuild it from
saved reports with `node scripts/perf/report-html.mjs <report.json> [--baseline=<earlier report.json>]`. Nothing reaches the network: models are fixed, local agents are
hidden, and the streaming load talks to a stand-in gateway on 127.0.0.1.

## What it measures

| Section | How | Metrics |
| --- | --- | --- |
| Startup | `scripts/perf/perf-app.mjs` launches the built app on a copy of a template profile, timed from the moment the runner spawns Electron. Three profiles: first launch (no chats), a few chats, and 2,000 chats with very long ones. Each runs `--runs` times on a fresh copy (no code cache) and again on one reused profile (warm caches, the usual launch). | Electron boot, main bundle load, app ready, window created, renderer started, HTML parsed, first paint, React render start (`phaseo:render-start`), workspace loaded (`phaseo:workspace-ready`), window shown, interactive (workspace loaded and the sidebar and main pane drawn), long tasks before interactive |
| Memory and idle CPU | `app.getAppMetrics()` 3 s after startup, and CPU over the next 10 s with nobody touching the app. | Private bytes per process type, idle CPU per process type |
| Interactions | The 2,000-chat profile. Input is sent with `webContents.sendInputEvent`, so the page sees trusted events, and timed from the event's own timestamp to the first frame after the result has drawn. | Opening chats (small, 2,000 turns, 600 Code turns, a 400 KB answer with a 900-row table, 300 turns of pasted files; first time and again), switching chats, scrolling the long chat (frame times, frames over 33 ms, long-task time), typing in the composer (key to next frame), switching to Code and back, the command palette and its message search, and main-process reads over IPC |
| Parallel streaming | `scripts/fixtures/load-gateway.mjs` streams to `--load` Chat and Code chats at once, driven by `scripts/parallel-load.mjs`. | Chats finished, peak running, main-process response p50/p95, window frame p95, frames over 50 ms, memory before and at peak |
| Store | `src/main/storeLoad.bench.test.ts`: eight chats streaming into long histories while the window reads, and a second connection writing. | Per-operation p50 (and p95), main-thread share for eight streams, WAL bytes per flush, database size |
| Bundle | Sizes of `dist/`. | Renderer JavaScript (all and before first paint), stylesheets, main bundle |

## Options

```sh
pnpm --filter @phaseo/desktop perf -- --runs=5                 # launches per startup profile (default 5)
pnpm --filter @phaseo/desktop perf -- --only=startup,bundle    # any of startup, interactions, load, store, bundle
pnpm --filter @phaseo/desktop perf -- --skip-build             # measure the current dist/
pnpm --filter @phaseo/desktop perf -- --load=50,50,55          # Chat chats, Code chats, seconds
pnpm --filter @phaseo/desktop perf -- --baseline=output/perf/<earlier>/report.json --fail-on-regression
```

With `--baseline`, each metric shows its earlier median and the change; a metric counts as worse or better when its
median moves by more than `--threshold` percent (default 10) and by more than a small floor for its unit (15 ms, 20 MB,
1 point of CPU, 5 KB, 1 frame), so noise on small numbers is not flagged.

## Finding the cause

`electron scripts/perf/perf-app.mjs --profile=<copied profile> --scenario=startup --out=result.json --cpu-profile=<dir>`
writes `main-startup.cpuprofile`, `renderer-startup.cpuprofile` and `main-idle.cpuprofile`. Open them in DevTools
(Performance → Load profile), or print the heaviest functions and files:

```sh
node scripts/perf/profile-summary.mjs <dir>/main-startup.cpuprofile --top=30
```

## Comparing fairly

- Compare runs from the same machine, on power, with other heavy apps closed. The report records the machine.
- Run the two builds back to back. Startup moved by 25–40% between two runs of unchanged startup code an hour apart
  (file cache and background load), so a startup change smaller than that needs repeated, interleaved runs.
- Interaction metrics with n = 1 move by 10–40% from run to run; trust the large changes and the IPC reads (n = 5+).
- By default every launch gets an empty home folder, so Claude Code and Codex transcripts on the machine are not
  imported during the measurement. `--real-home` measures with them (idle CPU then includes that import).
- Medians are reported with p95, min and max; raise `--runs` when the spread is wide.
- The first launch on a fresh copy has no code cache, so it is slower than the reused profile; compare like with like.
