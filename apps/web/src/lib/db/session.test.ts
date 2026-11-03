jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }))
jest.mock('@phaseo/db/node', () => ({
    createNodePool: jest.fn(() => ({ on: jest.fn() })),
    createNodeCompatClient: jest.fn((_pool: unknown, options: unknown) => ({ kind: 'planetscale', options })),
}))
jest.mock('@phaseo/db/relationships.json', () => ({ version: 1, schemas: [], tables: {}, foreignKeys: [], functions: {} }))
jest.mock('@/lib/auth/better-auth/server', () => ({ getAuth: jest.fn() }))

import { createServerClient } from '@supabase/ssr'
import { createNodeCompatClient, createNodePool } from '@phaseo/db/node'
import { getAuth } from '@/lib/auth/better-auth/server'
import { authProvider, databaseProvider } from './providers'
import { createServiceDataClient, createUserDataClient, resetWebDbPoolForTests } from './server'
import { getSessionUser } from './session'

const createServerClientMock = jest.mocked(createServerClient)
const getAuthMock = jest.mocked(getAuth)
const ENV_KEYS = ['DATABASE_PROVIDER', 'AUTH_PROVIDER', 'PLANETSCALE_DATABASE_URL'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
    for (const key of ENV_KEYS) {
        if (values[key] === undefined) delete process.env[key]
        else process.env[key] = values[key]
    }
}

