import { Tabs } from "expo-router";
import { Activity, Bot, Home, MessageSquare, UserRound } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "@/components/ui";
import { icon, font } from "@/theme";

const tabs = [
  ["index", "Home", Home], ["models", "Models", Bot], ["chat", "Chat", MessageSquare], ["activity", "Activity", Activity], ["account", "Account", UserRound]
] as const;
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const p = usePalette();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: p.text, tabBarInactiveTintColor: p.muted, headerShadowVisible: false, tabBarStyle: { backgroundColor: p.bg, borderTopColor: p.border, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) }, tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 10 } }}>
    {tabs.map(([name, title, Icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color }) => <Icon color={color} size={icon.nav} strokeWidth={icon.stroke} /> }} />)}
  </Tabs>;
}
