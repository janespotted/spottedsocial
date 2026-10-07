import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Transition from 'react-native-screen-transitions';
import { Image } from '@/components/styled';
import { PressableScale } from '@/components/motion';
import { useNightRecap, useRecapPictures, type RecapPicture } from '@/hooks/use-night-recap';
import { SPRING } from '@/lib/motion';
import { RECAP_PHOTO_GROUP, recapActivePhotoId } from '@/lib/recap-transitions';
import { INK, NEON, outlineControl } from '@/lib/theme';

const GAP = 20;
const MAX_ZOOM = 3;
/** Top bar (close + counter) and the controls under the photo (caption + dots, buttons). */
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
 * A video post, playing over its poster. Plays only while its page is the
 * current one, with sound and looping like the feed; the poster stays until
 * the first frame is drawn. The stream link is pinned at mount: a re-minted
 * token must not hand the player a new source and restart it.
 */
function RecapVideo({ stream, active }: { stream: string; active: boolean }) {
  const source = useRef(stream).current;
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
  });
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try {
      if (active) player.play();
      else player.pause();
    } catch {
      /* player may be released during unmount */
    }
  }, [active, player]);
  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]}
      contentFit="cover"
      nativeControls={false}
      onFirstFrameRender={() => setShown(true)}
    />
  );
}

/**
 * One photo in the large 4:5 frame (screenshot 06). Each photo is a boundary
 * in the "recap" group (the same identity as its Polaroid picture), and the
 * frame is the measured target, so the route's navigation.zoom grows the
 * photo out of its Polaroid and back. Zoom lives on an inner view so the
 * measured frame is never scaled.
 */
