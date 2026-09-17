import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, Text, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  usePhotoOutput,
  useVideoOutput,
  type CameraRef,
  type Recorder,
} from 'react-native-vision-camera';
import {
  AssetField,
  MediaType,
  Query as LibraryQuery,
  getPermissionsAsync as getLibraryPermissionsAsync,
  requestPermissionsAsync as requestLibraryPermissionsAsync,
} from 'expo-media-library';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Image } from '@/components/styled';
import {
  MAX_VIDEO_SECONDS,
  pickFromLibrary,
  toFileUri,
  type CapturedMedia,
} from '@/lib/post-media';
import { NEON, PURPLE, INK, RECORD_RED } from '@/lib/theme';

/* ── Visual tokens (nightlife: deep purple, neon lime, glass) ── */
const GLASS_BG = 'rgba(17, 10, 36, 0.55)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.14)';

type Facing = 'back' | 'front';
type Flash = 'off' | 'on';
type PhotosAccess = 'undetermined' | 'granted' | 'limited' | 'denied';

const MAX_ZOOM = 6;

// Capture button geometry
const RING_SIZE = 88;
const RING_STROKE = 3;

// Enabling audio reconfigures the capture session; give it a beat before
// asking the recorder to start.
const RECONFIGURE_MS = 400;

const fmt = (s: number) =>
  `0:${String(Math.min(MAX_VIDEO_SECONDS, Math.floor(s))).padStart(2, '0')}`;

/* ────────────────────────── Small UI pieces ────────────────────────── */

/** Round glass control used for close / flash / flip. */
function GlassButton({
  icon,
  onPress,
  label,
  active = false,
  disabled = false,
  size = 44,
}: {
  icon: SFSymbol;
  onPress: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(0.9, { damping: 14 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 14 }))}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          style,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: active ? 'rgba(212,255,0,0.18)' : GLASS_BG,
            borderWidth: 1,
            borderColor: active ? 'rgba(212,255,0,0.55)' : GLASS_BORDER,
            opacity: disabled ? 0.4 : 1,
            boxShadow: active ? '0 0 14px rgba(212,255,0,0.35)' : '0 4px 12px rgba(0,0,0,0.35)',
          },
        ]}
        className="items-center justify-center"
      >
        <SymbolView name={icon} size={size * 0.42} tintColor={active ? NEON : '#ffffff'} />
      </Animated.View>
    </Pressable>
  );
}

/** Focus ring that blooms in at the tap point and fades. */
function FocusRing({ point, token }: { point: { x: number; y: number } | null; token: number }) {
  const scale = useSharedValue(1.5);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (!point) return;
    cancelAnimation(scale);
    cancelAnimation(opacity);
    scale.value = 1.5;
    opacity.value = 1;
    scale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    opacity.value = withSequence(
      withTiming(1, { duration: 500 }),
      withTiming(0, { duration: 350 })
    );
    // token changes on every tap so the same point re-animates
  }, [point, token, scale, opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  if (!point) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          position: 'absolute',
          left: point.x - 36,
          top: point.y - 36,
          width: 72,
          height: 72,
          borderRadius: 36,
          borderWidth: 1.5,
          borderColor: NEON,
          boxShadow: '0 0 12px rgba(212,255,0,0.5)',
        },
      ]}
    >
      <View
        className="absolute rounded-full"
        style={{ left: 33, top: 33, width: 6, height: 6, backgroundColor: NEON }}
      />
    </Animated.View>
  );
}

