import type { QueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useIsFocused, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from "react-native";
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, withSequence,
  withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { useCSSVariable } from "uniwind";
import { Logo, logoUri } from "@/components/Logo";
import { Icon, Text, useToneColor } from "@/components/ui";
import { catalogueQuery, useCatalogue } from "@/features/models/state";
import { BUILD_COMMIT, BUILD_NUMBER } from "@/lib/appInfo";
import { APP_VERSION } from "@/lib/config";
import { useAppearance } from "@/providers/AppearanceProvider";
import { burstCurve, burstPosition, clamp, collideBox, DRIFT_SPEED, limitSpeed, ringLayout, step, type Box, type Point } from "./floating";
import { catalogueFact, isLightColour, newestByLab, pickLabs, shortVersion, versionDetail, type ArtLab } from "./versionArt";

/** The Phaseo mark, from apps/web/public/logo_light.svg (a 64 × 64 view box). */
const MARK_PATH = "M19.8574 56H13V8H19.8574V56ZM31.7197 8C37.9368 8 42.8288 9.4856 46.3945 12.457C49.9601 15.4284 51.7432 19.5201 51.7432 24.7314C51.7432 29.9428 49.9601 34.0344 46.3945 37.0059C42.8288 39.9773 37.9368 41.4629 31.7197 41.4629H23.2852V35.4971H31.5146C35.8573 35.497 39.1714 34.5824 41.457 32.7539C43.7426 30.8796 44.8857 28.2056 44.8857 24.7314C44.8857 21.2572 43.7427 18.6059 41.457 16.7773C39.1714 14.9031 35.8573 13.9659 31.5146 13.9658H23.2852V8H31.7197Z";

const BURST_MS = 1400;
/** With reduced motion the burst is a fade out and back, which is allowed to play. */
const FADE_MS = 700;
/** Holding the mark this long opens Higher or lower. */
const HOLD_MS = 1000;
/** A tapped logo's name and newest model stay this long. */
const INFO_MS = 2600;
const INFO_WIDTH = 184;
const INFO_HEIGHT = 50;
/** If the catalogue hasn't come by then, the fixed labs float instead. */
const LABS_WAIT_MS = 1500;
/** Space kept between the logos and the safe area's edges, and round the middle block. */
const EDGE = 8;
const BLOCK_MARGIN = 12;

const VERSION_DETAIL = versionDetail(APP_VERSION, { number: BUILD_NUMBER, commit: BUILD_COMMIT });
const lift = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

/** Starts loading what the art shows (the catalogue and the labs' logos) while the taps are still coming. */
export function prefetchVersionArt(queryClient: QueryClient, theme: "light" | "dark") {
  void queryClient.prefetchQuery(catalogueQuery);
  const catalogue = queryClient.getQueryData(catalogueQuery.queryKey);
  const uris = pickLabs(catalogue?.models ?? [], Date.now()).map((lab) => logoUri(lab.id, theme)).filter((uri): uri is string => Boolean(uri));
  void Image.prefetch(uris, "disk").catch(() => false);
}

/**
 * The version art, opened by five quick taps on Account → Version and build, like Android's version screen. The
 * Phaseo mark sits in the middle with the version and a line from the live catalogue, and the labs' logos float round
 * it. A logo can be dragged and flung (it bounces off the edges and settles back to a slow drift), and a tap shows
 * its lab's newest model. Tapping the mark bursts the logos out and back; holding it for a second opens Higher or
 * lower. With reduced motion the logos stay still, evenly spaced, and the burst is a fade.
 *
 * The motion runs on the UI thread (a frame callback per logo, writing shared values) and stops while the game is on
 * top or the screen has closed.
 */
export function VersionArtScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const { resolved } = useAppearance();
  const catalogue = useCatalogue();
  const models = catalogue.data?.models;
  const onPrimary = useToneColor("primary-foreground");
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [block, setBlock] = useState<Box | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const infoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const burst = useSharedValue(0);
  const markScale = useSharedValue(1);

  // The labs are chosen once per opening, so logos never swap mid-flight: the catalogue's top labs when it's in, or
  // the fixed list if it hasn't come within LABS_WAIT_MS.
  const [labs, setLabs] = useState<ArtLab[] | null>(null);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), LABS_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!labs && (models || waited)) setLabs(pickLabs(models ?? [], catalogue.dataUpdatedAt));
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
  const ring = useMemo(() => (labs && bounds && block ? ringLayout(labs.length, tile, bounds, block) : null), [block, bounds, labs, tile]);

  // The gestures and frame callbacks read the layout from here, on the UI thread.
  const boundsValue = useSharedValue<Box>({ left: 0, top: 0, right: 0, bottom: 0 });
  const blockValue = useSharedValue<Box | null>(null);
  const centre = useSharedValue<Point>({ x: 0, y: 0 });
  useEffect(() => { if (bounds) boundsValue.set(bounds); }, [bounds, boundsValue]);
  useEffect(() => {
    blockValue.set(block);
    if (block) centre.set({ x: (block.left + block.right) / 2, y: (block.top + block.bottom) / 2 });
  }, [block, blockValue, centre]);

  useEffect(() => () => {
    clearTimeout(infoTimer.current);
    cancelAnimation(burst);
    cancelAnimation(markScale);
  }, [burst, markScale]);

  const showInfo = useCallback((id: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setInfo(id);
    clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => setInfo(null), INFO_MS);
  }, []);

  const playBurst = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    // From the start every time, even if the last burst is still playing.
    cancelAnimation(burst);
    burst.set(0);
    burst.set(withTiming(1, { duration: reduced ? FADE_MS : BURST_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    if (!reduced) markScale.set(withSequence(withTiming(0.9, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 })));
  };
  const openGame = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    markScale.set(withSpring(1));
    router.push("/higher-or-lower");
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace("/account"));
  const markAction = (event: AccessibilityActionEvent) => (event.nativeEvent.actionName === "longpress" ? openGame() : playBurst());
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: markScale.get() }] }));

  return (
    <View className="flex-1 bg-primary" onLayout={(event) => setArea({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      {/* Only while it's on screen: the game on top has its own background. */}
      {focused ? <StatusBar style={isLightColour(onPrimary) === false ? "dark" : "light"} /> : null}
      {area ? <Backdrop width={area.width} height={area.height} centre={block ? { x: (block.left + block.right) / 2, y: (block.top + block.bottom) / 2 } : null} dark={resolved === "dark"} /> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={8}
        onPress={close}
        className="absolute h-11 w-11 items-center justify-center rounded-md active:bg-primary-foreground/15"
        style={{ top: insets.top + 6, left: insets.left + 8, zIndex: 10 }}
      >
        <View pointerEvents="none"><Icon icon={X} tone="primary-foreground" size={24} /></View>
      </Pressable>

      <View pointerEvents="box-none" className="absolute inset-0 items-center justify-center px-6" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View
          pointerEvents="box-none"
          className="max-w-[420px] items-center"
          onLayout={(event) => {
            const { x, y, width, height } = event.nativeEvent.layout;
            setBlock({ left: x - BLOCK_MARGIN, top: y - BLOCK_MARGIN, right: x + width + BLOCK_MARGIN, bottom: y + height + BLOCK_MARGIN });
          }}
        >
          <Animated.View style={markStyle}>
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
          <Text
            accessibilityRole="header"
            accessibilityLabel={VERSION_DETAIL}
            className="mt-6 text-center font-bold tracking-tight text-primary-foreground"
            style={{ fontSize: bigText, lineHeight: Math.round(bigText * 1.1) }}
          >
            {shortVersion(APP_VERSION)}
          </Text>
          <Text variant="label" importantForAccessibility="no" accessibilityElementsHidden className="text-center text-primary-foreground">{VERSION_DETAIL}</Text>
          <Text variant="small" numberOfLines={2} className="mt-3 text-center text-primary-foreground/80">{factLine}</Text>
        </View>
      </View>

      {labs && ring ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {labs.map((lab, index) => (
            <Floater
              key={lab.id}
              lab={lab}
              index={index}
              home={ring[index]!}
              size={tile}
              bounds={boundsValue}
              block={blockValue}
              centre={centre}
              burst={burst}
              reach={short * 0.3}
              running={focused && !reduced}
              reduced={reduced}
              newest={newest.get(lab.id) ?? null}
              shown={info === lab.id}
              onTap={showInfo}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The Phaseo mark on a rounded square tile, in the theme's colours. */
function Mark({ size }: { size: number }) {
  const fill = useToneColor("primary");
  return (
    <View
      className="items-center justify-center rounded-md bg-primary-foreground"
      style={{ width: size, height: size, elevation: 8, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}
    >
      <Svg width={size * 0.72} height={size * 0.72} viewBox="0 0 64 64"><Path d={MARK_PATH} fill={fill} /></Svg>
    </View>
  );
}

/**
 * The accent background's depth, from theme tokens only: a soft glow of the foreground colour behind the mark, and a
 * shade toward the bottom (the dark background in dark mode, so the accent turns deep rather than flat).
 */
function Backdrop({ width, height, centre, dark }: { width: number; height: number; centre: Point | null; dark: boolean }) {
  const [glow, shade] = useCSSVariable(["--color-primary-foreground", dark ? "--color-background" : "--color-foreground"]);
  if (glow == null || shade == null) return null;
  const at = centre ?? { x: width / 2, y: height / 2 };
  return (
    <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.3" stopColor={String(shade)} stopOpacity={0} />
          <Stop offset="1" stopColor={String(shade)} stopOpacity={dark ? 0.5 : 0.16} />
        </LinearGradient>
        <RadialGradient id="glow" cx={at.x} cy={at.y} r={Math.max(width, height) * 0.5} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={String(glow)} stopOpacity={dark ? 0.2 : 0.24} />
          <Stop offset="1" stopColor={String(glow)} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#shade)" />
      <Rect width={width} height={height} fill="url(#glow)" />
    </Svg>
  );
}

type FloaterProps = {
  lab: ArtLab;
  index: number;
  /** Its place in the ring: where it starts, and where it stays with reduced motion. */
  home: Point & { angle: number };
  size: number;
  bounds: SharedValue<Box>;
  block: SharedValue<Box | null>;
  centre: SharedValue<Point>;
  burst: SharedValue<number>;
  reach: number;
  running: boolean;
  reduced: boolean;
  newest: string | null;
  shown: boolean;
  onTap(id: string): void;
};

/**
 * One lab's logo: it drifts, can be dragged and flung, joins the burst, and on a tap shows its newest model. Memoised,
 * so a tap on one logo doesn't re-render (and re-register the frame callbacks of) the others.
 */
const Floater = memo(function Floater({ lab, index, home, size, bounds, block, centre, burst, reach, running, reduced, newest, shown, onTap }: FloaterProps) {
  const id = lab.id;
  // A little variety, so they don't move in step: drift speed, the way each sets off (round the ring, alternately
  // clockwise), how its path wanders, and its spin in the burst.
  const drift = DRIFT_SPEED * (0.8 + ((index * 7) % 5) / 10);
  const heading = home.angle + (index % 2 ? Math.PI / 2 : -Math.PI / 2);
  const phase = index * 1.7;
  const spin = (index % 2 ? 1 : -1) * (14 + (index % 4) * 6);
  const x = useSharedValue(home.x);
  const y = useSharedValue(home.y);
  const vx = useSharedValue(Math.cos(heading) * drift);
  const vy = useSharedValue(Math.sin(heading) * drift);
  const held = useSharedValue(false);
  const lifted = useSharedValue(0);
  const grab = useSharedValue<Point>({ x: 0, y: 0 });

  // Still logos sit at their place in the ring, which moves when the screen turns.
  useEffect(() => {
    if (!reduced) return;
    x.set(home.x);
    y.set(home.y);
  }, [home.x, home.y, reduced, x, y]);

  const frame = useFrameCallback((info) => {
    const area = bounds.get();
    if (held.get() || area.right - area.left < size) return;
    const turn = 0.35 * Math.sin(info.timeSinceFirstFrame / 1600 + phase);
    const next = step({ x: x.get(), y: y.get(), vx: vx.get(), vy: vy.get() }, (info.timeSincePreviousFrame ?? 16) / 1000, { size, bounds: area, box: block.get(), drift, heading, turn });
    x.set(next.x);
    y.set(next.y);
    vx.set(next.vx);
    vy.set(next.vy);
  }, false);
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  }, [frame, running]);

  const pan = usePanGesture({
    enabled: !reduced,
    onActivate: () => {
      held.set(true);
      grab.set({ x: x.get(), y: y.get() });
      lifted.set(withSpring(1));
      scheduleOnRN(lift);
    },
    onUpdate: (event) => {
      const area = bounds.get();
      const middle = block.get();
      const next = { x: clamp(grab.get().x + event.translationX, area.left, area.right - size), y: clamp(grab.get().y + event.translationY, area.top, area.bottom - size), vx: 0, vy: 0 };
      // The middle is solid: the logo slides along its edge, so it's never dropped inside it.
      const at = middle ? collideBox({ x: x.get(), y: y.get() }, next, size, middle) : next;
      x.set(at.x);
      y.set(at.y);
    },
    onDeactivate: (event) => {
      const fling = limitSpeed(event.velocityX, event.velocityY);
      vx.set(fling.vx);
      vy.set(fling.vy);
    },
    onFinalize: () => {
      held.set(false);
      lifted.set(withSpring(0));
    },
  });
  const tap = useTapGesture({
    onActivate: () => {
      scheduleOnRN(onTap, id);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  // Where it's drawn: its body, pushed out during the burst. Held logos stay under the finger.
  const place = useDerivedValue(() => {
    const t = burst.get();
    if (reduced || held.get() || t <= 0 || t >= 1) return { x: x.get(), y: y.get() };
    return burstPosition({ x: x.get(), y: y.get() }, size, centre.get(), reach, t, home.angle, bounds.get());
  });
  const tileStyle = useAnimatedStyle(() => {
    const t = clamp(burst.get(), 0, 1);
    const out = reduced ? 0 : burstCurve(t);
    const at = place.get();
    return {
      opacity: reduced ? 1 - 0.85 * Math.sin(Math.PI * t) : 1,
      zIndex: held.get() ? 2 : 1,
      transform: [
        { translateX: at.x },
        { translateY: at.y },
        // A tilt with speed, so a fling leans into its throw.
        { rotate: `${clamp(vx.get() * 0.012, -12, 12) + spin * out}deg` },
        { scale: 1 + 0.14 * lifted.get() + 0.12 * out },
      ],
    };
  });
  const infoStyle = useAnimatedStyle(() => {
    const area = bounds.get();
    const at = place.get();
    const below = at.y + size + 8;
    return {
      transform: [
        { translateX: clamp(at.x + size / 2 - INFO_WIDTH / 2, area.left, area.right - INFO_WIDTH) },
        { translateY: below + INFO_HEIGHT > area.bottom ? at.y - 8 - INFO_HEIGHT : below },
      ],
    };
  });

  return (
    <>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityRole="button"
          accessibilityLabel={lab.name}
          accessibilityHint="Shows its newest model"
          accessibilityActions={[{ name: "activate" }]}
          onAccessibilityAction={() => onTap(id)}
          style={[{ position: "absolute", left: 0, top: 0 }, tileStyle]}
        >
          <View className="rounded-md bg-background" style={{ elevation: 3, shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
            <Logo id={lab.id} label={lab.name} colour={lab.colour} size={size} />
          </View>
        </Animated.View>
      </GestureDetector>
      {shown ? (
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(140).reduceMotion(ReduceMotion.Never)}
          exiting={FadeOut.duration(180).reduceMotion(ReduceMotion.Never)}
          accessibilityLiveRegion="polite"
          style={[{ position: "absolute", left: 0, top: 0, width: INFO_WIDTH, zIndex: 5 }, infoStyle]}
        >
          <View className="items-center rounded-md border border-border bg-card px-2.5 py-1.5">
            <Text variant="label" numberOfLines={1} className="text-card-foreground">{lab.name}</Text>
            {newest ? <Text variant="caption" numberOfLines={1}>{`Newest: ${newest}`}</Text> : null}
          </View>
        </Animated.View>
      ) : null}
    </>
  );
});
