import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/better-auth/server";

// Better Auth reads and writes Postgres through `pg`, which needs Node, and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler((request: Request) => getAuth().handler(request));