function Page({
  photo,
  i,
  index,
  w,
  h,
  left,
  current,
  zoom,
  panX,
  panY,
  count,
}: {
  photo: RecapPicture;
  i: number;
  /** The page on screen: a video plays only there, and loads one page ahead. */
  index: number;
  w: number;
  h: number;
  left: number;
  current: SharedValue<number>;
  zoom: SharedValue<number>;
  panX: SharedValue<number>;
  panY: SharedValue<number>;
  count: number;
}) {
  const zoomed = useAnimatedStyle(() =>
    current.value === i
      ? { transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoom.value }] }
      : { transform: [] }
  );
  return (
    <Transition.Boundary
      group={RECAP_PHOTO_GROUP}
      id={photo.id}
      anchor="center"
      scaleMode="uniform"
      style={{ position: 'absolute', left, top: 0, width: w, height: h }}
    >
      <Transition.Boundary.Target
        style={{ width: w, height: h, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${photo.video ? 'Video' : 'Picture'} ${i + 1} of ${count}`}
      >
        <Animated.View style={[{ width: '100%', height: '100%' }, zoomed]}>
          {photo.url ? (
            <Image
              source={{ uri: photo.url }}
              placeholder={photo.thumbhash ? { thumbhash: photo.thumbhash } : undefined}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <SymbolView name="photo" size={30} tintColor="rgba(255,255,255,0.45)" />
            </View>
          )}
          {photo.video && photo.stream && Math.abs(index - i) <= 1 ? (
            <RecapVideo stream={photo.stream} active={index === i} />
          ) : null}
        </Animated.View>
      </Transition.Boundary.Target>
    </Transition.Boundary>
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
 * Morning After's photo viewer (screenshot 06). The route zooms the photo
 * out of its Polaroid and back (app/(recap)/_layout.tsx, navigation.zoom),
 * and owns drag-to-dismiss. Here: swipe sideways between pictures (the
 * active photo follows, so closing returns to the right Polaroid), pinch or
 * double-tap to look closer. Gesture Handler 3 on the UI thread. Owner only.
 */
export default function RecapPhotoScreen() {
  const { index: raw } = useLocalSearchParams<{ index?: string }>();
  const { data: recap } = useNightRecap();
  // The chapter's list, in the chapter's order (saved, then camera roll)
  const { pictures: photos } = useRecapPictures(recap);
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const startIndex = Math.max(0, Math.min(photos.length - 1, Number(raw) || 0));
  const last = Math.max(0, photos.length - 1);
  const w = winW - 32;
  const stageTop = insets.top + TOP_BAR;
  const stageH = winH - stageTop - insets.bottom - 12;
  const h = Math.min(stageH - CONTROLS - CONTROLS_GAP, w * 1.25);
  const photoTop = stageTop + (stageH - (h + CONTROLS_GAP + CONTROLS)) / 2;

  // Opened from a link rather than a tap: point the close zoom at this photo.
  useEffect(() => {
    if (!recapActivePhotoId.value && photos[startIndex]) recapActivePhotoId.value = photos[startIndex].id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  const [index, setIndex] = useState(startIndex);
  const indexRef = useRef(startIndex);

  const page = useSharedValue(startIndex);
  const current = useSharedValue(startIndex);
  const zoom = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const start = useSharedValue({ page: 0, zoom: 1, x: 0, y: 0 });

  const settle = (i: number) => {
    if (i === indexRef.current) return;
    indexRef.current = i;
    setIndex(i);
    void Haptics.selectionAsync();
  };

  const resetZoom = () => {
    'worklet';
    zoom.value = withSpring(1, SPRING.page);
    panX.value = withSpring(0, SPRING.page);
    panY.value = withSpring(0, SPRING.page);
  };

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(last, i));
    resetZoom();
    current.value = next;
    if (photos[next]) recapActivePhotoId.value = photos[next].id;
    page.value = withSpring(next, SPRING.page);
    settle(next);
  };

  // After a swipe: the spring is already running with the finger's velocity;
  // just record the new photo (for the close zoom) and the counter.
  const swiped = (i: number) => {
    if (photos[i]) recapActivePhotoId.value = photos[i].id;
    settle(i);
  };

  const close = () => {
    zoom.value = 1;
    panX.value = 0;
    panY.value = 0;
    router.back();
  };

  // Sideways only — vertical drags belong to the route's dismiss gesture.
  // When zoomed in, the same gesture moves around the photo instead.
  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-14, 14],
    onBegin: () => {
      'worklet';
      start.value = { page: page.value, zoom: zoom.value, x: panX.value, y: panY.value };
    },
    onUpdate: (e) => {
      'worklet';
      if (zoom.value > 1.02) {
        const maxX = ((zoom.value - 1) * w) / 2;
        const maxY = ((zoom.value - 1) * h) / 2;
        panX.value = rubber(start.value.x + e.translationX, -maxX, maxX);
        panY.value = rubber(start.value.y + e.translationY, -maxY, maxY);
        return;
      }
      page.value = rubber(start.value.page - e.translationX / (w + GAP), 0, last);
    },
    onDeactivate: (e) => {
      'worklet';
      if (zoom.value > 1.02) {
        const maxX = ((zoom.value - 1) * w) / 2;
        const maxY = ((zoom.value - 1) * h) / 2;
        panX.value = withSpring(clamp(panX.value, -maxX, maxX), SPRING.page);
        panY.value = withSpring(clamp(panY.value, -maxY, maxY), SPRING.page);
        return;
      }
      const from = Math.round(start.value.page);
      const projected = page.value - (e.velocityX / (w + GAP)) * 0.18;
      const target = clamp(Math.round(projected), Math.max(0, from - 1), Math.min(last, from + 1));
      current.value = target;
      page.value = withSpring(target, { ...SPRING.page, velocity: -e.velocityX / (w + GAP) });
      scheduleOnRN(swiped, target);
    },
  });

  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      start.value = { ...start.value, zoom: zoom.value };
    },
    onUpdate: (e) => {
      'worklet';
      zoom.value = clamp(start.value.zoom * e.scale, 1, MAX_ZOOM + 0.4);
    },
    onDeactivate: () => {
      'worklet';
      if (zoom.value < 1.02) resetZoom();
      else if (zoom.value > MAX_ZOOM) zoom.value = withSpring(MAX_ZOOM, SPRING.page);
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
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -page.value * (w + GAP) }] }));

  return (
    <View className="flex-1" style={{ backgroundColor: INK }} accessibilityViewIsModal>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {photos.map((photo, i) => (
          <Ambient key={photo.id} url={photo.url} i={i} page={page} />
        ))}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(17, 10, 36, 0.62)' }]} />
      </View>

      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', left: 16, top: photoTop, width: w, height: h }}>
            <Animated.View style={[{ width: w, height: h }, row]}>
              {photos.map((photo, i) => (
                <Page
                  key={photo.id}
                  photo={photo}
                  i={i}
                  index={index}
                  w={w}
                  h={h}
                  left={i * (w + GAP)}
                  current={current}
                  zoom={zoom}
                  panX={panX}
                  panY={panY}
                  count={photos.length}
                />
              ))}
            </Animated.View>
          </View>
        </View>
      </GestureDetector>

      {/* Top: close and the counter */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 6, height: 48 }}
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
      </View>

      {/* Under the photo: caption, page dots, Previous / Next */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 16, right: 16, top: photoTop + h + CONTROLS_GAP, height: CONTROLS }}
      >
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white/60 text-xs font-sans">
            {photos[index]?.onDevice ? 'Last night · On this phone' : 'Last night · Only you'}
          </Text>
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
      </View>
    </View>
  );
}
