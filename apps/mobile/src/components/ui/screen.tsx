import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";
import { Text } from "./text";

/** Page background with the top safe area applied. Bottom insets are left to scroll content and the tab bar. */
export function Screen({ children, className, edges = ["top"] }: { children: ReactNode; className?: string; edges?: ("top" | "bottom")[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View className={cn("flex-1 bg-background", className)} style={{ paddingTop: edges.includes("top") ? insets.top : 0, paddingBottom: edges.includes("bottom") ? insets.bottom : 0 }}>
      {children}
    </View>
  );
}

/**
 * Screen title row. `back` shows a back arrow when there is somewhere to go back to;
 * `large` uses the page-title size for tab roots.
 */
export function Header({ title, subtitle, back, large, leading, right, className }: { title?: string; subtitle?: string | null; back?: boolean; large?: boolean; leading?: ReactNode; right?: ReactNode; className?: string }) {
  const router = useRouter();
  const showBack = back && router.canGoBack();
  return (
    <View className={cn("flex-row items-center gap-1 px-2", large ? "min-h-14 pt-2" : "min-h-12", className)}>
      {showBack ? <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} /> : <View className="w-2" />}
      {leading ? <View className="mr-1.5">{leading}</View> : null}
      <View className="flex-1">
        {title ? <Text variant={large ? "title" : "heading"} numberOfLines={1}>{title}</Text> : null}
        {subtitle ? <Text variant="caption" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
}

/** Centred column for wide screens so long pages don't stretch edge to edge. */
export function ReadableWidth({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("w-full max-w-[760px] self-center", className)}>{children}</View>;
}
