'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { cookies, headers } from 'next/headers'

const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 180, // 6 months
}

function stripTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '')
}

function configuredAuthOrigins(): string[] {
    const candidates = [
        String(process.env.NEXT_PUBLIC_WEBSITE_URL ?? '').trim(),
        String(process.env.WEBSITE_URL ?? '').trim(),
    ]
        .map((value) => stripTrailingSlash(value))
        .filter(Boolean)
    return [...new Set(candidates)]
}

async function resolveAuthOrigin(): Promise<string> {
    const configuredOrigins = configuredAuthOrigins()
    const isDev = process.env.NODE_ENV !== 'production'

    if (!isDev) {
        if (configuredOrigins.length > 0) return configuredOrigins[0]!
        throw new Error(
            'NEXT_PUBLIC_WEBSITE_URL (or WEBSITE_URL) must be set for auth redirects in production.'
        )
    }

    const headerStore = await headers()
    const originHeader = headerStore.get('origin')?.trim()
    const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')
    const fallbackProto = 'http'
    const hostOrigin = host ? `${fallbackProto}://${host}` : null

    if (
        originHeader &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(originHeader)
    ) {
        return stripTrailingSlash(originHeader)
    }
    if (hostOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostOrigin)) {
        return stripTrailingSlash(hostOrigin)
    }

    return 'http://localhost:3000'
}

export async function handleOAuthRedirect(formData: FormData) {
    const supabase = await createClient()
    const provider = String(formData.get('provider') ?? 'google').toLowerCase()
    const authOrigin = await resolveAuthOrigin()
    const callbackBase = `${authOrigin}/auth/callback`;
    const redirectTo = callbackBase;

    // Provisional hint; callback will overwrite with the authoritative provider if needed
    await (await cookies()).set('auth_provider', provider, cookieOpts)

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: { redirectTo },
    })

    if (error || !data?.url) redirect('/error?message=Authentication failed')
    redirect(data.url as any)
}

export async function handleEmailSignup(formData: FormData) {
    const supabase = await createClient()
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')
    const authOrigin = await resolveAuthOrigin()
    const callbackBase = `${authOrigin}/auth/callback`;
    const callbackUrl = callbackBase;

    // Supabase signUp may return "User already registered" for duplicate emails.
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl },
    })
    if (error) {
        const message = (error.message ?? '').toLowerCase()
        if (message.includes('already registered') || message.includes('already exists')) {
            redirect('/sign-in?signup=exists')
        }
        redirect(`/error?message=${encodeURIComponent(error.message || 'Authentication failed')}`)
    }

    // Only remember the method, not the identifier
    await (await cookies()).set('auth_provider', 'email', cookieOpts)

    if (data?.session) {
        redirect(`${callbackUrl}?type=email`)
    }
    redirect('/sign-in?signup=check-email')
}
