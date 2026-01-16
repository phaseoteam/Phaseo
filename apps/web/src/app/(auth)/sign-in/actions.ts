// app/(auth)/sign-in/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

const cookieOpts = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 180, // 6 months
};

export async function handleOAuthRedirect(formData: FormData) {
    const supabase = await createClient();
    const provider = String(formData.get("provider") ?? "google").toLowerCase();

    // Provisional hint; callback will overwrite with the authoritative provider if needed
    await (await cookies()).set("auth_provider", provider, cookieOpts);

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_WEBSITE_URL}/auth/callback` },
    });

    if (error || !data?.url) redirect("/error?message=Authentication failed");
    redirect(data.url as any);
}

export async function handlePasswordSignIn(formData: FormData) {
    const supabase = await createClient();
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect("/error?message=Authentication failed");

    // Only remember the method, not the identifier
    await (await cookies()).set("auth_provider", "email", cookieOpts);

    redirect(`${process.env.NEXT_PUBLIC_WEBSITE_URL}/auth/callback?type=email`);
}

export async function forgotPasswordAction(email: string) {
    const supabase = await createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_WEBSITE_URL}/auth/reset-password`,
    });

    if (error) {
        throw new Error('Failed to send password reset email');
    }

    return { success: true };
}
