import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { databaseProvider } from '@/lib/db/providers'
import { getSessionUser } from '@/lib/db/session'

type CookieToSet = {
    name: string
    value: string
    options?: CookieOptions
}

type ClientOptions = {
    onSetCookies?: (cookies: CookieToSet[]) => void
    signal?: AbortSignal
}

/**
 * The request's server client: the signed-in user's data access (RLS) plus, under Supabase Auth, `.auth`.
 *
 * DATABASE_PROVIDER=supabase (default): @supabase/ssr's client, unchanged.
 * DATABASE_PROVIDER=planetscale: `.from()`/`.rpc()`/`.schema()` run on PlanetScale as the session's user
 * (getSessionUser, src/lib/db/session.ts), or as anon when signed out. `.auth` is still Supabase Auth's
 * under AUTH_PROVIDER=supabase; under better-auth it throws, and those call sites are listed in
 * src/lib/auth/better-auth/MIGRATION-NOTES.md. `signal` is not applied to PlanetScale queries.
 */
type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function createClient(options?: ClientOptions): Promise<ServerClient> {
    // Same type for the call sites either way; see createPlanetScaleServerClient for what differs at runtime.
    if (databaseProvider() === 'planetscale') return (await createPlanetScaleServerClient(options)) as unknown as ServerClient
    return createSupabaseServerClient(options)
}

async function createSupabaseServerClient(options?: ClientOptions) {
    const cookieStore = await cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            ...(options?.signal ? {
                global: {
                    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
                        ...init,
                        signal: init?.signal
                            ? AbortSignal.any([init.signal, options.signal!])
                            : options.signal,
                    }),
                },
            } : {}),
            auth: { experimental: { passkey: true } },
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet: CookieToSet[]) {
                    options?.onSetCookies?.(cookiesToSet)
                    try {
                        cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}

async function createPlanetScaleServerClient(options?: ClientOptions): Promise<SupabaseClient> {
    const cookieStore = await cookies()
    const session = await getSessionUser({
        headers: await headers(),
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (cookiesToSet) => {
                options?.onSetCookies?.(cookiesToSet)
                try {
                    cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
                } catch {
                    // Server Component: the proxy refreshes sessions.
                }
            },
        },
    })
    const data = session.dataClient()
    const auth = session.supabase?.auth
    if (!auth) return data
    // Data from PlanetScale, `.auth` from Supabase Auth (the compat client's own `.auth` only throws).
    return new Proxy(data, {
        get(target, property) {
            if (property === 'auth') return auth
            const value = Reflect.get(target, property, target)
            return typeof value === 'function' ? value.bind(target) : value
        },
    })
}
