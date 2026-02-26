'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 180, // 6 months
}

export async function handleOAuthRedirect(formData: FormData) {
    const supabase = await createClient()
    const provider = String(formData.get('provider') ?? 'google').toLowerCase()

    // Provisional hint; callback will overwrite with the authoritative provider if needed
    await (await cookies()).set('auth_provider', provider, cookieOpts)

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_WEBSITE_URL}/auth/callback` },
    })

    if (error || !data?.url) redirect('/error?message=Authentication failed')
    redirect(data.url as any)
}

export async function handleEmailSignup(formData: FormData) {
    const supabase = await createClient()
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')
    const callbackUrl = `${process.env.NEXT_PUBLIC_WEBSITE_URL}/auth/callback`

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
