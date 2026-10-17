import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-url-polyfill/auto";
import { createClient, processLock, type Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import { resolveSecureOrigin } from "@/lib/origins";
import { secureKey } from "@/lib/secureKey";

type OAuthProvider = "google" | "github";
type AuthValue = {
  session: Session | null;
  ready: boolean;
  signInWithEmail(email: string): Promise<void>;
  signInWithProvider(provider: OAuthProvider): Promise<void>;
  signOut(): Promise<void>;
};
const unavailable = async () => { throw new Error("Supabase is not configured for this build."); };
const AuthContext = createContext<AuthValue>({ session: null, ready: false, signInWithEmail: unavailable, signInWithProvider: unavailable, signOut: async () => undefined });
export const useAuth = () => useContext(AuthContext);
WebBrowser.maybeCompleteAuthSession();

const extras = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extras?.supabaseUrl;
const supabaseUrl = configuredSupabaseUrl
  ? resolveSecureOrigin(configuredSupabaseUrl, configuredSupabaseUrl)
  : undefined;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? extras?.supabasePublishableKey
  ?? extras?.supabaseAnonKey;
const storage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key)
};
export const supabase = supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey, {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock }
}) : null;

const queryCacheKey = "phaseo.react-query-cache";
const queryCacheMaxAge = 1000 * 60 * 60 * 24;
const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: queryCacheKey,
  throttleTime: 2000
});
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60 * 5, gcTime: queryCacheMaxAge, retry: 1, networkMode: "offlineFirst" } } });

export function AppProviders({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const listener = supabase?.auth.onAuthStateChange((_event, next) => setSession(next));
    const finishSignIn = async (url: string | null) => {
      if (!url || !supabase) return;
      const code = Linking.parse(url).queryParams?.code;
      if (typeof code === "string") await supabase.auth.exchangeCodeForSession(code);
    };
    void Linking.getInitialURL().then(finishSignIn);
    const linking = Linking.addEventListener("url", ({ url }) => { void finishSignIn(url); });
    const appState = AppState.addEventListener("change", state => state === "active" ? supabase?.auth.startAutoRefresh() : supabase?.auth.stopAutoRefresh());
    return () => { listener?.data.subscription.unsubscribe(); linking.remove(); appState.remove(); };
  }, []);
  const value = useMemo<AuthValue>(() => ({ session, ready,
    signInWithEmail: async email => {
      if (!supabase) return unavailable();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: Linking.createURL("auth/callback") } });
      if (error) throw error;
    },
    signInWithProvider: async provider => {
      if (!supabase) return unavailable();
      const redirectTo = Linking.createURL("auth/callback");
      const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      if (!data.url) throw new Error("The sign-in provider did not return an authorization URL.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") throw new Error("Sign-in was cancelled before it completed.");
      const code = Linking.parse(result.url).queryParams?.code;
      if (typeof code !== "string") throw new Error("The sign-in callback did not include an authorization code.");
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw exchanged.error;
    },
    signOut: async () => {
    await supabase?.auth.signOut();
    await Promise.all([secureKey.clear(), AsyncStorage.multiRemove(["phaseo.workspace", "phaseo.private-cache"])]);
    queryClient.clear();
    await queryPersister.removeClient();
  } }), [session, ready]);
  return <PersistQueryClientProvider client={queryClient} persistOptions={{
    persister: queryPersister,
    maxAge: queryCacheMaxAge,
    buster: "mobile-catalog-v2",
    dehydrateOptions: { shouldDehydrateQuery: query => query.state.status === "success" && query.queryKey[0] !== "usage" }
  }}><AuthContext.Provider value={value}>{children}</AuthContext.Provider></PersistQueryClientProvider>;
}
