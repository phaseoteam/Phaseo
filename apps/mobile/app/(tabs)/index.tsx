import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowRight, Bell, Bot, ChartNoAxesCombined, MessageSquare, TriangleAlert } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ActionButton, EmptyState, PageIntro, Row, Screen, Section, usePalette } from "@/components/ui";
import { getReleases } from "@/lib/api";
import { useAuth } from "@/providers/AppProviders";
import { font, radius, space } from "@/theme";

export default function HomeScreen() {
  const p = usePalette();
  const { session } = useAuth();
  const releases = useQuery({ queryKey: ["releases"], queryFn: getReleases });
  return <Screen headerRight={<Pressable accessibilityLabel="Notifications" hitSlop={8}><Bell color={p.text} size={20} strokeWidth={1.8} /></Pressable>}>
    <ScrollView refreshControl={<RefreshControl refreshing={releases.isRefetching} onRefresh={() => void releases.refetch()} />} contentContainerStyle={styles.content}>
      <PageIntro centered eyebrow="Phaseo Gateway" title="One Platform for Every AI Model" body="Discover trusted model data, route requests through one OpenAI-compatible gateway, and observe cost, reliability, usage, and performance across every provider." />
      <View style={styles.actions}>
        <ActionButton label="Explore Models" variant="outline" icon={ArrowRight} onPress={() => router.navigate("/models")} />
        <ActionButton label="Get API Key" onPress={() => router.navigate("/account")} />
      </View>
      <View style={[styles.divider, { backgroundColor: p.border }]} />
      <View style={styles.gatewayIntro}>
        <Text style={[styles.gatewayTitle, { color: p.text }]}>Open model database, unified gateway</Text>
        <Text style={[styles.gatewayBody, { color: p.muted }]}>Track the ecosystem in the database, then ship through one OpenAI-compatible gateway.</Text>
      </View>
      {!session ? <View style={[styles.callout, { backgroundColor: p.surface, borderColor: p.border }]}><Text style={[styles.calloutTitle, { color: p.text }]}>Your catalogue is ready</Text><Text style={[styles.calloutBody, { color: p.muted }]}>Sign in from Account to add usage, activity and managed chat.</Text></View> : <Section title="Workspace overview"><EmptyState title="Select a workspace" body="Workspace metrics load only after an active workspace has been confirmed." /></Section>}
      <Section title="Quick actions"><Row icon={MessageSquare} title="Start a chat" onPress={() => router.navigate("/chat")} /><Row icon={Bot} title="Browse models" onPress={() => router.navigate("/models")} /><Row icon={ChartNoAxesCombined} title="Inspect usage" onPress={() => router.navigate("/activity")} /><Row icon={TriangleAlert} title="Review errors" onPress={() => router.navigate("/activity")} /></Section>
      <Section title="Model releases">{releases.isError ? <EmptyState title="Releases unavailable" body="No cached release data is available yet." /> : releases.isLoading ? <Text style={[styles.loading, { color: p.muted }]}>Loading releases…</Text> : <Row icon={Bot} title="Latest releases" subtitle="Live release data loaded from Phaseo" onPress={() => router.navigate("/models")} />}</Section>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  actions: { paddingHorizontal: space.lg, marginTop: space.xl, gap: space.sm },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: space.lg, marginTop: space.xxl },
  gatewayIntro: { paddingHorizontal: space.lg, paddingTop: space.xxl, gap: space.sm },
  gatewayTitle: { fontFamily: font.semibold, fontSize: 19, letterSpacing: -0.3, lineHeight: 25 },
  gatewayBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 21 },
  callout: { marginHorizontal: space.lg, marginTop: space.xl, borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  calloutTitle: { fontFamily: font.semibold, fontSize: 15 },
  calloutBody: { fontFamily: font.regular, fontSize: 13, lineHeight: 20 },
  loading: { fontFamily: font.regular, padding: space.lg }
});
