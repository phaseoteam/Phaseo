import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function proxy(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        '/settings/:path*',
        '/chat/:path*',
        '/api/chat/:path*',
    ],
}
