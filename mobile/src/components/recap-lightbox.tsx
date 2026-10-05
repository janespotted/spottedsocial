import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from '@/components/styled';
import { PressableScale } from '@/components/motion';
import { SPRING } from '@/lib/motion';
import type { RecapPhoto } from '@/lib/night-recap';
import { INK, NEON, outlineControl } from '@/lib/theme';

/** Where a photo sits on the page (window coordinates), so it can fly out of — and back into — its frame. */
export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** degrees */
  rotate: number;
}

interface Box {
  w: number;
  h: number;
}

const GAP = 20;
const MAX_ZOOM = 3;
/** Top bar (close + counter), and the controls group under the photo (caption + dots, buttons). */
const TOP_BAR = 60;
const CONTROLS = 104;
const CONTROLS_GAP = 20;

function clamp(v: number, lo: number, hi: number) {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

/** Past an edge the page follows the finger at a third of the distance. */
function rubber(v: number, lo: number, hi: number) {
  'worklet';
  if (v < lo) return lo - (lo - v) / 3;
  if (v > hi) return hi + (v - hi) / 3;
  return v;
}

/**
 * The stage frame, as in the mockup (screenshot 06): one large 4:5 frame,
 * the full width when the screen allows, the photo filling it. Every photo
 * uses the same frame, so nothing jumps between pages; pinch or double-tap
 * to see more of a wide photo.
 */
function frame(maxW: number, maxH: number): Box {
  // Full width; 4:5 tall, or as tall as fits above the controls on short screens.
  return { w: maxW, h: Math.min(maxH, maxW * 1.25) };
}

function Page({
  photo,
  url,
  i,
  box,
  page,
  open,
  zoom,
  panX,
  panY,
  stageW,
  stageH,
  boxTop,
  count,
}: {
  photo: RecapPhoto;
  url: string | undefined;
  i: number;
  box: Box;
  /** Where this photo's top sits in the stage, so photo + controls are centred as one group. */
  boxTop: number;
  page: SharedValue<number>;
  open: SharedValue<number>;
  zoom: SharedValue<number>;
  panX: SharedValue<number>;
  panY: SharedValue<number>;
  stageW: number;
  stageH: number;
  count: number;
}) {
  const style = useAnimatedStyle(() => {
    const current = Math.round(page.value) === i;
    return {
      // Only the photo that flew out shows while it flies; its neighbours join at rest.
      opacity: current ? 1 : interpolate(open.value, [0.85, 1], [0, 1], Extrapolation.CLAMP),
      transform: current ? [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoom.value }] : [],
    };
  });
  return (
    <View
      style={{ position: 'absolute', left: i * (stageW + GAP), top: boxTop, width: stageW, height: box.h }}
      className="items-center"
    >
      <Animated.View
        style={[{ width: box.w, height: box.h, borderRadius: 18, overflow: 'hidden' }, style]}
        className="bg-white/[0.06] items-center justify-center"
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Picture ${i + 1} of ${count}`}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            placeholder={photo.thumbhash ? { thumbhash: photo.thumbhash } : undefined}
            className="w-full h-full"
            contentFit="cover"
            transition={160}
          />
        ) : (
          <SymbolView name="photo" size={30} tintColor="rgba(255,255,255,0.45)" />
        )}
      </Animated.View>
    </View>
  );
}

/** A large, blurred, dimmed copy of a photo behind the stage; neighbours cross-fade as you swipe. */
function Ambient({ url, i, page }: { url: string | undefined; i: number; page: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.abs(page.value - i)) }));
  if (!url) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={60} />
    </Animated.View>
  );
}

/** Page dots: the active one stretches into a lime pill, following the swipe. */
function Dot({ i, page }: { i: number; page: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(page.value - i));
    return {
      width: interpolate(d, [0, 1], [18, 6]),
      opacity: interpolate(d, [0, 1], [1, 0.4]),
      backgroundColor: d < 0.5 ? NEON : '#ffffff',
    };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3 }, style]} />;
}

/**
 * Morning After's photo viewer (screenshot 06, made physical). The photo
 * flies out of its Polaroid into a dark stage and back into it on close;
 * each picture shows at its real proportions. Swipe sideways between
 * pictures, swipe down to put one back (the stage fades with the drag),
 * pinch or double-tap to look closer. Gesture Handler 3 gestures run on the
 * UI thread with Reanimated 4 springs that keep the finger's velocity.
 * Only the owner ever sees this.
 */
export function RecapLightbox({
  photos,
  urls,
  startIndex,
  sources,
  onClose,
}: {
  photos: RecapPhoto[];
  urls: Map<string, string> | undefined;
  startIndex: number;
  sources: (SourceRect | undefined)[];
  onClose: () => void;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const stageW = winW - 32;
  const stageTop = insets.top + TOP_BAR;
  // Everything between the top bar and the home indicator; the photo and its
  // controls are centred in it as one group, so a landscape photo doesn't
  // leave a band of nothing between itself and the buttons.
  const stageH = winH - stageTop - insets.bottom - 12;
  const maxPhotoH = stageH - CONTROLS - CONTROLS_GAP;
  const last = photos.length - 1;
  const boxes = useMemo(() => photos.map(() => frame(stageW, maxPhotoH)), [photos, stageW, maxPhotoH]);
  const boxTops = useMemo(() => boxes.map((b) => (stageH - (b.h + CONTROLS_GAP + CONTROLS)) / 2), [boxes, stageH]);
  const heightsSV = useSharedValue(boxes.map((b) => b.h));
  useEffect(() => {
    heightsSV.value = boxes.map((b) => b.h);
  }, [boxes, heightsSV]);

  const [index, setIndex] = useState(startIndex);
  const indexRef = useRef(startIndex);
  const closing = useRef(false);

  const open = useSharedValue(0);
  const page = useSharedValue(startIndex);
  const dragY = useSharedValue(0);
  const zoom = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  // where the current photo flies from / back to, and its size on stage
  const src = useSharedValue<SourceRect | null>(sources[startIndex] ?? null);
  const box = useSharedValue<Box>(boxes[startIndex]);
  const axis = useSharedValue(0); // 0 undecided, 1 horizontal, 2 vertical
  const start = useSharedValue({ page: 0, zoom: 1, x: 0, y: 0 });

  useEffect(() => {
    open.value = reduce ? withTiming(1, { duration: 180 }) : withSpring(1, SPRING.page);
  }, [open, reduce]);

  useEffect(() => {
    src.value = sources[index] ?? null;
    box.value = boxes[index];
  }, [index, sources, boxes, src, box]);

  const settle = (i: number) => {
    if (i === indexRef.current) return;
    indexRef.current = i;
    setIndex(i);
    void Haptics.selectionAsync();
  };

  const resetZoom = () => {
    zoom.value = withSpring(1, SPRING.page);
    panX.value = withSpring(0, SPRING.page);
    panY.value = withSpring(0, SPRING.page);
  };

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(last, i));
    resetZoom();
    page.value = withSpring(next, SPRING.page);
    settle(next);
  };

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    resetZoom();
    dragY.value = withSpring(0, SPRING.page);
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(onClose);
    };
    open.value = reduce ? withTiming(0, { duration: 160 }, done) : withSpring(0, { ...SPRING.page, damping: 30 }, done);
  };

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      axis.value = 0;
      start.value = { page: page.value, zoom: zoom.value, x: panX.value, y: panY.value };
    },
    onUpdate: (e) => {
      'worklet';
      if (zoom.value > 1.02) {
        // Zoomed in: move around the photo, within its edges.
        const maxX = ((zoom.value - 1) * box.value.w) / 2;
        const maxY = ((zoom.value - 1) * box.value.h) / 2;
        panX.value = rubber(start.value.x + e.translationX, -maxX, maxX);
        panY.value = rubber(start.value.y + e.translationY, -maxY, maxY);
        return;
      }
      if (axis.value === 0) axis.value = Math.abs(e.translationX) > Math.abs(e.translationY) ? 1 : 2;
      if (axis.value === 1) page.value = rubber(start.value.page - e.translationX / (stageW + GAP), 0, last);
      else dragY.value = e.translationY;
    },
    onDeactivate: (e) => {
      'worklet';
      if (zoom.value > 1.02) {
        const maxX = ((zoom.value - 1) * box.value.w) / 2;
        const maxY = ((zoom.value - 1) * box.value.h) / 2;
        panX.value = withSpring(clamp(panX.value, -maxX, maxX), SPRING.page);
        panY.value = withSpring(clamp(panY.value, -maxY, maxY), SPRING.page);
        return;
      }
      if (axis.value === 1) {
        // A flick moves one picture; a slow drag settles on the nearest.
        const from = Math.round(start.value.page);
        const projected = page.value - (e.velocityX / (stageW + GAP)) * 0.18;
        const target = clamp(Math.round(projected), Math.max(0, from - 1), Math.min(last, from + 1));
        page.value = withSpring(target, { ...SPRING.page, velocity: -e.velocityX / (stageW + GAP) });
        scheduleOnRN(settle, target);
      } else if (axis.value === 2) {
        if (Math.abs(e.translationY) > 110 || Math.abs(e.velocityY) > 850) scheduleOnRN(close);
        else dragY.value = withSpring(0, { ...SPRING.page, velocity: e.velocityY });
      }
    },
  });

  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      start.value = { ...start.value, zoom: zoom.value };
    },
    onUpdate: (e) => {
      'worklet';
      zoom.value = clamp(start.value.zoom * e.scale, 0.85, MAX_ZOOM + 0.4);
    },
    onDeactivate: () => {
      'worklet';
      if (zoom.value < 1.02) {
        zoom.value = withSpring(1, SPRING.page);
        panX.value = withSpring(0, SPRING.page);
        panY.value = withSpring(0, SPRING.page);
      } else if (zoom.value > MAX_ZOOM) {
        zoom.value = withSpring(MAX_ZOOM, SPRING.page);
      }
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      const zoomIn = zoom.value < 1.1;
      zoom.value = withSpring(zoomIn ? 2.2 : 1, SPRING.page);
      panX.value = withSpring(0, SPRING.page);
      panY.value = withSpring(0, SPRING.page);
    },
  });

  const gesture = useSimultaneousGestures(pan, pinch, doubleTap);

  // The strip flies between the source frame and the stage. The current
  // photo is centred on the stage, so it is the one that lands in the frame.
  const strip = useAnimatedStyle(() => {
    const s = src.value;
    const b = box.value;
    const o = open.value;
    const drag = dragY.value;
    const dragScale = interpolate(Math.abs(drag), [0, 500], [1, 0.8], Extrapolation.CLAMP);
    const fromScale = s ? s.width / b.w : 0.92;
    const dx = s ? s.x + s.width / 2 - (16 + stageW / 2) : 0;
    const targetCenterY = stageTop + (stageH - (b.h + CONTROLS_GAP + CONTROLS)) / 2 + b.h / 2;
    const dy = s ? s.y + s.height / 2 - targetCenterY : 0;
    return {
      transform: [
        { translateX: dx * (1 - o) },
        { translateY: dy * (1 - o) + drag },
        { scale: interpolate(o, [0, 1], [fromScale, 1]) * dragScale },
        { rotate: `${(s?.rotate ?? 0) * (1 - o)}deg` },
      ],
      opacity: s ? 1 : o,
    };
  });
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -page.value * (stageW + GAP) }] }));
  // Solid at rest; it only gives way to the page behind while you pull the photo down.
  const backdrop = useAnimatedStyle(() => ({
    opacity: open.value * interpolate(Math.abs(dragY.value), [0, 320], [1, 0.25], Extrapolation.CLAMP),
  }));
  // The controls ride just under the photo, gliding as the photo's height changes between pages.
  const controlsPos = useAnimatedStyle(() => {
    const hs = heightsSV.value;
    const idx = hs.map((_, k) => k);
    const h = hs.length > 1 ? interpolate(page.value, idx, hs, Extrapolation.CLAMP) : (hs[0] ?? 0);
    return { top: stageTop + (stageH - (h + CONTROLS_GAP + CONTROLS)) / 2 + h + CONTROLS_GAP };
  });
  const chrome = useAnimatedStyle(() => ({
    opacity:
      interpolate(open.value, [0.6, 1], [0, 1], Extrapolation.CLAMP) *
      interpolate(Math.abs(dragY.value), [0, 140], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(open.value, [0, 1], [8, 0]) }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: INK }, backdrop]} pointerEvents="none">
        {photos.map((photo, i) => (
          <Ambient key={photo.id} url={urls?.get(photo.storage_key)} i={i} page={page} />
        ))}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(17, 10, 36, 0.62)' }]} />
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[{ position: 'absolute', left: 16, top: stageTop, width: stageW, height: stageH }, strip]}>
            <Animated.View style={[{ width: stageW, height: stageH }, row]}>
              {photos.map((photo, i) => (
                <Page
                  key={photo.id}
                  photo={photo}
                  url={urls?.get(photo.storage_key)}
                  i={i}
                  box={boxes[i]}
                  page={page}
                  open={open}
                  zoom={zoom}
                  panX={panX}
                  panY={panY}
                  stageW={stageW}
                  stageH={stageH}
                  boxTop={boxTops[i]}
                  count={photos.length}
                />
              ))}
            </Animated.View>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Top: close and the counter */}
      <Animated.View
        pointerEvents="box-none"
        style={[{ position: 'absolute', left: 16, right: 16, top: insets.top + 6, height: 48 }, chrome]}
        className="flex-row items-center justify-between"
      >
        <PressableScale
          onPress={close}
          accessibilityLabel="Close picture"
          className="w-11 h-11 rounded-full items-center justify-center bg-white/10 border border-white/15"
        >
          <SymbolView name="xmark" size={15} tintColor="#ffffff" weight="semibold" />
        </PressableScale>
        <Text className="text-white text-[15px] font-sans-medium" style={{ fontVariant: ['tabular-nums'] }}>
          {index + 1} <Text className="text-white/50">of {photos.length}</Text>
        </Text>
        <View className="w-11" />
      </Animated.View>

      {/* Under the photo: caption, page dots, Previous / Next */}
      <Animated.View
        pointerEvents="box-none"
        style={[{ position: 'absolute', left: 16, right: 16, height: CONTROLS }, controlsPos, chrome]}
      >
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white/60 text-xs font-sans">Last night · Only you</Text>
          {photos.length > 1 ? (
            <View className="flex-row items-center gap-1.5" accessible={false}>
              {photos.map((p, i) => (
                <Dot key={p.id} i={i} page={page} />
              ))}
            </View>
          ) : null}
        </View>
        {photos.length > 1 ? (
          <View className="flex-row gap-2.5">
            <PressableScale
              onPress={() => goTo(index - 1)}
              disabled={index === 0}
              haptic="none"
              className={`flex-1 min-h-12 rounded-full flex-row items-center justify-center gap-2 ${outlineControl}`}
            >
              <SymbolView name="arrow.left" size={13} tintColor="#ffffff" />
              <Text className="text-white text-[15px] font-sans-medium">Previous</Text>
            </PressableScale>
            <PressableScale
              onPress={() => goTo(index + 1)}
              disabled={index === last}
              haptic="none"
              className={`flex-1 min-h-12 rounded-full flex-row items-center justify-center gap-2 ${outlineControl}`}
            >
              <Text className="text-white text-[15px] font-sans-medium">Next</Text>
              <SymbolView name="arrow.right" size={13} tintColor="#ffffff" />
            </PressableScale>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}
