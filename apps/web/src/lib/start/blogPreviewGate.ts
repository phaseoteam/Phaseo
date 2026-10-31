// Future-dated blog posts are visible to admins only (src/proxy.ts in Next).
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function requestCookies(request: Request): Array<{ name: string; value: string }> {
	return (request.headers.get("cookie") ?? "")
		.split(/;\s*/)
		.flatMap((part) => {
			const eq = part.indexOf("=");
			return eq > 0 ? [{ name: part.slice(0, eq), value: decodeURIComponent(part.slice(eq + 1)) }] : [];
		});
}

export async function canPreviewFutureBlogPost(request: Request): Promise<boolean> {
	if (process.env.NODE_ENV === "development") return true;
	const supabase = createServerClient(process.env.PUBLIC_SUPABASE_URL!, process.env.PUBLIC_SUPABASE_ANON_KEY!, {
		cookies: {
			getAll: () => requestCookies(request),
			setAll: (_cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
				// The session middleware handles cookie refreshes after this gate.
			},
		},
	});
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) return false;
	const { data, error } = await supabase.from("users").select("role").eq("user_id", user.id).maybeSingle();
	return !error && data?.role === "admin";
}
