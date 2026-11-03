jest.mock('@/lib/db/session', () => ({ getSessionUser: jest.fn() }))

import { NextRequest } from 'next/server'
import { getSessionUser, type SessionLookup } from '@/lib/db/session'
import { updateSession } from './middleware'

const getSessionUserMock = jest.mocked(getSessionUser)

function lookup(overrides: Partial<SessionLookup> = {}): SessionLookup {
    const maybeSingle = jest.fn().mockResolvedValue({ data: { default_workspace_id: 'workspace-default' }, error: null })
    const dataClient = { from: jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) }
    return {
        provider: 'better-auth',
        user: { id: 'user-1', email: 'a@example.com', mustVerifyMfa: false },
        signedOut: false,
        workerToken: jest.fn().mockResolvedValue('better-auth-jwt'),
        dataClient: () => dataClient as never,
        supabase: null,
        setCookieHeaders: [],
        ...overrides,
    }
}

beforeEach(() => jest.clearAllMocks())

describe('updateSession through getSessionUser (AUTH_PROVIDER-agnostic)', () => {
    it('forwards the Worker token for private web-api requests and appends refreshed session cookies', async () => {
        const session = lookup({ setCookieHeaders: ['better-auth.session_token=new; Path=/; HttpOnly'] })
        getSessionUserMock.mockResolvedValue(session)
        const response = await updateSession(new NextRequest('http://localhost/api/account/settings', {
            headers: { 'sec-fetch-site': 'same-origin' },
        }))
        expect(getSessionUserMock).toHaveBeenCalledWith(expect.objectContaining({ includeMfa: true }))
        expect(response.headers.get('x-middleware-request-authorization')).toBe('Bearer better-auth-jwt')
        expect(response.headers.get('set-cookie')).toContain('better-auth.session_token=new')
        expect(response.cookies.get('activeWorkspaceId')?.value).toBe('workspace-default')
    })

    it('does not mint a Worker token for page requests or cross-site API calls', async () => {
        const session = lookup()
        getSessionUserMock.mockResolvedValue(session)
        await updateSession(new NextRequest('http://localhost/models'))
        await updateSession(new NextRequest('http://localhost/api/account/settings', { headers: { 'sec-fetch-site': 'cross-site' } }))
        expect(session.workerToken).not.toHaveBeenCalled()
    })

    it('sends a session that still owes a second factor to /auth/verify-mfa', async () => {
        getSessionUserMock.mockResolvedValue(lookup({ user: { id: 'user-1', email: null, mustVerifyMfa: true } }))
        const response = await updateSession(new NextRequest('http://localhost/settings/keys'))
        expect(response.headers.get('location')).toContain('/auth/verify-mfa')
    })

    it('clears the workspace cookie only when there is definitely no session', async () => {
        getSessionUserMock.mockResolvedValue(lookup({ user: null, signedOut: true }))
        const signedOut = await updateSession(new NextRequest('http://localhost/models', { headers: { cookie: 'activeWorkspaceId=w' } }))
        expect(signedOut.cookies.get('activeWorkspaceId')?.value).toBe('')

        getSessionUserMock.mockResolvedValue(lookup({ user: null, signedOut: false }))
        const unknown = await updateSession(new NextRequest('http://localhost/models', { headers: { cookie: 'activeWorkspaceId=w' } }))
        expect(unknown.cookies.get('activeWorkspaceId')).toBeUndefined()
    })
})
