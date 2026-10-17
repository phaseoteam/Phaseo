import "react-native-gesture-handler";
import { Stack, ThemeProvider } from "expo-router";
import { NavigationBar } from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useFonts } from "expo-font";
import { AppProviders, useAuth } from "@/providers/AppProviders";
import { LoadingScreen } from "@/components/LoadingScreen";
import { NotificationObserver } from "@/components/NotificationObserver";
import { ThemePreferenceProvider, useResolvedDark, useThemePreference } from "@/providers/ThemePreference";
import { colour, navigationTheme } from "@/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return <AppProviders><ThemePreferenceProvider><RootChrome /></ThemePreferenceProvider></AppProviders>;
}

function RootChrome() {
  const dark = useResolvedDark();
  const { ready: themeReady } = useThemePreference();
  const { ready: authReady } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Montserrat: require("../assets/Montserrat-Regular.ttf"),
    MontserratSemiBold: require("../assets/Montserrat-SemiBold.ttf"),
    MontserratBold: require("../assets/Montserrat-Bold.ttf")
  });
  const ready = themeReady && authReady && (fontsLoaded || Boolean(fontError));
  const background = dark ? colour.black : colour.white;
  useEffect(() => { void SystemUI.setBackgroundColorAsync(background); }, [background]);
  useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);
  return <ThemeProvider value={navigationTheme(dark)}><StatusBar style={dark ? "light" : "dark"} />{Platform.OS === "android" ? <NavigationBar style={dark ? "light" : "dark"} /> : null}{ready ? <><NotificationObserver /><Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: "minimal" }}><Stack.Screen name="(tabs)" /><Stack.Screen name="model/[id]" /><Stack.Screen name="sign-in" /></Stack></> : <LoadingScreen />}</ThemeProvider>;
}
