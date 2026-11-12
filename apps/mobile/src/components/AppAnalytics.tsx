import { useSegments } from "expo-router";
import { useEffect } from "react";
import { analyticsStore, startAppAnalytics, trackAppScreen } from "@/lib/appAnalytics";

export function AppAnalytics() {
  const enabled = analyticsStore.use();
  const segments = useSegments();
  useEffect(() => { startAppAnalytics(); }, []);
  useEffect(() => { if (enabled) trackAppScreen(segments); }, [enabled, segments]);
  return null;
}
