'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { resolveAuthCallbackUrl } from '@/lib/auth/authOrigin'
import { sanitizeReturnUrl } from '@/lib/auth/return-url'

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

function buildRedirect(pathname: string, params: Record<string, string | undefined>) {
	const url = new URL(pathname, 'http://localhost')
	for (const [key, value] of Object.entries(params)) {
		if (value) url.searchParams.set(key, value)
	}
	return `${url.pathname}${url.search}`
}

function buildCallbackPath(params: {
	returnUrl?: string
	type?: 'email'
}) {
	const url = new URL('/auth/callback', 'http://localhost')
	if (params.returnUrl) url.searchParams.set('returnUrl', params.returnUrl)
	if (params.type) url.searchParams.set('type', params.type)
	return `${url.pathname}${url.search}`
}

export async function handleOAuthRedirect(formData: FormData) {
	const supabase = await createClient()
	const provider = String(formData.get('provider') ?? 'google').toLowerCase()
	const returnUrl = sanitizeReturnUrl(formData.get('returnUrl'), '/')
	const safeReturnUrl = returnUrl === '/' ? undefined : returnUrl
	const redirectTo = await resolveAuthCallbackUrl(safeReturnUrl)

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
	const returnUrl = sanitizeReturnUrl(formData.get('returnUrl'), '/')
	const safeReturnUrl = returnUrl === '/' ? undefined : returnUrl
	const callbackUrl = await resolveAuthCallbackUrl(safeReturnUrl)

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
			// Keep outward response identical to avoid account enumeration.
			redirect(
				buildRedirect('/sign-in', {
					signup: 'check-email',
					returnUrl: safeReturnUrl,
				})
			)
		}
		redirect(`/error?message=${encodeURIComponent(error.message || 'Authentication failed')}`)
	}

	await setAuthProviderCookie('email')

	if (data?.session) {
		redirect(buildCallbackPath({ returnUrl: safeReturnUrl, type: 'email' }))
	}
	redirect(
		buildRedirect('/sign-in', {
			signup: 'check-email',
			returnUrl: safeReturnUrl,
		})
	)
}
