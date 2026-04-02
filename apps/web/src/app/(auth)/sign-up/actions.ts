'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { resolveAuthCallbackUrl } from '@/lib/auth/authOrigin'

const cookieOpts = {
	path: '/',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax' as const,
	maxAge: 60 * 60 * 24 * 180, // 6 months
}

async function setAuthProviderCookie(provider: string): Promise<void> {
	await (await cookies()).set('auth_provider', provider, cookieOpts)
}

export async function handleOAuthRedirect(formData: FormData) {
	const supabase = await createClient()
	const provider = String(formData.get('provider') ?? 'google').toLowerCase()
	const redirectTo = await resolveAuthCallbackUrl(formData.get('returnUrl'))

	await setAuthProviderCookie(provider)

	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: provider as any,
		options: { redirectTo },
	})

	if (error || !data?.url) {
		console.error('OAuth redirect initialization failed', {
			provider,
			message: error?.message ?? null,
			status: (error as { status?: number } | null)?.status ?? null,
			code: (error as { code?: string } | null)?.code ?? null,
		})
		redirect('/error?message=Authentication failed')
	}
	redirect(data.url as any)
}

export async function handleEmailSignup(formData: FormData) {
	const supabase = await createClient()
	const email = String(formData.get('email') ?? '')
	const password = String(formData.get('password') ?? '')
	const callbackUrl = await resolveAuthCallbackUrl(formData.get('returnUrl'))

	// Supabase signUp may return "User already registered" for duplicate emails.
	const { data, error } = await supabase.auth.signUp({
		email,
		password,
		options: { emailRedirectTo: callbackUrl },
	})
	if (error) {
		console.error('Email signup failed', {
			message: error.message,
			status: (error as { status?: number }).status,
			code: (error as { code?: string }).code,
			emailDomain: email.includes('@') ? email.split('@')[1] : null,
		})
		const message = (error.message ?? '').toLowerCase()
		if (message.includes('already registered') || message.includes('already exists')) {
			redirect('/sign-in?signup=exists')
		}
		redirect(`/error?message=${encodeURIComponent(error.message || 'Authentication failed')}`)
	}

	await setAuthProviderCookie('email')

	if (data?.session) {
		const callback = new URL(callbackUrl)
		callback.searchParams.set('type', 'email')
		redirect(callback.toString())
	}
	redirect('/sign-in?signup=check-email')
}
