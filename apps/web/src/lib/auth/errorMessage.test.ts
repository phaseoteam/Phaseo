import {
    buildAuthErrorRedirectUrl,
    normalizeAuthErrorMessage,
    resolveCallbackErrorMessage,
    resolveHashAuthErrorMessage,
} from './errorMessage'

describe('auth error helpers', () => {
    it('normalizes empty messages to the default copy', () => {
        expect(normalizeAuthErrorMessage('   ')).toBe('We could not complete the sign-in flow. Please try again.')
    })

    it('does not expose raw provider descriptions from query params', () => {
        const url = new URL('https://example.com/auth/callback?error=server_error&error_description=Database+error+saving+new+user')

        expect(resolveCallbackErrorMessage(url)).toBe('We could not complete the sign-in flow. Please try again.')
    })

    it('reads auth errors from URL fragments', () => {
        expect(resolveHashAuthErrorMessage('#error=server_error&error_description=Database+error+saving+new+user')).toBe(
            'We could not complete the sign-in flow. Please try again.'
        )
    })

    it('maps access_denied to a provider-agnostic message', () => {
        const url = new URL('https://example.com/auth/callback?error=access_denied')
        expect(resolveCallbackErrorMessage(url)).toBe('Sign-in was cancelled or denied. Please try again.')
    })

    it('builds an error redirect URL with a sanitized message', () => {
        const redirectUrl = buildAuthErrorRedirectUrl('https://example.com/auth/callback', '  Detailed failure  ')

        expect(redirectUrl.pathname).toBe('/error')
        expect(redirectUrl.searchParams.get('message')).toBe('Detailed failure')
    })
})
