import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })
    const pathname = request.nextUrl.pathname

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // Keep strict auth-gate behavior for settings pages only.
    if (!user && pathname.startsWith('/settings')) {
        const url = request.nextUrl.clone()
        url.pathname = '/sign-in'
        url.searchParams.set('redirectTo', request.nextUrl.pathname + request.nextUrl.search)
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