/** Shutter: white disc that morphs into a red square while recording, with a ring. */
function CaptureButton({
  recording,
  busy,
  disabled,
  progress,
  onTap,
  onHoldStart,
  onHoldEnd,
}: {
  recording: boolean;
  busy: boolean;
  disabled: boolean;
  progress: number;
  onTap: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  const pressScale = useSharedValue(1);
  const rec = useSharedValue(0);
  useEffect(() => {
    rec.value = withTiming(recording ? 1 : 0, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [recording, rec]);
  const outer = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const inner = useAnimatedStyle(() => {
    const size = 64 - rec.value * 30;
    return {
      width: size,
      height: size,
      borderRadius: 32 - rec.value * 24,
      backgroundColor: rec.value > 0.5 ? RECORD_RED : '#ffffff',
    };
  });
  // Ring drawn as a rotated conic-ish sweep using two half masks is heavy;
  // a simple stroked circle plus a progress arc via border trick is enough.
  return (
    <Pressable
      onPress={onTap}
      onLongPress={onHoldStart}
      onPressOut={() => {
        pressScale.value = withSpring(1, { damping: 12 });
        onHoldEnd();
      }}
      onPressIn={() => (pressScale.value = withSpring(0.94, { damping: 12 }))}
      delayLongPress={220}
      disabled={disabled}
      accessibilityLabel="Capture. Tap for photo, hold for video"
      style={{ width: RING_SIZE, height: RING_SIZE }}
      className="items-center justify-center"
    >
      <Animated.View style={[outer]} className="items-center justify-center">
        <View
          style={{
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RING_SIZE / 2,
            borderWidth: RING_STROKE,
            borderColor: recording ? 'rgba(255,59,92,0.35)' : 'rgba(255,255,255,0.85)',
            boxShadow: recording
              ? '0 0 22px rgba(255,59,92,0.45)'
              : '0 0 18px rgba(212,255,0,0.18)',
          }}
          className="items-center justify-center"
        >
          {recording ? <ProgressArc progress={progress} /> : null}
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Animated.View style={inner} />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Recording progress arc (0..1) drawn with two clipped half-circles. */
function ProgressArc({ progress }: { progress: number }) {
  const deg = progress * 360;
  const size = RING_SIZE;
  const r = size / 2;
  const half = (rotate: number, clipRight: boolean) => (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        overflow: 'hidden',
        left: 0,
        top: 0,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: clipRight ? r : 0,
          top: 0,
          width: r,
          height: size,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: clipRight ? -r : 0,
            top: 0,
            width: size,
            height: size,
            borderRadius: r,
            borderWidth: RING_STROKE,
            borderColor: RECORD_RED,
            transform: [{ rotate: `${rotate}deg` }],
          }}
        />
      </View>
    </View>
  );
  // Right half sweeps 0→180°, left half 180→360°
  const right = Math.min(deg, 180);
  const left = Math.max(deg - 180, 0);
  return (
    <>
      {half(right - 180, true)}
      {left > 0 ? half(left - 180, false) : null}
    </>
  );
}

/* ────────────────────────── Permission screens ────────────────────────── */

const PERMISSION_ROWS: Array<{
  key: 'camera' | 'microphone' | 'photos';
  icon: SFSymbol;
  title: string;
  why: string;
}> = [
  { key: 'camera', icon: 'camera.fill', title: 'Camera', why: 'To shoot your photo or video' },
  { key: 'microphone', icon: 'mic.fill', title: 'Microphone', why: 'Sound in videos — optional' },
  { key: 'photos', icon: 'photo.on.rectangle.angled', title: 'Photos', why: 'Your latest shot as a shortcut' },
];

/** Only a granted permission gets a mark; pending rows stay empty so nothing reads as a choice to make. */
function StatusMark({ state }: { state: 'pending' | 'granted' | 'denied' }) {
  if (state === 'granted') {
    return (
      <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: NEON }}>
        <SymbolView name="checkmark" size={10} tintColor={INK} />
      </View>
    );
  }
  if (state === 'denied') {
    return <Text className="text-white/50 text-[12px] font-sans">Off</Text>;
  }
  return null;
}

/** Quiet, compact screen shell shared by the pre-permission and denied states. */
function QuietScreen({
  onClose,
  children,
  footer,
}: {
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <View className="flex-1 px-6 pt-safe-offset-2 pb-safe-offset-6" style={{ backgroundColor: INK }}>
      {/* faint bloom, not a full gradient */}
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 top-0 h-72 bg-linear-to-b from-[#2b1a4d] to-transparent"
      />
      <Pressable
        onPress={onClose}
        hitSlop={10}
        accessibilityLabel="Close"
        className="self-start w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
      >
        <SymbolView name="xmark" size={14} tintColor="rgba(255,255,255,0.85)" />
      </Pressable>
      <View className="flex-1 justify-center">{children}</View>
      {footer}
    </View>
  );
}

function PermissionsIntro({
  states,
  requesting,
  onAllow,
  onLibrary,
  onClose,
}: {
  states: Record<'camera' | 'microphone' | 'photos', 'pending' | 'granted' | 'denied'>;
  requesting: boolean;
  onAllow: () => void;
  onLibrary: () => void;
  onClose: () => void;
}) {
  return (
    <QuietScreen
      onClose={onClose}
      footer={
        <View className="gap-1">
          <Pressable
            onPress={onAllow}
            disabled={requesting}
            className="min-h-12 rounded-full items-center justify-center active:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: NEON }}
          >
            {requesting ? (
              <ActivityIndicator color={INK} />
            ) : (
              <Text className="text-[#110a24] text-[15px] font-sans-semibold">Continue</Text>
            )}
          </Pressable>
          <Pressable onPress={onLibrary} className="h-11 items-center justify-center active:opacity-70">
            <Text className="text-white/50 text-[13px] font-sans-medium">Use my library instead</Text>
          </Pressable>
        </View>
      }
    >
      <View className="items-center gap-2 mb-7">
        <View
          className="w-14 h-14 rounded-full items-center justify-center mb-2"
          style={{ backgroundColor: 'rgba(212,255,0,0.1)', borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)' }}
        >
          <SymbolView name="camera.aperture" size={24} tintColor={NEON} />
        </View>
        <Text className="text-white text-[22px] font-sans-semibold text-center" style={{ letterSpacing: -0.3 }}>
          Ready to capture
        </Text>
        <Text className="text-white/55 text-[14px] font-sans text-center leading-5 px-4">
          iOS will ask for three things. Nothing is captured or shared until you decide.
        </Text>
      </View>

      <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
        {PERMISSION_ROWS.map((row, i) => (
          <View
            key={row.key}
            className="flex-row items-center gap-3 px-4"
            style={{
              height: 64,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: 'rgba(255,255,255,0.07)',
            }}
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(168,85,247,0.16)' }}
            >
              <SymbolView name={row.icon} size={15} tintColor={PURPLE} />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-sans-medium">{row.title}</Text>
              <Text className="text-white/60 text-[12px] font-sans" numberOfLines={1}>
                {row.why}
              </Text>
            </View>
            <StatusMark state={states[row.key]} />
          </View>
        ))}
      </View>
    </QuietScreen>
  );
}

function CameraDenied({ onLibrary, onClose }: { onLibrary: () => void; onClose: () => void }) {
  return (
    <QuietScreen
      onClose={onClose}
      footer={
        <View className="gap-1">
          <Pressable
            onPress={onLibrary}
            className="min-h-12 rounded-full items-center justify-center active:opacity-90"
            style={{ backgroundColor: NEON }}
          >
            <Text className="text-[#110a24] text-[15px] font-sans-semibold">Choose from library</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openSettings()}
            className="h-11 items-center justify-center active:opacity-70"
          >
            <Text className="text-white/50 text-[13px] font-sans-medium">Open Settings</Text>
          </Pressable>
        </View>
      }
    >
      <View className="items-center gap-2">
        <View
          className="w-14 h-14 rounded-full items-center justify-center mb-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <SymbolView name="camera.fill" size={22} tintColor="rgba(255,255,255,0.6)" />
        </View>
        <Text className="text-white text-[22px] font-sans-semibold text-center" style={{ letterSpacing: -0.3 }}>
          Camera is off
        </Text>
        <Text className="text-white/55 text-[14px] font-sans text-center leading-5 px-4">
          You can still post from your library. To shoot in Spotted, allow the camera in Settings
          — this screen updates when you return.
        </Text>
      </View>
    </QuietScreen>
  );
}

/* ────────────────────────── Camera ────────────────────────── */

/**
 * In-app camera (client feedback §4) on VisionCamera.
 *
 * Permissions are asked once, up front, on one explained screen (camera,
 * microphone, photos). Camera denied → library still works; microphone
 * denied → video records silent with a note, photos unaffected; photos
 * denied → generic library icon.
 *
 * Gestures live in one system (react-native-gesture-handler) so they never
 * compete: tap = focus/expose at a point (with a ring), pinch = zoom,
 * double-tap = flip — including mid-recording, thanks to the persistent
 * recorder. Tap the shutter for a photo, hold to record (release to stop;
 * MAX_VIDEO_SECONDS enforced natively). Nothing about caption, venue or
 * audience lives here.
 */
export function SpottedCamera({
  onCapture,
  onClose,
  onTextPost,
  closeLabel = 'Close',
}: {
  onCapture: (media: CapturedMedia) => void;
  onClose: () => void;
  onTextPost?: () => void;
  closeLabel?: string;
}) {
  const cameraPermission = useCameraPermission();
  const micPermission = useMicrophonePermission();
  const [photosAccess, setPhotosAccess] = useState<PhotosAccess | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const cameraRef = useRef<CameraRef>(null);

  const [facing, setFacing] = useState<Facing>('back');
  const device = useCameraDevice(facing);
  const [flash, setFlash] = useState<Flash>('off');
  const [ready, setReady] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [libraryThumb, setLibraryThumb] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [zoomLabel, setZoomLabel] = useState<string | null>(null);

  // Audio is part of the session configuration: on only once the mic is granted
  const audio = micPermission.hasPermission;
  // Feed-sized capture: the feed never draws more than ~1200 px wide, and
  // lib/media-prep.ts caps uploads at 1920 on the long edge anyway. Asking
  // the sensor for 12 MP only makes capture and prep slower.
  const photoOutput = usePhotoOutput({
    qualityPrioritization: 'balanced',
    quality: 0.9,
    targetResolution: CommonResolutions.FHD_4_3,
  });
  const videoOutput = useVideoOutput({
    enableAudio: audio,
    enablePersistentRecorder: true, // keeps a recording alive across a lens flip
    fileType: 'mov',
    targetResolution: CommonResolutions.FHD_16_9,
    targetBitRate: 6_000_000, // ~10 MB for a 14 s clip instead of ~20 MB at the encoder default
  });

  const recorderRef = useRef<Recorder | null>(null);
  const holdingRef = useRef(false);
  const pendingRecordRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zoomHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Zoom as a plain number: a Reanimated SharedValue here would route
  // through VisionCamera's optional worklets package (not installed).
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const zoomAtPinchStart = useRef(1);
  const applyZoom = (z: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(1, z));
    if (Math.abs(clamped - zoomRef.current) < 0.02) return;
    zoomRef.current = clamped;
    setZoom(clamped);
    setZoomLabel(`${clamped.toFixed(1)}×`);
    if (zoomHideRef.current) clearTimeout(zoomHideRef.current);
    zoomHideRef.current = setTimeout(() => setZoomLabel(null), 900);
  };

  // Recording dot pulse
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (recording) {
      pulse.value = withRepeat(withTiming(0.25, { duration: 600 }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [recording, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  /* ── Lifecycle ── */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    getLibraryPermissionsAsync()
      .then((p) => {
        if (cancelled) return;
        setPhotosAccess(
          p.granted
            ? p.accessPrivileges === 'limited'
              ? 'limited'
              : 'granted'
            : p.canAskAgain
              ? 'undetermined'
              : 'denied'
        );
      })
      .catch(() => !cancelled && setPhotosAccess('denied'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Library shortcut thumbnail — only once photo access exists (never prompts here)
  useEffect(() => {
    if (photosAccess !== 'granted' && photosAccess !== 'limited') return;
    let cancelled = false;
    (async () => {
      try {
        const [latest] = await new LibraryQuery()
          .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .limit(1)
          .exe();
        if (!latest) return;
        const uri = await latest.getUri();
        if (!cancelled && uri) setLibraryThumb(uri);
      } catch {
        /* generic icon */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photosAccess]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (zoomHideRef.current) clearTimeout(zoomHideRef.current);
      recorderRef.current?.cancelRecording().catch(() => {});
    },
    []
  );

  const startTimer = () => {
    const startedAt = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  /* ── Permissions, all at once ── */
  const allowAll = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      if (!cameraPermission.hasPermission && cameraPermission.canRequestPermission) {
        await cameraPermission.requestPermission();
      }
      if (!micPermission.hasPermission && micPermission.canRequestPermission) {
        await micPermission.requestPermission();
      }
      if (photosAccess === 'undetermined') {
        const p = await requestLibraryPermissionsAsync();
        setPhotosAccess(p.granted ? (p.accessPrivileges === 'limited' ? 'limited' : 'granted') : 'denied');
      }
    } finally {
      setRequesting(false);
      setIntroDismissed(true);
    }
  };

  /* ── Gestures: tap focus · pinch zoom · double-tap flip ── */
  const flip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  };
  const focusAt = (x: number, y: number) => {
    setFocusPoint({ x, y });
    setFocusToken((t) => t + 1);
    cameraRef.current?.focusTo({ x, y }).catch(() => {});
  };
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success) flip();
    });
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (success) focusAt(e.x, e.y);
    });
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      zoomAtPinchStart.current = zoomRef.current;
    })
    .onUpdate((e) => applyZoom(zoomAtPinchStart.current * e.scale));
  const gestures = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, singleTap));

  /* ── Photo: tap ── */
  const takePhoto = async () => {
    if (!ready || busy || recording) return;
    setBusy(true);
    setNotice(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { filePath } = await photoOutput.capturePhotoToFile({ flashMode: flash }, {});
      onCapture({ uri: toFileUri(filePath), type: 'image', mimeType: 'image/jpeg', fileExt: 'jpg' });
    } catch {
      setNotice("Couldn't take the photo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /* ── Video: hold ── */
  const startRecording = async () => {
    if (recording || recorderRef.current) return;
    setRecording(true);
    startTimer();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const recorder = await videoOutput.createRecorder({ maxDuration: MAX_VIDEO_SECONDS });
      recorderRef.current = recorder;
      await recorder.startRecording(
        (filePath) => {
          recorderRef.current = null;
          stopTimer();
          setRecording(false);
          onCapture({ uri: toFileUri(filePath), type: 'video', mimeType: 'video/quicktime', fileExt: 'mov' });
        },
        () => {
          recorderRef.current = null;
          stopTimer();
          setRecording(false);
          setNotice("Couldn't record the video. Try again.");
        }
      );
      if (!holdingRef.current) await recorder.stopRecording(); // released before it came up
    } catch {
      recorderRef.current = null;
      stopTimer();
      setRecording(false);
      setNotice("Couldn't record the video. Try again.");
    }
  };

  const beginHold = async () => {
    if (!ready || busy || recording || pendingRecordRef.current) return;
    holdingRef.current = true;
    setNotice(null);
    if (!micPermission.hasPermission) {
      const granted = micPermission.canRequestPermission
        ? await micPermission.requestPermission()
        : false;
      if (!holdingRef.current) return;
      if (granted) {
        pendingRecordRef.current = true;
        setTimeout(() => {
          pendingRecordRef.current = false;
          if (holdingRef.current) startRecording();
        }, RECONFIGURE_MS);
        return;
      }
      setNotice('No microphone access — this video will be silent. Allow it in Settings for sound.');
    }
    startRecording();
  };

  const endHold = () => {
    holdingRef.current = false;
    if (recording) recorderRef.current?.stopRecording().catch(() => {});
  };

  const chooseFromLibrary = async () => {
    const picked = await pickFromLibrary();
    if (picked) onCapture(picked);
  };

  /* ── Which screen ── */
  if (photosAccess === null) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: INK }}>
        <ActivityIndicator color={NEON} />
      </View>
    );
  }

  const needsIntro =
    !introDismissed &&
    ((!cameraPermission.hasPermission && cameraPermission.canRequestPermission) ||
      (!micPermission.hasPermission && micPermission.canRequestPermission) ||
      photosAccess === 'undetermined');

  if (needsIntro) {
    return (
      <PermissionsIntro
        states={{
          camera: cameraPermission.hasPermission ? 'granted' : cameraPermission.canRequestPermission ? 'pending' : 'denied',
          microphone: micPermission.hasPermission ? 'granted' : micPermission.canRequestPermission ? 'pending' : 'denied',
          photos: photosAccess === 'granted' || photosAccess === 'limited' ? 'granted' : photosAccess === 'denied' ? 'denied' : 'pending',
        }}
        requesting={requesting}
        onAllow={allowAll}
        onLibrary={chooseFromLibrary}
        onClose={onClose}
      />
    );
  }

  if (!cameraPermission.hasPermission) {
    return <CameraDenied onLibrary={chooseFromLibrary} onClose={onClose} />;
  }

  const progress = Math.min(1, elapsed / MAX_VIDEO_SECONDS);
  const mutedVideo = !micPermission.hasPermission;

  return (
    <View className="flex-1 bg-black">
      {device ? (
        <GestureDetector gesture={gestures}>
          <View className="flex-1">
            <Camera
              ref={cameraRef}
              style={{ flex: 1 }}
              isActive={foreground}
              device={device}
              outputs={[photoOutput, videoOutput]}
              mirrorMode="auto"
              zoom={zoom}
              torchMode={recording && flash === 'on' && device.hasTorch ? 'on' : 'off'}
              onConfigured={() => setReady(true)}
              onError={() => setNotice('Camera error. Close and reopen the camera.')}
            />
            <FocusRing point={focusPoint} token={focusToken} />
          </View>
        </GestureDetector>
      ) : (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <SymbolView name="camera.metering.unknown" size={36} tintColor="rgba(255,255,255,0.4)" />
          <Text className="text-white/60 text-sm font-sans text-center">
            No {facing} camera on this device. Use the library instead.
          </Text>
        </View>
      )}

      {/* Scrims so controls read on any scene */}
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 top-0 h-40 bg-linear-to-b from-black/60 to-transparent"
      />
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 bottom-0 h-56 bg-linear-to-t from-black/75 to-transparent"
      />

      {/* Top bar: close · recording status · flash / flip */}
      <View className="absolute left-0 right-0 top-0 pt-safe-offset-3 px-4 flex-row items-center justify-between">
        <GlassButton icon="xmark" label={closeLabel} onPress={onClose} />

        {recording ? (
          <View
            className="flex-row items-center gap-2 px-3.5 py-2 rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,59,92,0.45)' }}
          >
            <Animated.View
              style={[pulseStyle, { width: 8, height: 8, borderRadius: 4, backgroundColor: RECORD_RED, boxShadow: '0 0 8px rgba(255,59,92,0.9)' }]}
            />
            <Text className="text-white text-sm font-sans-semibold" style={{ fontVariant: ['tabular-nums'] }}>
              {fmt(elapsed)}
            </Text>
            <Text className="text-white/60 text-xs font-sans">/ 0:{MAX_VIDEO_SECONDS}</Text>
            {mutedVideo ? <SymbolView name="mic.slash" size={12} tintColor="rgba(255,255,255,0.6)" /> : null}
          </View>
        ) : zoomLabel ? (
          <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER }}>
            <Text className="text-white text-xs font-sans-semibold">{zoomLabel}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-2">
          <GlassButton
            icon={flash === 'on' ? 'bolt.fill' : 'bolt.slash'}
            label={flash === 'on' ? 'Flash on' : 'Flash off'}
            active={flash === 'on'}
            disabled={!!device && !device.hasFlash}
            onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
          />
          <GlassButton icon="arrow.triangle.2.circlepath.camera" label="Flip camera" onPress={flip} />
        </View>
      </View>

      {/* Bottom: hint · library · shutter · text */}
      <View className="absolute left-0 right-0 bottom-0 pb-safe-offset-6 px-6 gap-4">
        <Text className={`text-xs font-sans text-center px-6 ${notice ? 'text-amber-300/90' : 'text-white/55'}`}>
          {notice
            ? notice
            : recording
              ? 'Release to stop · Double-tap to flip'
              : `Tap for photo · Hold for video (${MAX_VIDEO_SECONDS}s) · Double-tap to flip`}
        </Text>

        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={chooseFromLibrary}
            disabled={recording}
            accessibilityLabel="Choose from library"
            className="w-14 h-14 rounded-2xl overflow-hidden items-center justify-center active:opacity-70"
            style={{ backgroundColor: GLASS_BG, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
          >
            {libraryThumb ? (
              <Image source={{ uri: libraryThumb }} className="w-full h-full" contentFit="cover" />
            ) : (
              <SymbolView name="photo.on.rectangle" size={22} tintColor="#ffffff" />
            )}
          </Pressable>

          <CaptureButton
            recording={recording}
            busy={busy}
            disabled={!device || !ready || busy}
            progress={progress}
            onTap={takePhoto}
            onHoldStart={beginHold}
            onHoldEnd={endHold}
          />

          {onTextPost ? (
            <Pressable
              onPress={onTextPost}
              disabled={recording}
              accessibilityLabel="Text post"
              className="w-14 h-14 rounded-2xl items-center justify-center active:opacity-70"
              style={{ backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER }}
            >
              <Text className="text-white text-lg font-sans-semibold">Aa</Text>
            </Pressable>
          ) : (
            <View className="w-14 h-14" />
          )}
        </View>
      </View>
    </View>
  );
}
