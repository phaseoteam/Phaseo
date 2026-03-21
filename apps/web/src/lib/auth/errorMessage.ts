export const DEFAULT_AUTH_ERROR_MESSAGE = 'We could not complete the sign-in flow. Please try again.'

export function normalizeAuthErrorMessage(message: string | null | undefined): string {
    const trimmed = String(message ?? '').trim()
    if (!trimmed) return DEFAULT_AUTH_ERROR_MESSAGE
    return trimmed.slice(0, 240)
}

export function buildAuthErrorRedirectUrl(requestUrl: string, message?: string | null): URL {
    const url = new URL('/error', requestUrl)
    url.searchParams.set('message', normalizeAuthErrorMessage(message))
    return url
}

function mapKnownAuthError(params: URLSearchParams): string | null {
    const errorDescription = params.get('error_description')
    if (errorDescription) return normalizeAuthErrorMessage(errorDescription)

    const errorCode = params.get('error_code')
    if (errorCode === 'otp_expired') {
        return 'Your sign-in link has expired. Please try signing in again.'
    }

    const error = params.get('error')
    if (error === 'access_denied') {
        return 'Google sign-in was cancelled or denied. Please try again.'
    }

    return null
}

export function resolveCallbackErrorMessage(url: URL): string | null {
    return mapKnownAuthError(url.searchParams)
}

export function resolveHashAuthErrorMessage(hash: string): string | null {
    const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash
    if (!normalizedHash) return null
    return mapKnownAuthError(new URLSearchParams(normalizedHash))
}
