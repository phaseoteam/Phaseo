# Web App Overrides

These instructions apply only to `apps/web` and extend the repository-level `AGENTS.md`. Keep shared monorepo policy, Git workflow, and general testing guidance in the root file.

## Stack and Structure

- TanStack Start (TanStack Router + React Query) with React 19, TypeScript strict mode, Vite 8, Tailwind CSS 4 and ShadCN/Base UI primitives. It runs as the `phaseo-web` Cloudflare Worker (`wrangler.jsonc`) through `@cloudflare/vite-plugin`.
- `src/routes` holds the file routes; `src/routeTree.gen.ts` is generated from it by every `dev`/`build` run, so never edit it by hand. `src/router.tsx` creates the router and React Query client; `src/start.ts` registers the global request middleware.
- Page components live in `src/views` or next to their feature in `src/components`; a route file only wires `loader`, `head`, `beforeLoad` and `component`.
- Shared components live in `src/components`, with reusable primitives in `src/components/ui`. Shared hooks, domain logic, types, and utilities live in `src/hooks`, `src/lib`, `src/types`, and `src/utils`.
- Keep feature-specific code close to its route or domain. Promote it to a shared directory only after it has a genuine second consumer.
- Canonical model, provider, pricing, and benchmark data lives in the database and is managed through `/internal/data`. Public catalog corrections should link to GitHub issues; keep direct editing restricted to admins.
- Use the `@/` alias and prefer direct implementation imports over new barrel files.
- Vite build plugins specific to this app live in `vite/plugins.ts`. Never put tracked code in a folder named `build`: the root `.gitignore` ignores it.

## Scoped Commands

- Development: `pnpm --filter @phaseo/web dev` (Vite with the Workers runtime, port 3100)
- Lint: `pnpm --filter @phaseo/web lint`
- Build: `pnpm --filter @phaseo/web build` (writes `dist/` and regenerates `src/routeTree.gen.ts`)
- Type-check: `pnpm --filter @phaseo/web typecheck` (needs the route tree, so build or run dev first in a fresh checkout)
- Tests: `pnpm --filter @phaseo/web test` (Vitest; pass file names to run a subset)
- Preview a production build in the Workers runtime: `pnpm --filter @phaseo/web preview`
- Playwright: `pnpm --filter @phaseo/web exec playwright test`
- Run with the local web API Worker: `pnpm dev:cloudflare-web` from the repository root

Run the narrowest relevant checks while iterating. Run a production build when a change can affect routing, rendering, caching, or bundling.

## Rendering and Data Loading

- Pages render on the server (SSR) and hydrate in the browser. There are no React Server Components, so every component must also render in the browser, and components cannot be `async`.
- Data loads through React Query. Define `queryOptions` next to the fetcher (`*.queries.ts`) and read them with `useSuspenseQuery`/`useSuspenseQueries`. Queries resolved during SSR stream to the browser (`setupRouterSsrQueryIntegration`), so hydration does not refetch. Keep `<Suspense>` boundaries around independent sections.
- A route `loader` prefetches above-the-fold queries with `context.queryClient.ensureQueryData(...)` and returns the page metadata; `head` turns it into tags with `metadataToHead`.
- Server-only work (service-role Supabase, secrets, cookies, billing) goes behind `createServerFn` from `@tanstack/react-start`, in a sibling `*.functions.ts` file. Server functions return JSON-serialisable data (Dates become strings). Public web-API fetchers (`fetchPublicWebApi`, `fetchFrontend*`) run in both places; the browser calls `/api/_web/*` on the same origin.
- `"use server"` modules are server actions: a Vite plugin replaces their exports in browser bundles with stubs that POST to the actions endpoint. `<form action={fn}>`, `useActionState` and `.bind(null, id)` work as usual. Authenticate and authorize every mutation on the server.
- Auth gates and redirects that must happen before rendering belong in the route's `beforeLoad` (through a server function), not in a component.
- Search params are raw strings (repeated keys become arrays); read them with `Route.useSearch()` and params with `Route.useParams()`.
- API endpoints are server routes: `createFileRoute("/api/x")({ server: { handlers: { GET, POST } } })`.
- Minimize data sent to the browser. Lazy-load large client-only charts, editors, 3D, PDF, or media features with `@/lib/dynamic`.
- Preserve accessibility, keyboard behavior, focus management, and reduced-motion preferences.

