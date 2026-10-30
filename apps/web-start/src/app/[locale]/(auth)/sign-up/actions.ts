'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { resolveAuthCallbackUrl } from '@/lib/auth/authOrigin'
import { sanitizeReturnUrl } from '@/lib/auth/return-url'
import { buildLocalizedAuthPath, readAuthLocale } from '@/lib/auth/localized-paths'
import type { PublicLocale } from '@/i18n/routing'

const OAUTH_PROVIDERS = ['google', 'github', 'gitlab'] as const

function buildCallbackPath(params: {
	returnUrl?: string
	type?: 'email'
	locale: PublicLocale
}) {
	const url = new URL('/auth/callback', 'http://localhost')
	if (params.returnUrl) url.searchParams.set('returnUrl', params.returnUrl)
	if (params.type) url.searchParams.set('type', params.type)
	url.searchParams.set('locale', params.locale)
	return `${url.pathname}${url.search}`
}

export async function handleOAuthRedirect(formData: FormData) {
	const locale = readAuthLocale(formData)
	const supabase = await createClient()
	const provider = String(formData.get('provider') ?? 'google').toLowerCase()
	if (!(OAUTH_PROVIDERS as readonly string[]).includes(provider)) {
		redirect(buildLocalizedAuthPath(locale, '/error', { code: 'default' }))
	}
	const returnUrl = sanitizeReturnUrl(formData.get('returnUrl'), '/')
	const safeReturnUrl = returnUrl === '/' ? undefined : returnUrl
	const redirectTo = await resolveAuthCallbackUrl(safeReturnUrl, locale)

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
		redirect(buildLocalizedAuthPath(locale, '/error', { code: 'default' }))
	}
	redirect(data.url as any)
}

export async function handleEmailSignup(formData: FormData) {
	const locale = readAuthLocale(formData)
	const supabase = await createClient()
	const email = String(formData.get('email') ?? '')
	const password = String(formData.get('password') ?? '')
	const returnUrl = sanitizeReturnUrl(formData.get('returnUrl'), '/')
	const safeReturnUrl = returnUrl === '/' ? undefined : returnUrl
	const callbackUrl = await resolveAuthCallbackUrl(safeReturnUrl, locale)

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
				buildLocalizedAuthPath(locale, '/sign-in', {
					signup: 'check-email',
					returnUrl: safeReturnUrl,
				})
			)
		}
		redirect(buildLocalizedAuthPath(locale, '/error', { code: 'default' }))
	}

	if (data?.session) {
		redirect(buildCallbackPath({ returnUrl: safeReturnUrl, type: 'email', locale }))
	}
	redirect(
		buildLocalizedAuthPath(locale, '/sign-in', {
			signup: 'check-email',
			returnUrl: safeReturnUrl,
		})
	)
}
