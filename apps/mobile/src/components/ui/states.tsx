import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Icon, useToneColor } from "./icon";
import { Text } from "./text";

export function EmptyState({ title, body, icon, action, onAction, className }: { title: string; body?: string; icon?: LucideIcon; action?: string; onAction?: () => void; className?: string }) {
  return (
    <View className={cn("items-center justify-center gap-2 px-8 py-12", className)}>
      {icon ? <View className="mb-1"><Icon icon={icon} tone="muted" size={28} /></View> : null}
      <Text variant="heading" className="text-center">{title}</Text>
      {body ? <Text variant="muted" className="text-center">{body}</Text> : null}
      {action && onAction ? <Button label={action} variant="outline" size="sm" className="mt-3" onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return <EmptyState className={className} title="Couldn't load this" body={message} action={onRetry ? "Try again" : undefined} onAction={onRetry} />;
}

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const color = useToneColor("muted");
  return (
    <View className={cn("items-center justify-center gap-3 py-16", className)}>
      <ActivityIndicator color={color} />
      {label ? <Text variant="muted">{label}</Text> : null}
    </View>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <View className={cn("rounded-md bg-muted", className)} />;
}

export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <View className="gap-5 px-4 py-4">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} className="flex-row items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </View>
        </View>
      ))}
    </View>
  );
}
