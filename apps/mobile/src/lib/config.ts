import Constants from "expo-constants";
import { resolveSecureOrigin } from "./origins";

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

export const WEB_ORIGIN = resolveSecureOrigin(process.env.EXPO_PUBLIC_PHASEO_ORIGIN ?? extra?.phaseoOrigin, "https://phaseo.app");

const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl;
export const SUPABASE_URL = configuredSupabaseUrl ? resolveSecureOrigin(configuredSupabaseUrl, configuredSupabaseUrl) : undefined;
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? extra?.supabasePublishableKey;

export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
