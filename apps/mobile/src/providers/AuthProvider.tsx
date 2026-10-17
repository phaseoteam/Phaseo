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

export type OAuthProvider = "google" | "github";

type AuthValue = {
  session: Session | null;
  ready: boolean;
  configured: boolean;
  signInWithProvider(provider: OAuthProvider): Promise<void>;
  sendEmailLink(email: string): Promise<void>;
  completeSignIn(url: string): Promise<boolean>;
  signOut(): Promise<void>;
};

const notConfigured = async () => {
  throw new Error("Sign-in isn't set up in this build.");
};

const AuthContext = createContext<AuthValue>({
  session: null,
  ready: false,
  configured: false,
  signInWithProvider: notConfigured,
  sendEmailLink: notConfigured,
  completeSignIn: async () => false,
  signOut: async () => undefined,
});

export const useAuth = () => useContext(AuthContext);

// PKCE: the callback carries a one-time `code` that only this device can exchange.
export const supabase = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: secureStorage, flowType: "pkce", autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock },
  })
  : null;

setAccessTokenSource(async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

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
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    // Refresh tokens only while the app is in the foreground; the session itself
    // persists until the user signs out, so they sign in once.
    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
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
    session,
    ready,
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
    async sendEmailLink(email) {
      if (!supabase) return notConfigured();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl() } });
      if (error) throw error;
    },
    async signOut() {
      await Promise.allSettled([...signOutListeners].map((listener) => listener()));
      await supabase?.auth.signOut();
    },
  }), [session, ready, completeSignIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
