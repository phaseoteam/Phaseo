import type { QueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useIsFocused, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from "react-native";
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring,
  withTiming, type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { useCSSVariable } from "uniwind";
import { Logo, logoTileRadius, logoUri } from "@/components/Logo";
import { Icon, Text, useToneColor } from "@/components/ui";
import { catalogueQuery, useCatalogue } from "@/features/models/state";
import { BUILD_COMMIT, BUILD_NUMBER } from "@/lib/appInfo";
import { APP_VERSION } from "@/lib/config";
import { useAppearance } from "@/providers/AppearanceProvider";
import {
  clamp, COVER_DIM, coverage, deformation, dragTo, holdAt, kick, launch, letGo, LIFT_SCALE, pickUp, ringLayout, stepWorld, throwBody, type Block, type Body, type Box,
  type Point, type World,
} from "./floating";
import { ART_LABS, catalogueFact, LABEL_FADE_MS, LABEL_MS, newestByLab, shortVersion, tapLabel, versionDetail, type ArtLab, type Label } from "./versionArt";

/** The Phaseo mark, from apps/web/public/logo_light.svg (a 64 × 64 view box). */
const MARK_PATH = "M19.8574 56H13V8H19.8574V56ZM31.7197 8C37.9368 8 42.8288 9.4856 46.3945 12.457C49.9601 15.4284 51.7432 19.5201 51.7432 24.7314C51.7432 29.9428 49.9601 34.0344 46.3945 37.0059C42.8288 39.9773 37.9368 41.4629 31.7197 41.4629H23.2852V35.4971H31.5146C35.8573 35.497 39.1714 34.5824 41.457 32.7539C43.7426 30.8796 44.8857 28.2056 44.8857 24.7314C44.8857 21.2572 43.7427 18.6059 41.457 16.7773C39.1714 14.9031 35.8573 13.9659 31.5146 13.9658H23.2852V8H31.7197Z";
/** The mark's tile corners: rounded-md, and the radius the logos collide with, so they touch it where it's drawn. */
const MARK_RADIUS = 8;

/** With reduced motion the burst is a fade out and back, which is allowed to play. */
const FADE_MS = 700;
/** Holding the mark this long opens Higher or lower. */
const HOLD_MS = 1000;
/** A logo held this long without moving lifts, as a dragged one does. */
const LIFT_MS = 220;
/** The lift's spring: up to LIFT_SCALE with a small overshoot. The hold's tick plays once it's this far up. */
const LIFT_SPRING = { damping: 16, stiffness: 300 };
const LIFT_TICK_AT = 0.4;
/** How long a tapped logo's label takes to fade in. */
const LABEL_IN_MS = 140;
const LABEL_WIDTH = 200;
/** Space kept between the logos and the safe area's edges. */
const EDGE = 8;
/** Space kept round the mark and its text where the logos start (and stay, when the system reduces motion). */
const RING_MARGIN = 12;

const VERSION_DETAIL = versionDetail(APP_VERSION, { number: BUILD_NUMBER, commit: BUILD_COMMIT });
const lift = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

/** Starts loading what the art shows (the catalogue and the labs' logos) while the taps are still coming. */
export function prefetchVersionArt(queryClient: QueryClient, theme: "light" | "dark") {
  void queryClient.prefetchQuery(catalogueQuery);
  const uris = ART_LABS.map((lab) => logoUri(lab.id, theme)).filter((uri): uri is string => Boolean(uri));
  void Image.prefetch(uris, "disk").catch(() => false);
}

/**
 * The version art, opened by five quick taps on Account → Version and build, like Android's version screen. The
 * Phaseo mark sits in the middle with the version and a line from the live catalogue, and the frontier labs' logos
 * cruise round it like the DVD screensaver, bouncing off the edges, the mark and each other, and gliding under the
 * text. A logo can be held, dragged and flung (it eases back to the cruise), and a tap shows its lab's newest model.
 * Logos are jelly: they stretch when fast or dragged and squash when they hit something. Tapping the mark kicks every
 * logo outward; holding it for a second opens Higher or lower. With reduced motion the logos stay still, evenly
 * spaced, and the burst is a fade.
 *
 * The motion is one simulation on the UI thread: a single frame callback steps every logo (floating.ts) in one shared
 * value, and each logo's style reads its own slot. It stops while the game is on top or the screen has closed.
 */
export function VersionArtScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const { resolved } = useAppearance();
  const catalogue = useCatalogue();
  const models = catalogue.data?.models;
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  // The middle, measured: the column (in the screen), and the mark and the text in it.
  const [column, setColumn] = useState<Box | null>(null);
  const [markAt, setMarkAt] = useState<Box | null>(null);
  const [textAt, setTextAt] = useState<Box | null>(null);
  const fade = useSharedValue(0);
  const markScale = useSharedValue(1);

  // The frontier labs, a fixed list, so they float straight away; the catalogue only adds each one's newest model.
  const labs = ART_LABS;
  const newest = useMemo(() => newestByLab(models ?? [], catalogue.dataUpdatedAt), [models, catalogue.dataUpdatedAt]);
  const fact = models ? catalogueFact(models) : null;
  const factLine = fact ?? (catalogue.isFetching ? "Counting models…" : "Can't reach the catalogue right now");

  const short = area ? Math.min(area.width, area.height) : 0;
  const tile = Math.round(clamp(short * 0.12, 44, 64));
  const markSize = Math.round(clamp(short * 0.3, 104, 168));
  const bigText = Math.round(clamp(short * 0.22, 76, 132));
  const bounds = useMemo<Box | null>(() => area ? {
    left: insets.left + EDGE,
    top: insets.top + EDGE,
    right: area.width - insets.right - EDGE,
    bottom: area.height - insets.bottom - EDGE,
  } : null, [area, insets.bottom, insets.left, insets.right, insets.top]);
  // Only the mark is solid, exactly as drawn. The text is drawn over the logos, which glide under it, so they can
  // travel all the way round the mark however wide the text is.
  const mark = useMemo<Block | null>(() => (column && markAt ? {
    left: column.left + markAt.left,
    top: column.top + markAt.top,
    right: column.left + markAt.right,
    bottom: column.top + markAt.bottom,
    radius: MARK_RADIUS,
  } : null), [column, markAt]);
  const cover = useMemo<Box | null>(() => (column && textAt ? {
    left: column.left + textAt.left,
    top: column.top + textAt.top,
    right: column.left + textAt.right,
    bottom: column.top + textAt.bottom,
  } : null), [column, textAt]);
  // The logos start clear of the mark and the text (and stay there with reduced motion, so they never hide it).
  const middle = useMemo<Box | null>(() => (column ? {
    left: column.left - RING_MARGIN,
    top: column.top - RING_MARGIN,
    right: column.right + RING_MARGIN,
    bottom: column.bottom + RING_MARGIN,
  } : null), [column]);
  const ring = useMemo(() => (bounds && middle && mark ? ringLayout(labs.length, tile, bounds, middle) : null), [bounds, labs, mark, middle, tile]);

  // The simulation: every logo's position, velocity and jelly in one shared value, and the layout it moves in.
  const bodies = useSharedValue<Body[]>([]);
  const world = useSharedValue<World | null>(null);
  useEffect(() => {
    world.set(bounds && mark ? { size: tile, radius: logoTileRadius(tile), bounds, block: mark, cover } : null);
  }, [bounds, cover, mark, tile, world]);
  // The logos set off from their places once. With reduced motion they sit at their places instead, which move when
  // the screen turns; moving logos are just kept inside by the next step.
  const launched = useRef(false);
  useEffect(() => {
    if (!ring) return;
    if (reduced || !launched.current) bodies.set(launch(ring));
    launched.current = !reduced;
  }, [bodies, reduced, ring]);

  const frame = useFrameCallback((info) => {
    const layout = world.get();
    const current = bodies.get();
    if (!layout || current.length === 0) return;
    bodies.set(stepWorld(current, (info.timeSincePreviousFrame ?? 0) / 1000, layout));
  }, false);
  const running = focused && !reduced && ring != null;
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  }, [frame, running]);

  // A tapped logo's label (tapLabel has the rules). Its fade in, stay and fade out run on the UI thread, so it goes
  // by itself even if React is busy; the state only says which lab it shows and whether screen readers can find it.
  const [label, setLabel] = useState<{ index: number; shown: boolean } | null>(null);
  const labelNow = useRef<Label | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const labelIndex = useSharedValue(-1);
  const labelOpacity = useSharedValue(0);
  const tapLogo = useCallback((index: number) => {
    void Haptics.selectionAsync().catch(() => undefined);
    const next = tapLabel(labelNow.current, index, Date.now());
    labelNow.current = next;
    clearTimeout(labelTimer.current);
    const hide = () => setLabel((current) => (current ? { index: current.index, shown: false } : null));
    // Fades are allowed with reduced motion, so these always play.
    if (!next) {
      labelOpacity.set(withTiming(0, { duration: LABEL_FADE_MS, reduceMotion: ReduceMotion.Never }));
      hide();
      return;
    }
    labelIndex.set(next.index);
    setLabel({ index: next.index, shown: true });
    labelOpacity.set(withSequence(
      ReduceMotion.Never,
      withTiming(1, { duration: LABEL_IN_MS, reduceMotion: ReduceMotion.Never }),
      withDelay(LABEL_MS - LABEL_IN_MS - LABEL_FADE_MS, withTiming(0, { duration: LABEL_FADE_MS, reduceMotion: ReduceMotion.Never }), ReduceMotion.Never),
    ));
    labelTimer.current = setTimeout(() => {
      labelNow.current = null;
      hide();
    }, LABEL_MS);
  }, [labelIndex, labelOpacity]);

  useEffect(() => () => {
    clearTimeout(labelTimer.current);
    cancelAnimation(fade);
    cancelAnimation(markScale);
    cancelAnimation(labelOpacity);
  }, [fade, labelOpacity, markScale]);

  const playBurst = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (reduced) {
      // From the start every time, even if the last fade is still playing.
      cancelAnimation(fade);
      fade.set(0);
      fade.set(withTiming(1, { duration: FADE_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
      return;
    }
    scheduleOnUI(() => {
      "worklet";
      const layout = world.get();
      if (!layout || !layout.block) return;
      const centre = { x: (layout.block.left + layout.block.right) / 2, y: (layout.block.top + layout.block.bottom) / 2 };
      bodies.set(kick(bodies.get(), centre, layout.size));
    });
    markScale.set(withSequence(withTiming(0.9, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 })));
  };
  const openGame = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    markScale.set(withSpring(1));
    router.push("/higher-or-lower");
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace("/account"));
  const markAction = (event: AccessibilityActionEvent) => (event.nativeEvent.actionName === "longpress" ? openGame() : playBurst());
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: markScale.get() }] }));
  const labelLab = label ? labs[label.index] : undefined;

  const box = (layout: { x: number; y: number; width: number; height: number }): Box => ({ left: layout.x, top: layout.y, right: layout.x + layout.width, bottom: layout.y + layout.height });

  // Back to front: the glow, the logos, the middle (so the text is drawn over logos gliding under it), a tapped logo's
  // label, and the close button.
  return (
    <View className="flex-1 bg-background" onLayout={(event) => setArea({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      {area ? <Glow width={area.width} height={area.height} centre={column ? { x: (column.left + column.right) / 2, y: (column.top + column.bottom) / 2 } : null} dark={resolved === "dark"} /> : null}

      {ring ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {labs.map((lab, index) => (
            <Floater key={lab.id} lab={lab} index={index} size={tile} bodies={bodies} world={world} fade={fade} reduced={reduced} onTap={tapLogo} />
          ))}
        </View>
      ) : null}

      <View pointerEvents="box-none" className="absolute inset-0 items-center justify-center px-6" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View pointerEvents="box-none" className="max-w-[420px] items-center" onLayout={(event) => setColumn(box(event.nativeEvent.layout))}>
          <Animated.View style={markStyle} onLayout={(event) => setMarkAt(box(event.nativeEvent.layout))}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Phaseo"
              accessibilityActions={[{ name: "activate", label: "Burst the logos" }, { name: "longpress", label: "Play Higher or lower" }]}
              onAccessibilityAction={markAction}
              delayLongPress={HOLD_MS}
              onPressIn={() => { if (!reduced) markScale.set(withTiming(0.94, { duration: HOLD_MS })); }}
              onPressOut={() => { if (!reduced) markScale.set(withSpring(1)); }}
              onPress={playBurst}
              onLongPress={openGame}
              className="active:opacity-90"
            >
              <Mark size={markSize} />
            </Pressable>
          </Animated.View>
          {/* Not solid and not touchable: logos glide under it and can still be caught there. */}
          <View pointerEvents="none" className="mt-6 items-center" onLayout={(event) => setTextAt(box(event.nativeEvent.layout))}>
            <Text
              accessibilityRole="header"
              accessibilityLabel={VERSION_DETAIL}
              className="text-center font-bold tracking-tight text-link"
              style={{ fontSize: bigText, lineHeight: Math.round(bigText * 1.1) }}
            >
              {shortVersion(APP_VERSION)}
            </Text>
            <Text variant="label" importantForAccessibility="no" accessibilityElementsHidden className="text-center text-foreground">{VERSION_DETAIL}</Text>
            <Text variant="small" numberOfLines={2} className="mt-3 text-center text-muted-foreground">{factLine}</Text>
          </View>
        </View>
      </View>

      {ring && label && labelLab ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LogoLabel lab={labelLab} newest={newest.get(labelLab.id) ?? null} shown={label.shown} index={labelIndex} opacity={labelOpacity} bodies={bodies} world={world} />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={8}
        onPress={close}
        className="absolute h-11 w-11 items-center justify-center rounded-md active:bg-muted"
        style={{ top: insets.top + 6, left: insets.left + 8, zIndex: 10 }}
      >
        <View pointerEvents="none"><Icon icon={X} tone="foreground" size={24} /></View>
      </Pressable>
    </View>
  );
}

/** The Phaseo mark on a rounded square accent tile, in the theme's colours. Its corners are the ones logos collide with. */
function Mark({ size }: { size: number }) {
  const fill = useToneColor("primary-foreground");
  return (
    <View className="items-center justify-center bg-primary" style={{ width: size, height: size, borderRadius: MARK_RADIUS }}>
      <Svg width={size * 0.72} height={size * 0.72} viewBox="0 0 64 64"><Path d={MARK_PATH} fill={fill} /></Svg>
    </View>
  );
}

/** A soft glow of the accent behind the mark, on the normal background, so the screen stays calm in light and dark. */
function Glow({ width, height, centre, dark }: { width: number; height: number; centre: Point | null; dark: boolean }) {
  const accent = useCSSVariable("--color-primary");
  if (accent == null) return null;
  const at = centre ?? { x: width / 2, y: height / 2 };
  return (
    <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="glow" cx={at.x} cy={at.y} r={Math.min(Math.max(width, height) * 0.42, Math.min(width, height) * 0.8)} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={String(accent)} stopOpacity={dark ? 0.3 : 0.14} />
          <Stop offset="1" stopColor={String(accent)} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#glow)" />
    </Svg>
  );
}

type FloaterProps = {
  lab: ArtLab;
  index: number;
  size: number;
  bodies: SharedValue<Body[]>;
  world: SharedValue<World | null>;
  /** The reduced-motion burst, 0 to 1: the logos fade out and back. */
  fade: SharedValue<number>;
  reduced: boolean;
  onTap(index: number): void;
};

/**
 * One lab's logo, drawn where its slot in the simulation says, exactly its collision shape: a `size` square with the
 * tile's own corner radius and nothing round it. A finger landing on it catches it, so it stays under the finger (and
 * the others bounce off it); holding or dragging lifts it with a little spring, and letting go after a drag flings it.
 * A tap shows its newest model. Memoised, so a tap doesn't re-render the other logos.
 *
 * It's drawn as jelly from its slot's stretch and squash: rotate to the axis, scale along and across it, rotate back,
 * so the stretch can lie any way while the logo stays upright. Under the text it fades, so the text stays readable.
 */
const Floater = memo(function Floater({ lab, index, size, bodies, world, fade, reduced, onTap }: FloaterProps) {
  const radius = logoTileRadius(size);
  const lifted = useSharedValue(0);
  const anchor = useSharedValue<Point>({ x: 0, y: 0 });

  const pan = usePanGesture({
    enabled: !reduced,
    onBegin: () => {
      bodies.set(pickUp(bodies.get(), index));
      // A hold lifts it after a moment, with a tick, so it's clear it's been picked up.
      lifted.set(withDelay(LIFT_MS, withSequence(
        withTiming(LIFT_TICK_AT, { duration: 40 }, (finished) => {
          if (finished) scheduleOnRN(lift);
        }),
        withSpring(1, LIFT_SPRING),
      )));
    },
    onActivate: () => {
      const body = bodies.get()[index];
      if (body) anchor.set({ x: body.x, y: body.y });
      // A drag lifts it straight away; the tick plays unless the hold's has.
      if (lifted.get() < LIFT_TICK_AT) scheduleOnRN(lift);
      lifted.set(withSpring(1, LIFT_SPRING));
    },
    onUpdate: (event) => {
      const layout = world.get();
      const current = bodies.get();
      const body = current[index];
      if (!layout || !body) return;
      // The edges and the mark are solid: the logo slides along them and round the mark's corners, never into it.
      const moved = dragTo(anchor.get(), { x: event.translationX, y: event.translationY }, { x: body.x, y: body.y }, layout);
      anchor.set(moved.anchor);
      bodies.set(holdAt(current, index, moved.at));
    },
    onDeactivate: (event) => {
      bodies.set(throwBody(bodies.get(), index, event.velocityX, event.velocityY));
    },
    onFinalize: () => {
      // A tap, or a hold that never moved, lets it carry on as it was going.
      bodies.set(letGo(bodies.get(), index));
      lifted.set(withSpring(0, LIFT_SPRING));
    },
  });
  const tap = useTapGesture({
    onActivate: () => {
      scheduleOnRN(onTap, index);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const tileStyle = useAnimatedStyle(() => {
    const body = bodies.get()[index];
    const layout = world.get();
    const t = clamp(fade.get(), 0, 1);
    const lift = 1 + (LIFT_SCALE - 1) * lifted.get();
    // Reduced motion: no jelly.
    const shape = body && !reduced ? deformation(body, size, radius) : null;
    const angle = shape ? shape.angle : 0;
    const under = body && layout ? coverage(body.x, body.y, size, layout.cover) : 0;
    return {
      opacity: body ? (1 - 0.85 * Math.sin(Math.PI * t)) * (1 - COVER_DIM * under) : 0,
      zIndex: body && body.held ? 2 : 1,
      transform: [
        { translateX: body ? body.x + (shape ? shape.dx : 0) : 0 },
        { translateY: body ? body.y + (shape ? shape.dy : 0) : 0 },
        { rotate: `${angle}rad` },
        { scaleX: (shape ? shape.along : 1) * lift },
        { scaleY: (shape ? shape.across : 1) * lift },
        { rotate: `${-angle}rad` },
      ],
    };
  });
  // A faint accent tint after it hits a corner exactly, as on the DVD screensaver.
  const tintStyle = useAnimatedStyle(() => {
    const body = bodies.get()[index];
    return { opacity: body ? 0.3 * body.glow : 0 };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={lab.name}
        accessibilityHint="Shows its newest model"
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={() => onTap(index)}
        style={[{ position: "absolute", left: 0, top: 0 }, tileStyle]}
      >
        <Logo id={lab.id} label={lab.name} size={size} />
        <Animated.View pointerEvents="none" className="absolute inset-0 bg-primary" style={[{ borderRadius: radius }, tintStyle]} />
      </Animated.View>
    </GestureDetector>
  );
});

type LogoLabelProps = {
  lab: ArtLab;
  newest: string | null;
  /** False once it has gone, so screen readers skip it. */
  shown: boolean;
  /** The logo it's under, and how visible it is (both set on a tap). */
  index: SharedValue<number>;
  opacity: SharedValue<number>;
  bodies: SharedValue<Body[]>;
  world: SharedValue<World | null>;
};

/**
 * A tapped logo's lab, and its newest model once the catalogue is in, under the logo (above it near the bottom),
 * following it as it moves. It stays mounted and fades by its opacity, so nothing can be left on screen.
 */
function LogoLabel({ lab, newest, shown, index, opacity, bodies, world }: LogoLabelProps) {
  const height = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    const layout = world.get();
    const body = bodies.get()[index.get()];
    if (!layout || !body) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] };
    const below = body.y + layout.size + 8;
    const above = body.y - 8 - height.get();
    return {
      opacity: height.get() > 0 ? opacity.get() : 0,
      transform: [
        { translateX: clamp(body.x + layout.size / 2 - LABEL_WIDTH / 2, layout.bounds.left, layout.bounds.right - LABEL_WIDTH) },
        { translateY: below + height.get() > layout.bounds.bottom ? above : below },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      importantForAccessibility={shown ? "yes" : "no-hide-descendants"}
      accessibilityElementsHidden={!shown}
      className="items-center"
      style={[{ position: "absolute", left: 0, top: 0, width: LABEL_WIDTH, zIndex: 5 }, style]}
    >
      <View className="items-center rounded-md border border-border bg-card px-2.5 py-1.5" onLayout={(event) => height.set(event.nativeEvent.layout.height)}>
        <Text variant="label" numberOfLines={1} className="text-card-foreground">{lab.name}</Text>
        {newest ? <Text variant="caption" numberOfLines={1}>{`Newest: ${newest}`}</Text> : null}
      </View>
    </Animated.View>
  );
}
