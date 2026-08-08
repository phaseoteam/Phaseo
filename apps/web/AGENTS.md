# Web App Overrides

These instructions apply only to `apps/web` and extend the repository-level `AGENTS.md`. Keep shared monorepo policy, Git workflow, and general testing guidance in the root file.

## Stack and Structure

- Next.js 16 App Router with React 19, TypeScript 6 strict mode, Tailwind CSS 4, ShadCN/Base UI primitives, and Cache Components.
- Routes, layouts, metadata, route handlers, and server actions live under `src/app`; route groups such as `(auth)` and `(dashboard)` organize routes without changing URLs.
- Shared components live in `src/components`, with reusable primitives in `src/components/ui`. Shared hooks, domain logic, types, and utilities live in `src/hooks`, `src/lib`, `src/types`, and `src/utils`.
- Keep feature-specific code close to its route or domain. Promote it to a shared directory only after it has a genuine second consumer.
- Canonical model, provider, pricing, and benchmark data belongs to `packages/data/catalog`; do not create a competing web-only source of truth.
- Use the `@/` alias and prefer direct implementation imports over new barrel files.

## Scoped Commands

- Development: `pnpm --filter @phaseo/web dev` (port 3100)
- Lint: `pnpm --filter @phaseo/web lint`
- Type-check: `pnpm --filter @phaseo/web typecheck`
- Tests: `pnpm --filter @phaseo/web test`
- Build: `pnpm --filter @phaseo/web build`
- Playwright: `pnpm --filter @phaseo/web exec playwright test`

Run the narrowest relevant checks while iterating. Run a production build when a change can affect routing, rendering, caching, or bundling.

## Next.js and React

- Prefer Server Components. Add `"use client"` only at the smallest boundary requiring browser APIs, local state, event handlers, or client-only libraries.
- Keep secrets, privileged clients, billing logic, and admin Supabase access in server-only modules. Authenticate and authorize every mutation at the server boundary.
- Start independent asynchronous work together and await it with `Promise.all`; use Suspense to stream independent dynamic sections.
- Minimize data serialized into Client Components. Dynamically import large client-only charts, editors, 3D, PDF, or media features when deferral improves initial load.
- Preserve accessibility, keyboard behavior, focus management, and reduced-motion preferences.

## Cache Components

- `cacheComponents: true` is enabled. Treat freshness and invalidation as explicit product behavior.
- Use `"use cache"` only for shareable asynchronous work, with intentional `cacheLife` and `cacheTag` policies.
- Do not access `cookies()`, `headers()`, or request `searchParams` inside a shared cache scope; read them outside and pass the minimum serializable arguments.
- Use `updateTag` for read-your-own-writes behavior and `revalidateTag` for stale-while-revalidate. Reuse the central helpers in `src/lib/cache`.
- Do not introduce `force-dynamic`, `force-static`, `unstable_cache`, or ad hoc cache-busting without checking the existing Cache Components design.

## UI and Client State

- Start with existing `src/components/ui` primitives and the configured ShadCN registries before adding a primitive or dependency.
- Use Tailwind utilities and established tokens; keep `src/app/globals.css` for tokens, resets, and truly global behavior.
- Keep product copy concise. Add helper text only when it prevents a likely misunderstanding.
- Prefer URL state for shareable filters, searches, tabs, and pagination, using existing `nuqs` patterns. Use SWR for client revalidation and request deduplication.
- Keep transient state local, derive values during render where possible, and avoid effects that merely synchronize duplicate state.

## Web Testing and Safety

- Jest uses a Node environment by default. Add DOM-specific setup only when a test genuinely needs it.
- Use Playwright under `tests/e2e` for critical browser journeys and performance regressions.
- Mock network and time at clear boundaries; unit tests must not call live providers, production Supabase, billing, or analytics services.
- Treat redirect URLs, webhook payloads, uploaded content, Markdown/HTML, and external URLs as untrusted. Reuse existing validation and sanitization utilities.
- Scripts for imports, outreach, provisioning, reconciliation, or database updates may have external side effects; inspect their options and environment requirements before running them.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
