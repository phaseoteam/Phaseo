import "react-native-url-polyfill/auto";
import { createClient, processLock, type Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import { setAccessTokenSource } from "@/lib/api/http";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/config";
import { secureStorage } from "@/lib/storage";

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = "google" | "github" | "gitlab";

type AuthValue = {
  /** Null until the user is fully signed in, including their second factor. */
  session: Session | null;
  /** Signed in with a password or provider, but their authenticator code is still needed. */
  mfaPending: boolean;
  ready: boolean;
  configured: boolean;
  signInWithProvider(provider: OAuthProvider): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  verifyMfa(code: string): Promise<void>;
  completeSignIn(url: string): Promise<boolean>;
  signOut(): Promise<void>;
};

const notConfigured = async () => {
  throw new Error("Sign-in isn't set up in this build.");
};

const AuthContext = createContext<AuthValue>({
  session: null,
  mfaPending: false,
  ready: false,
  configured: false,
  signInWithProvider: notConfigured,
  signInWithPassword: notConfigured,
  verifyMfa: notConfigured,
  completeSignIn: async () => false,
  signOut: async () => undefined,
});

export const useAuth = () => useContext(AuthContext);

// PKCE: the provider callback carries a one-time `code` that only this device can exchange.
export const supabase = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: secureStorage, flowType: "pkce", autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock },
  })
  : null;

// While an authenticator code is pending the session is only first-factor, so no
// API call may use it; the website enforces the same step before its dashboard.
let secondFactorPending = false;

setAccessTokenSource(async () => {
  if (!supabase || secondFactorPending) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

/** The verified authenticator factor to challenge, if this session still needs one. */
async function pendingFactor(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!data || data.nextLevel !== "aal2" || data.currentLevel === "aal2") return null;
  const factors = await supabase.auth.mfa.listFactors();
  return factors.data?.totp.find((factor) => factor.status === "verified")?.id ?? null;
}

/** Plain-language messages for Supabase auth errors (their raw text can be a JSON dump). */
export function authErrorMessage(error: unknown): string {
  const source = error as { code?: string; status?: number; name?: string; message?: string } | null;
  const code = source?.code ?? "";
  if (code === "invalid_credentials") return "That email and password don't match. Try again, or reset your password on phaseo.app.";
  if (code === "mfa_verification_failed" || code === "mfa_challenge_expired") return "That code didn't work. Check your authenticator app and try again.";
  if (code === "over_request_rate_limit" || source?.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (code === "user_banned") return "This account can't sign in. Contact support@phaseo.app.";
  if (source?.name === "AuthRetryableFetchError" || (source?.status ?? 0) >= 500) return "Phaseo couldn't sign you in right now. Try again shortly.";
  return source?.message && !source.message.trim().startsWith("{") ? source.message : "Sign-in didn't work. Try again.";
}

const callbackUrl = () => Linking.createURL("auth/callback");
const exchanges = new Map<string, Promise<boolean>>();

type SignOutListener = () => void | Promise<void>;
const signOutListeners = new Set<SignOutListener>();

/** Lets other features clear their own state (caches, push registration) on sign-out. */
export function onSignOut(listener: SignOutListener) {
  signOutListeners.add(listener);
  return () => { signOutListeners.delete(listener); };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<{ session: Session | null; factorId: string | null; ready: boolean }>({ session: null, factorId: null, ready: !supabase });

  useEffect(() => {
    if (!supabase) return;
    let latest = 0;
    const apply = async (next: Session | null) => {
      const run = ++latest;
      const factorId = next ? await pendingFactor() : null;
      if (run !== latest) return;
      secondFactorPending = Boolean(factorId);
      setState({ session: next, factorId, ready: true });
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { void apply(next); });
    // Refresh tokens only while the app is in the foreground; the session itself
    // persists until the user signs out, so they sign in once.
    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      listener.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  const completeSignIn = useCallback(async (url: string) => {
    if (!supabase) return false;
    const params = Linking.parse(url).queryParams ?? {};
    const code = typeof params.code === "string" ? params.code : null;
    if (!code) {
      const description = typeof params.error_description === "string" ? params.error_description : null;
      if (description) throw new Error(description);
      return false;
    }
    // Android hands the redirect both to the auth session and to the router as a
    // deep link; a code can only be exchanged once, so both callers share one exchange.
    let exchange = exchanges.get(code);
    if (!exchange) {
      exchange = supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) throw error;
        return true;
      });
      exchanges.set(code, exchange);
    }
    return exchange;
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session: state.factorId ? null : state.session,
    mfaPending: Boolean(state.factorId),
    ready: state.ready,
    configured: Boolean(supabase),
    completeSignIn,
    async signInWithProvider(provider) {
      if (!supabase) return notConfigured();
      const redirectTo = callbackUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      if (!data.url) throw new Error("Sign-in didn't start. Try again.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") return;
      await completeSignIn(result.url);
    },
    async signInWithPassword(email, password) {
      if (!supabase) return notConfigured();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async verifyMfa(code) {
      if (!supabase || !state.factorId) return;
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code });
      if (error) throw error;
    },
    async signOut() {
      await Promise.allSettled([...signOutListeners].map((listener) => listener()));
      await supabase?.auth.signOut();
    },
  }), [state, completeSignIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