const accessToken = (claims: Record<string, unknown>) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`

function supabaseClient(options: { user?: { id: string; email?: string } | null; token?: string; verifiedFactor?: boolean; aal?: string } = {}) {
    const user = options.user === undefined ? { id: 'user-1', email: 'a@example.com' } : options.user
    return {
        auth: {
            getUser: jest.fn().mockResolvedValue({ data: { user } }),
            getSession: jest.fn().mockResolvedValue({ data: { session: user ? { access_token: options.token ?? accessToken({ sub: 'user-1', aal: 'aal1', role: 'authenticated' }) } : null }, error: null }),
            mfa: {
                listFactors: jest.fn().mockResolvedValue({ data: { totp: options.verifiedFactor ? [{ status: 'verified' }] : [] } }),
                getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({ data: { currentLevel: options.aal ?? 'aal1', nextLevel: options.verifiedFactor ? 'aal2' : 'aal1' } }),
            },
        },
        from: jest.fn(),
    }
}

const cookies = { getAll: () => [], setAll: jest.fn() }
const headers = new Headers({ cookie: 'better-auth.session_token=abc' })

beforeEach(() => {
    jest.clearAllMocks()
    resetWebDbPoolForTests()
})

afterAll(() => setEnv(savedEnv as never))

describe('provider switches', () => {
    it('default to supabase and refuse unknown values or Better Auth on Supabase', () => {
        expect(databaseProvider({})).toBe('supabase')
        expect(authProvider({})).toBe('supabase')
        expect(databaseProvider({ DATABASE_PROVIDER: 'planetscale' })).toBe('planetscale')
        expect(() => databaseProvider({ DATABASE_PROVIDER: 'mysql' })).toThrow(/Unknown DATABASE_PROVIDER/)
        expect(() => authProvider({ AUTH_PROVIDER: 'better-auth' })).toThrow(/needs DATABASE_PROVIDER=planetscale/)
        expect(authProvider({ AUTH_PROVIDER: 'better-auth', DATABASE_PROVIDER: 'planetscale' })).toBe('better-auth')
    })
})

describe('PlanetScale data clients', () => {
    it('share one pool of one connection and force the database role', () => {
        setEnv({ DATABASE_PROVIDER: 'planetscale', PLANETSCALE_DATABASE_URL: 'postgres://u:p@db.example:6432/app' })
        createServiceDataClient()
        createUserDataClient({ sub: 'user-1', role: 'admin' })
        createUserDataClient(null)
        expect(createNodePool).toHaveBeenCalledTimes(1)
        expect(createNodePool).toHaveBeenCalledWith({ connectionString: 'postgres://u:p@db.example:6432/app', max: 1, applicationName: 'phaseo-web' })
        const roles = jest.mocked(createNodeCompatClient).mock.calls.map(([, options]) => [options.role, options.claims])
        expect(roles).toEqual([['service_role', undefined], ['authenticated', { sub: 'user-1', role: 'authenticated' }], ['anon', undefined]])
    })

    it('needs PLANETSCALE_DATABASE_URL', () => {
        setEnv({ DATABASE_PROVIDER: 'planetscale' })
        expect(() => createServiceDataClient()).toThrow(/PLANETSCALE_DATABASE_URL/)
    })
})

describe('getSessionUser with Supabase Auth', () => {
    it('reads the user through the cookie client and keeps data on Supabase by default', async () => {
        setEnv({})
        const client = supabaseClient({ verifiedFactor: true })
        createServerClientMock.mockReturnValue(client as never)
        const session = await getSessionUser({ headers, cookies, includeMfa: true })
        expect(session.user).toEqual({ id: 'user-1', email: 'a@example.com', mustVerifyMfa: true })
        expect(session.dataClient()).toBe(client)
        expect(await session.workerToken()).toMatch(/^h\./)
        expect(createNodeCompatClient).not.toHaveBeenCalled()
    })

    it('scopes PlanetScale reads to the verified user under DATABASE_PROVIDER=planetscale', async () => {
        setEnv({ DATABASE_PROVIDER: 'planetscale', PLANETSCALE_DATABASE_URL: 'postgres://db.example:6432/app' })
        createServerClientMock.mockReturnValue(supabaseClient({ token: accessToken({ sub: 'forged', aal: 'aal2', role: 'service_role' }) }) as never)
        const session = await getSessionUser({ headers, cookies })
        expect(session.dataClient()).toEqual({
            kind: 'planetscale',
            options: expect.objectContaining({ role: 'authenticated', claims: expect.objectContaining({ sub: 'user-1', aal: 'aal2', role: 'authenticated' }) }),
        })
    })

    it('reports a request without any session as signed out', async () => {
        setEnv({})
        createServerClientMock.mockReturnValue(supabaseClient({ user: null }) as never)
        const session = await getSessionUser({ headers, cookies })
        expect(session.user).toBeNull()
        expect(session.signedOut).toBe(true)
    })
})

describe('getSessionUser with Better Auth', () => {
    function betterAuth(found: unknown, setCookie: string[] = []) {
        const api = {
            getSession: jest.fn().mockResolvedValue({ headers: { getSetCookie: () => setCookie }, response: found }),
            getToken: jest.fn().mockResolvedValue({ token: 'jwt-for-workers' }),
        }
        getAuthMock.mockReturnValue({ api } as never)
        return api
    }

    beforeEach(() => setEnv({ DATABASE_PROVIDER: 'planetscale', AUTH_PROVIDER: 'better-auth', PLANETSCALE_DATABASE_URL: 'postgres://db.example:6432/app' }))

    it('reads the session from getAuth().api.getSession and mints a Worker JWT only on demand', async () => {
        const api = betterAuth({ session: { id: 'sess-1', aal: 'aal1' }, user: { id: 'user-1', email: 'a@example.com', twoFactorEnabled: false, role: 'admin' } }, ['better-auth.session_token=new; Path=/'])
        const session = await getSessionUser({ headers, cookies, includeMfa: true })
        expect(api.getSession).toHaveBeenCalledWith({ headers, returnHeaders: true })
        expect(createServerClientMock).not.toHaveBeenCalled()
        expect(session.user).toEqual({ id: 'user-1', email: 'a@example.com', mustVerifyMfa: false })
        expect(session.setCookieHeaders).toEqual(['better-auth.session_token=new; Path=/'])
        expect(api.getToken).not.toHaveBeenCalled()
        expect(await session.workerToken()).toBe('jwt-for-workers')
        expect(session.dataClient()).toEqual({
            kind: 'planetscale',
            options: expect.objectContaining({ role: 'authenticated', claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated', aal: 'aal1', session_id: 'sess-1', user_role: 'admin' } }),
        })
    })

    it('applies the MFA rule from aal.ts', async () => {
        betterAuth({ session: { id: 's', aal: 'aal1' }, user: { id: 'u', twoFactorEnabled: true } })
        expect((await getSessionUser({ headers, cookies })).user?.mustVerifyMfa).toBe(true)
        betterAuth({ session: { id: 's', aal: 'aal2' }, user: { id: 'u', twoFactorEnabled: true } })
        expect((await getSessionUser({ headers, cookies })).user?.mustVerifyMfa).toBe(false)
    })

    it('treats no session as signed out, and a failed lookup as unknown', async () => {
        betterAuth(null)
        const none = await getSessionUser({ headers, cookies })
        expect(none.user).toBeNull()
        expect(none.signedOut).toBe(true)
        expect(await none.workerToken()).toBeNull()
        expect(none.dataClient()).toEqual({ kind: 'planetscale', options: expect.objectContaining({ role: 'anon' }) })

        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
        getAuthMock.mockReturnValue({ api: { getSession: jest.fn().mockRejectedValue(new Error('db down')), getToken: jest.fn() } } as never)
        const failed = await getSessionUser({ headers, cookies })
        expect(failed.user).toBeNull()
        expect(failed.signedOut).toBe(false)
        warn.mockRestore()
    })
})
