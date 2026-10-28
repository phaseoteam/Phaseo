import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { dialogFrame, type DialogSize } from "./overlay";
import { Screen } from "./screen";

/**
 * A centred dialog over a dimmed backdrop (tablets): rounded-md, up to 560 dp wide and 85% high.
 * Tapping the backdrop closes it; the system Back closes it through the Modal or the route. It shrinks
 * (and its lists scroll) when the keyboard leaves less room than its height.
 */
export function DialogFrame({ children, onClose, size = "fit" }: { children: ReactNode; onClose: () => void; size?: DialogSize }) {
  const window = useWindowDimensions();
  const frame = dialogFrame(window, size);
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="absolute inset-0 bg-black/40" />
      <View pointerEvents="box-none" className="flex-1 items-center justify-center p-6">
        <View accessibilityViewIsModal className="overflow-hidden rounded-md border border-border bg-popover" style={{ width: frame.width, maxHeight: frame.maxHeight, height: frame.height, minHeight: size === "fit" ? 160 : undefined, flexShrink: 1 }}>
          {children}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Content that isn't a short list of options (filters, forms): a bottom drawer on phones, a centred
 * dialog on tablets, where a full-width drawer would stretch across both panes.
 */
export function Sheet({ open, onClose, children, size = "fit", className }: { open: boolean; onClose: () => void; children: ReactNode; size?: DialogSize; className?: string }) {
  const { split } = useLayout();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {split ? (
        <DialogFrame onClose={onClose} size={size}>{children}</DialogFrame>
      ) : (
        <Pressable accessibilityLabel="Close" className="flex-1 justify-end bg-black/40" onPress={onClose}>
          <Pressable className={cn("max-h-[85%] rounded-t-md border-t border-border bg-popover", className)} style={{ paddingBottom: insets.bottom + 12 }} onPress={() => undefined}>
            {children}
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}

/**
 * The body of a route opened as a sheet (sign-in, filters, pickers). Phones keep the native bottom
 * sheet (the stack presents these routes as form sheets); on tablets the stack presents them as
 * transparent modals and this draws the centred dialog.
 */
export function RouteSheet({ children, size = "fit" }: { children: ReactNode; size?: DialogSize }) {
  const { split } = useLayout();
  const router = useRouter();
  if (!split) return <Screen edges={[]} className="bg-popover">{children}</Screen>;
  return <DialogFrame size={size} onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}>{children}</DialogFrame>;
}

/** Stack options for routes drawn with RouteSheet: a native form sheet on phones, a see-through modal on tablets. */
export function routeSheetOptions(split: boolean, detents: number[]) {
  return split
    ? ({ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } } as const)
    : ({ presentation: "formSheet", sheetAllowedDetents: detents, sheetGrabberVisible: true } as const);
}
