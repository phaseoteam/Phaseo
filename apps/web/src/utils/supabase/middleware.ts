import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canUpgradeCookieAuth } from './cookieAuthRequest'

const ACTIVE_WORKSPACE_COOKIE_NAME = 'activeWorkspaceId'
const ACTIVE_WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export async function updateSession(request: NextRequest) {
    const forwardedHeaders = new Headers(request.headers)
    const responseCookies = new Map<string, {
        name: string
        value: string
        options?: CookieOptions
    }>()
    const pathname = request.nextUrl.pathname

    const finishResponse = (response?: NextResponse) => {
        const nextResponse = response ?? NextResponse.next({
            request: { headers: forwardedHeaders },
        })
        responseCookies.forEach(({ name, value, options }) => {
            nextResponse.cookies.set(name, value, options)
        })
        return nextResponse
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
                    cookiesToSet.forEach((cookie) => {
                        request.cookies.set(cookie.name, cookie.value)
                        responseCookies.set(cookie.name, cookie)
                    })
                },
            },
        }
    )

    const [
        { data: { user } },
        { data: { session } },
    ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
    ])

    if (!user && request.cookies.has(ACTIVE_WORKSPACE_COOKIE_NAME)) {
        request.cookies.delete(ACTIVE_WORKSPACE_COOKIE_NAME)
        responseCookies.set(ACTIVE_WORKSPACE_COOKIE_NAME, {
            name: ACTIVE_WORKSPACE_COOKIE_NAME,
            value: '',
            options: { path: '/', maxAge: 0 },
        })
    }

    if (user && !request.cookies.has(ACTIVE_WORKSPACE_COOKIE_NAME)) {
        const { data: userRow, error } = await supabase
            .from('users')
            .select('default_workspace_id')
            .eq('user_id', user.id)
            .maybeSingle()
        const defaultWorkspaceId = String(userRow?.default_workspace_id ?? '').trim()

        if (error) {
            // eslint-disable-next-line no-console
            console.warn('[workspace-cookie] failed to resolve default workspace', {
                userId: user.id,
                error: error.message,
            })
        } else if (defaultWorkspaceId) {
            const workspaceCookie = {
                name: ACTIVE_WORKSPACE_COOKIE_NAME,
                value: defaultWorkspaceId,
                options: {
                    httpOnly: true,
                    path: '/',
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax' as const,
                    maxAge: ACTIVE_WORKSPACE_COOKIE_MAX_AGE,
                },
            }
            request.cookies.set(workspaceCookie.name, workspaceCookie.value)
            responseCookies.set(workspaceCookie.name, workspaceCookie)
        }
    }

    forwardedHeaders.set('cookie', request.cookies.toString())

    const isPrivateWebApiRequest =
        pathname.startsWith('/api/account/') ||
        pathname.startsWith('/api/chat/') ||
        pathname.startsWith('/api/internal/')
    if (isPrivateWebApiRequest) {
        const activeWorkspaceId = request.cookies.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value
        forwardedHeaders.delete('cookie')
        if (activeWorkspaceId) {
            forwardedHeaders.set(
                'cookie',
                `activeWorkspaceId=${encodeURIComponent(activeWorkspaceId)}`
            )
        }
    }
    if (
        isPrivateWebApiRequest &&
        session?.access_token &&
        canUpgradeCookieAuth(request.headers, request.nextUrl.origin) &&
        !forwardedHeaders.has('authorization')
    ) {
        forwardedHeaders.set('authorization', `Bearer ${session.access_token}`)
    }

    // Keep strict auth-gate behavior for settings pages only.
    if (!user && pathname.startsWith('/settings')) {
        const url = request.nextUrl.clone()
        url.pathname = '/sign-in'
        url.searchParams.set('returnUrl', request.nextUrl.pathname + request.nextUrl.search)
        return finishResponse(NextResponse.redirect(url))
    }

    if (user) {
        const [{ data: factorsData }, { data: aalData }] = await Promise.all([
            supabase.auth.mfa.listFactors(),
            supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ])
        const hasVerifiedFactor = Object.values(factorsData ?? {}).some((factors) =>
            Array.isArray(factors) && factors.some((factor) => factor.status === 'verified')
        )
        const mustVerifyMfa =
            hasVerifiedFactor &&
            aalData?.currentLevel === 'aal1' &&
            aalData?.nextLevel === 'aal2'

        if (mustVerifyMfa && pathname !== '/auth/verify-mfa') {
            const url = request.nextUrl.clone()
            url.pathname = '/auth/verify-mfa'
            url.searchParams.set('returnUrl', pathname + request.nextUrl.search)
            return finishResponse(NextResponse.redirect(url))
        }
    }

    return finishResponse()
}
