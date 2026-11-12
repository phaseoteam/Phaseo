import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { currentRequestCookies, setResponseCookie } from '@/lib/server/currentRequest'

type CookieToSet = {
    name: string
    value: string
    options?: CookieOptions
}

export async function createClient(options?: {
    onSetCookies?: (cookies: CookieToSet[]) => void
    signal?: AbortSignal
}) {
    const requestCookies = currentRequestCookies()

    return createServerClient(
        process.env.PUBLIC_SUPABASE_URL!,
        process.env.PUBLIC_SUPABASE_ANON_KEY!,
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
                    return requestCookies
                },
                setAll(cookiesToSet: CookieToSet[]) {
                    options?.onSetCookies?.(cookiesToSet)
                    try {
                        cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
                            setResponseCookie(name, value, options as never)
                        )
                    } catch {
                        // The response has already started streaming. This can be
                        // ignored: the request middleware refreshes user sessions.
                    }
                },
            },
        }
    )
}
