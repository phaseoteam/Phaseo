import type { User } from "@supabase/supabase-js";

type Profile = Pick<User, "user_metadata">;

/** The person's name from their sign-in provider; null when it gave none. */
export function profileName(user: Profile): string | null {
  const meta = user.user_metadata ?? {};
  return String(meta.full_name ?? meta.name ?? meta.user_name ?? "").trim() || null;
}

/** Their provider's picture (Google, GitHub, GitLab), when it's an https address. */
export function profileAvatar(user: Profile): string | null {
  const meta = user.user_metadata ?? {};
  const url = meta.avatar_url ?? meta.picture;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}