## Requests, Caching and the Worker

- `src/lib/start/requestMiddleware.ts` runs before every request: legacy redirects, security headers, locale negotiation, markdown negotiation, blog gates and the Supabase session refresh. Add site-wide redirects and headers there.
- Public pages are cached at the edge through their `Cache-Control` headers (`src/lib/cache`). Invalidation helpers purge the edge cache keys; reuse them rather than adding ad hoc cache-busting.
- A Worker isolate has a 128 MB memory limit that includes the source of every uploaded module. Translations and `src/content` (blog, help) load from static assets at runtime through the `ASSETS` binding, and the server bundle skips browser-only code (syntax highlighting, docs search). Keep large JSON, dictionaries and browser-only libraries out of server code; check the server bundle size after adding a dependency.
- Workers have no filesystem and cannot evaluate code at runtime, so content that was read or compiled per request (MDX posts, content listings) is prepared at build time by the plugins in `vite/plugins.ts`.
- Settings named `PUBLIC_*` are inlined into both bundles at build time (`vite.config.ts`). Every other variable is a Worker variable or secret, read on the server through `process.env`; locally they come from `.env.local`/`.dev.vars`.

## Localisation

- The optional `{-$locale}` route segment gives "as needed" prefixes: `/models` is en-GB, `/fr-FR/models` is French. Use the locale-aware `Link`, `redirect`, `usePathname` and `useRouter` from `@/i18n/navigation` for internal links.
- Components use `useTranslations`, `useLocale` and `useFormatter` from `@/i18n/react`. Loaders, server functions and metadata use `@/i18n/server`, which resolves the locale from the request.
- See [README.md](README.md#translation-payloads) for how dictionaries reach the browser and [LOCALISATION.md](LOCALISATION.md) for the translation checks.

## UI and Client State

- Start with existing `src/components/ui` primitives and the configured ShadCN registries before adding a primitive or dependency.
- Use Tailwind utilities and established tokens; keep `src/app/globals.css` for tokens, resets, and truly global behavior.
- Keep product copy concise. Add helper text only when it prevents a likely misunderstanding.
- Prefer URL state for shareable filters, searches, tabs, and pagination, using existing `nuqs` patterns. Use TanStack Query for client revalidation and request deduplication.
- Use `nuqs` for query-backed sheets and dialogs, with `shallow: true` and `scroll: false` for client-only state. Preserve the intended push/replace history behavior, deep-link hydration, Back/Forward synchronization, and unrelated query parameters. Do not use router navigation or hand-written History API updates for these controls; reserve route navigation for actual page changes and server-backed queries.
- Keep transient state local, derive values during render where possible, and avoid effects that merely synchronize duplicate state.

## Web Testing and Safety

- Unit tests use Vitest. Add DOM-specific setup only when a test genuinely needs it.
- Use Playwright under `tests/e2e` for critical browser journeys and performance regressions.
- Mock network and time at clear boundaries; unit tests must not call live providers, production Supabase, billing, or analytics services.
- Treat redirect URLs, webhook payloads, uploaded content, Markdown/HTML, and external URLs as untrusted. Reuse existing validation and sanitization utilities.
- Scripts for imports, outreach, provisioning, reconciliation, or database updates may have external side effects; inspect their options and environment requirements before running them.

## Deploy

- CI (`.github/workflows/ci.yml`, "Deploy Web") builds and deploys the Worker from `main` with `pnpm --filter @phaseo/web build` and `pnpm --filter @phaseo/web run deploy` (`wrangler deploy` of `dist/server/wrangler.json`). A plain `pnpm deploy` is pnpm's own command, so always use `run deploy`.
- The deploy is skipped when nothing the build reads has changed since the commit the Worker serves (recorded as the deployment message).
- The `phaseo.app` route in `wrangler.jsonc` is disabled until the production cutover; until then deploys reach workers.dev only.
