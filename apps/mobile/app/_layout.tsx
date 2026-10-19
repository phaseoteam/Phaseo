import "../global.css";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { OverlayHost, routeSheetOptions } from "@/components/ui";
import { NotificationObserver } from "@/features/notifications/NotificationObserver";
import { useLayout } from "@/hooks/useLayout";
import { AppearanceProvider, useAppearance } from "@/providers/AppearanceProvider";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { WorkspaceProvider } from "@/providers/WorkspaceProvider";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <AppearanceProvider>
            <AuthProvider>
              <QueryProvider>
                <WorkspaceProvider>
                  <RootNavigator />
                </WorkspaceProvider>
              </QueryProvider>
            </AuthProvider>
          </AppearanceProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { resolved, ready: appearanceReady } = useAppearance();
  const { ready: authReady } = useAuth();
  // Sheets are native bottom sheets on phones and centred dialogs on tablets (see RouteSheet).
  const { split } = useLayout();
  const [background, card, text, border, primary] = useCSSVariable(["--color-background", "--color-card", "--color-foreground", "--color-border", "--color-primary"]);
  const ready = appearanceReady && authReady;

  // Navigation surfaces (screen backgrounds during transitions) follow the same tokens as the app.
  const theme = useMemo(() => {
    const base = resolved === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, background: String(background ?? base.colors.background), card: String(card ?? base.colors.card), text: String(text ?? base.colors.text), border: String(border ?? base.colors.border), primary: String(primary ?? base.colors.primary) },
    };
  }, [resolved, background, card, text, border, primary]);

  useEffect(() => {
    if (background) void SystemUI.setBackgroundColorAsync(String(background));
  }, [background]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <NotificationObserver />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="sign-in" options={routeSheetOptions(split, [0.75, 1])} />
        <Stack.Screen name="filters/[kind]" options={routeSheetOptions(split, [0.6, 1])} />
        <Stack.Screen name="sheets/[kind]" options={routeSheetOptions(split, [0.6, 1])} />
        <Stack.Screen name="auth/callback" options={{ presentation: "transparentModal", animation: "fade" }} />
      </Stack>
      <OverlayHost />
    </ThemeProvider>
  );
}
