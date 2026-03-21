import Link from "next/link";
import AuthErrorMessage from "./AuthErrorMessage";
import { DEFAULT_AUTH_ERROR_MESSAGE, normalizeAuthErrorMessage } from "@/lib/auth/errorMessage";

type AuthErrorPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
    const params = (await searchParams) ?? {};
    const rawMessage = Array.isArray(params.message) ? params.message[0] : params.message;
    const initialMessage = normalizeAuthErrorMessage(rawMessage);
    if (rawMessage && initialMessage !== DEFAULT_AUTH_ERROR_MESSAGE) {
        console.error("Auth error page query message", {
            message: initialMessage,
        });
    }

    return (
        <main className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
                <h1 className="text-lg font-semibold">Authentication failed</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    <AuthErrorMessage initialMessage={initialMessage} />
                </p>
                <div className="mt-4">
                    <Link className="text-sm underline underline-offset-4" href="/sign-in">
                        Back to sign in
                    </Link>
                </div>
            </div>
        </main>
    );
}
