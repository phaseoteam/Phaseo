import { CircleAlert, CircleCheck, Info, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Sheet } from "./dialog";
import { Icon } from "./icon";
import { closeActions, dismissToast, overlayStore, settleConfirm, type ConfirmRequest, type Toast } from "./overlayStore";
import { ActionMenu } from "./select";
import { Text } from "./text";

/**
 * Draws the app's own confirmations, action menus and toasts (see overlayStore), in place of the
 * system's alert dialogs. Mounted once at the root, above every screen.
 */
export function OverlayHost() {
  const { confirm, menu, toasts } = overlayStore.use();
  return (
    <>
      <ActionMenu open={Boolean(menu?.open)} title={menu?.title} actions={menu?.actions ?? []} anchor={menu?.anchor} onClose={closeActions} />
      <Sheet open={Boolean(confirm?.open)} onClose={() => settleConfirm(false)}>
        {confirm ? <ConfirmBody request={confirm} /> : null}
      </Sheet>
      <ToastStack toasts={toasts} />
    </>
  );
}

/** One confirmation: title, a sentence, then Cancel and the action (red when destructive). */
function ConfirmBody({ request }: { request: ConfirmRequest }) {
  const { split } = useLayout();
  return (
    <View accessibilityRole="alert" className={split ? "p-5" : "px-4 pb-1 pt-5"}>
      <Text variant="heading">{request.title}</Text>
      {request.body ? <Text variant="muted" className="mt-1.5">{request.body}</Text> : null}
      {split ? (
        <View className="mt-6 flex-row justify-end gap-2">
          <Button label={request.cancelLabel} variant="outline" size="sm" onPress={() => settleConfirm(false)} />
          <Button label={request.confirmLabel} variant={request.destructive ? "danger" : "primary"} size="sm" onPress={() => settleConfirm(true)} />
        </View>
      ) : (
        <View className="mt-5 gap-2">
          <Button label={request.confirmLabel} variant={request.destructive ? "danger" : "primary"} onPress={() => settleConfirm(true)} />
          <Button label={request.cancelLabel} variant="outline" onPress={() => settleConfirm(false)} />
        </View>
      )}
    </View>
  );
}

const TOAST_ICONS = { neutral: { icon: Info, tone: "muted" }, success: { icon: CircleCheck, tone: "success" }, error: { icon: CircleAlert, tone: "destructive" } } as const;

/** Toasts sit under the status bar, so the keyboard and the composer never hide them. */
function ToastStack({ toasts }: { toasts: Toast[] }) {
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-0 items-center gap-2 px-3" style={{ paddingTop: insets.top + 8 }}>
      {toasts.map((entry) => {
        const meta = TOAST_ICONS[entry.tone];
        return (
          // Reanimated views take styles only; the themed box is a core View inside.
          <Animated.View key={entry.id} entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(160)} style={{ width: "100%", maxWidth: 480 }}>
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className={cn("flex-row items-start gap-2.5 rounded-md border bg-popover py-3 pl-3.5 pr-2", entry.tone === "error" ? "border-destructive/40" : "border-border")}
              style={{ elevation: 6, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
            >
              <View className="pt-0.5"><Icon icon={meta.icon} tone={meta.tone} size={17} /></View>
              <View className="flex-1">
                {entry.title ? <Text variant="label">{entry.title}</Text> : null}
                <Text variant={entry.title ? "muted" : "small"} className={entry.title ? "mt-0.5 text-[13px] leading-[18px]" : "font-medium"}>{entry.message}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={() => dismissToast(entry.id)} className="h-6 w-6 items-center justify-center rounded-md active:bg-accent">
                <Icon icon={X} tone="muted" size={14} />
              </Pressable>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
