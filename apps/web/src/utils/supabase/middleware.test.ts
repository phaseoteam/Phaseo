jest.mock('@supabase/ssr', () => ({
    createServerClient: jest.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { updateSession } from './middleware'

const createServerClientMock = jest.mocked(createServerClient)

function createSupabaseClient(defaultWorkspaceId = 'workspace-default') {
    const maybeSingle = jest.fn().mockResolvedValue({
        data: { default_workspace_id: defaultWorkspaceId },
        error: null,
    })
    const eq = jest.fn(() => ({ maybeSingle }))
    const select = jest.fn(() => ({ eq }))
    const from = jest.fn(() => ({ select }))

    return {
        auth: {
            getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
            getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
            mfa: {
                listFactors: jest.fn().mockResolvedValue({ data: {} }),
                getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
                    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
                }),
            },
        },
        from,
    }
}

describe('workspace cookie session initialization', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('sets and forwards the default workspace when the cookie is missing', async () => {
        const supabase = createSupabaseClient()
        createServerClientMock.mockReturnValue(supabase as never)

        const response = await updateSession(new NextRequest('http://localhost/models'))

        expect(supabase.from).toHaveBeenCalledWith('users')
        expect(response.cookies.get('activeWorkspaceId')?.value).toBe('workspace-default')
        expect(response.headers.get('x-middleware-request-cookie')).toContain(
            'activeWorkspaceId=workspace-default',
        )
    })

    it('keeps an existing workspace cookie without resolving the default', async () => {
        const supabase = createSupabaseClient()
        createServerClientMock.mockReturnValue(supabase as never)
        const request = new NextRequest('http://localhost/models', {
            headers: { cookie: 'activeWorkspaceId=workspace-selected' },
        })

        const response = await updateSession(request)

        expect(supabase.from).not.toHaveBeenCalled()
        expect(response.cookies.get('activeWorkspaceId')).toBeUndefined()
        expect(response.headers.get('x-middleware-request-cookie')).toContain(
            'activeWorkspaceId=workspace-selected',
        )
    })
})
