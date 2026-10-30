import {
	buildAuthErrorCodeRedirectUrl,
    buildAuthErrorRedirectUrl,
    normalizeAuthErrorMessage,
	resolveCallbackErrorCode,
    resolveCallbackErrorMessage,
	resolveHashAuthErrorCode,
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

    it('maps SSO provider disabled errors to an explicit message', () => {
        const url = new URL('https://example.com/auth/callback?error_code=saml_provider_disabled')
        expect(resolveCallbackErrorMessage(url)).toBe('Enterprise SSO is configured but currently disabled.')
    })

	it("maps provider errors to stable locale-independent codes", () => {
		expect(
			resolveCallbackErrorCode(
				new URL("https://example.com/auth/callback?error=access_denied"),
			),
		).toBe("cancelled");
		expect(resolveHashAuthErrorCode("#error_code=otp_expired")).toBe(
			"expired-link",
		);
	});

	it("builds a localized error redirect without English query copy", () => {
		const redirectUrl = buildAuthErrorCodeRedirectUrl(
			"https://example.com/auth/callback",
			"workspace-setup",
			"ja",
		);

		expect(redirectUrl.pathname).toBe("/ja/error");
		expect(redirectUrl.searchParams.get("code")).toBe("workspace-setup");
		expect(redirectUrl.searchParams.has("message")).toBe(false);
	});

    it('builds an error redirect URL with a sanitized message', () => {
        const redirectUrl = buildAuthErrorRedirectUrl('https://example.com/auth/callback', '  Detailed failure  ')

        expect(redirectUrl.pathname).toBe('/error')
        expect(redirectUrl.searchParams.get('message')).toBe('Detailed failure')
    })
})
