import { createClient } from "@supabase/supabase-js";
import type { Env } from "@/env";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization")?.trim();
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}

export async function requireUser(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const token = bearerToken(request);
  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  if (!token || !url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? null };
}
