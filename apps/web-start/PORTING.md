# Porting apps/web to TanStack Start

`apps/web-start` is the Phaseo website rebuilt on TanStack Start, running on
Cloudflare Workers. `apps/web` (Next.js) stays the production app until the
switch-over, so this app is additive and never edits `apps/web`.

Why: in a side-by-side benchmark on Workers the same page cost 4–6× less CPU
in TanStack Start (plain SSR) than in vinext, and real Next.js through
OpenNext exceeds the Workers size limit.

## Layout

- `src/` started as a verbatim copy of `apps/web/src` (first commit), so
  `git diff <copy commit> -- apps/web-start/src` shows exactly what the port
  changed.
- `src/routes/` holds the TanStack file routes. `src/app/` (the Next routes)
  is deleted route by route as each one is ported. When the port is complete
  there is no `src/app` left.
- `src/compat/` holds the shims that let unchanged components keep importing
  `next/*` and `next-intl`. Vite aliases point those imports here.
- Translations (`apps/web/messages`) and static files (`apps/web/public`)
  are shared with `apps/web`, not copied.

## Rendering model

Plain SSR plus hydration. There are no React Server Components, so **every
component must be renderable in the browser too**. That is the main porting
rule:

1. `async` components are not allowed. Convert them:

   ```tsx
   // Before (Next server component)
   export default async function Pricing({ modelId }: Props) {
     const t = await getTranslations("Catalogue.pricing");
     const rows = await fetchFrontendModelPricing(modelId);
     return <Table rows={rows} title={t("title")} />;
   }

   // After
   export default function Pricing({ modelId }: Props) {
     const t = useTranslations("Catalogue.pricing");
     const { data: rows } = useSuspenseQuery(modelPricingQuery(modelId));
     return <Table rows={rows} title={t("title")} />;
   }
   ```

   - Define query options next to the fetcher, in a `*.queries.ts` file:
     `export const modelPricingQuery = (id: string) => queryOptions({ queryKey: ["model-pricing", id], queryFn: () => fetchFrontendModelPricing(id) })`.
   - Queries resolved during SSR stream to the browser automatically
     (`@tanstack/react-router-ssr-query`), so the browser does not refetch.
   - Keep the existing `<Suspense>` boundaries: they still stream.
   - `Promise.all` of several fetches becomes `useSuspenseQueries`.

2. `getTranslations` / `getLocale` / `getFormatter` from `next-intl/server`
   become `useTranslations` / `useLocale` / `useFormatter` in components.
   Outside components (loaders, server functions, metadata) keep using the
   `next-intl/server` shim: it resolves the locale from the request.

3. Fetchers that only work on the server (Supabase service role, secrets,
   cookies, `next/headers`) must be wrapped with `createServerFn` from
   `@tanstack/react-start` and called through the server function from the
   query. Public web-API fetchers (`fetchPublicWebApi`) run in both places:
   the browser calls `/api/_web/*` on the same origin.

4. `"use server"` modules stay as they are. The `phaseo:server-actions` Vite
   plugin turns their exports into browser stubs that POST to `/_actions`.
   `<form action={fn}>`, `useActionState` and `.bind(null, id)` keep working.

5. `"use cache"` directives are removed by the build (no-op). Do not add new
   ones.

## Routes

- One file route per Next page under `src/routes/{-$locale}/...`. The
  optional `{-$locale}` parameter reproduces `localePrefix: "as-needed"`:
  `/models` is en-GB, `/fr-FR/models` is French.
- Route groups map to pathless layouts: `(dashboard)` → `_dashboard`,
  `(auth)` → `_auth`, `(legal)` → `_legal`.
- Dynamic segments: `[modelId]` → `$modelId`, `[...slug]` → `$`
  (read with `params._splat`).
- The page component file can stay where it was (moved under
  `src/views/...` when it had route-only code). The route file only wires
  `loader`, `head` and `component`.
- `loader` prefetches the page's queries with
  `context.queryClient.ensureQueryData(...)` for the data needed above the
  fold, and returns `{ metadata }` built by the page's existing
  `generateMetadata` logic. `head: ({ loaderData }) => metadataToHead(loaderData.metadata)`.
- `notFound()` / `redirect()` / `permanentRedirect()` from `next/navigation`
  still work (the shim throws the TanStack equivalents) in loaders and in
  components.
- `searchParams` → `Route.useSearch()` (route uses `validateSearch` that
  passes the raw record through). `params` → `Route.useParams()`.
- Next route handlers (`route.ts`) become server routes:
  `export const Route = createFileRoute("/api/x")({ server: { handlers: { GET: ({ request }) => GET(request) } } })`,
  reusing the existing handler functions. `NextRequest`/`NextResponse`
  come from the `next/server` shim.

## Next APIs and their shims

| Import | Behaviour in web-start |
|---|---|
| `next/link` | TanStack `<Link>` for internal paths, `<a>` otherwise; `prefetch` maps to intent preloading |
| `next/navigation` | `useRouter`, `usePathname`, `useSearchParams`, `useParams`, `redirect`, `permanentRedirect`, `notFound`, `useSelectedLayoutSegment(s)` |
| `next/image` | `<img>` with the same props (`fill`, `sizes`, `priority`) |
| `next/dynamic` | `React.lazy`; `ssr: false` renders only after mount |
| `next/headers` | `headers()` / `cookies()` from the current request (server only) |
| `next/server` | `NextRequest`, `NextResponse`, `after`, `connection` (no-op) |
| `next/cache` | `revalidateTag`/`revalidatePath`/`updateTag`/`refresh` purge the edge cache key; `unstable_cache`/`cacheLife`/`cacheTag` are pass-throughs |
| `next/script` | `<script>` with `strategy` handled after hydration |
| `next/og` | `ImageResponse` from `workers-og` |
| `next-intl`, `next-intl/server` | `use-intl` with the request locale |
| `@/i18n/navigation` | locale-aware `Link`, `redirect`, `usePathname`, `useRouter` built on TanStack |

## Checks every ported route must pass

- `pnpm --filter @phaseo/web-start typecheck`
- The page renders the same visible text as `apps/web` for an anonymous
  visitor (`scripts/parity-check.mjs <path>`), with no console errors and
  no hydration warnings.
