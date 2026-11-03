import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/better-auth/server";
import { authProvider } from "@/lib/db/providers";

// Better Auth reads and writes Postgres through `pg`, which needs Node, and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// While Supabase Auth is selected, Better Auth must not register users or mint sessions, so its endpoints don't exist.
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler((request: Request) =>
	authProvider() === "better-auth" ? getAuth().handler(request) : Promise.resolve(new Response(null, { status: 404 })),
);
