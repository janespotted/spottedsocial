import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { CalendarPlus, Images, Sunrise, Ticket as TicketIcon, Users, type LucideIcon } from 'lucide-react-native';
import { Avatar } from '@/components/avatar';
import { DayPlaceholder } from '@/components/day-placeholder';
import { ErrorState } from '@/components/empty-state';
import { PressableScale, Reveal } from '@/components/motion';
import { SPRING, useNudge } from '@/lib/motion';
import { RECAP_PHOTO_GROUP, recapActivePhotoId } from '@/lib/recap-transitions';
import Transition from 'react-native-screen-transitions';
import { Polaroid } from '@/components/recap-cover';
import { useNightMode } from '@/hooks/use-night-mode';
import { useNightRecap, useRecapPictures, type RecapPicture } from '@/hooks/use-night-recap';
import { useSession } from '@/hooks/use-session';
import {
  addLibraryPhoto,
  MAX_RECAP_PHOTOS,
  NIGHT_RECAP_KEY,
  recapChapters,
  recapDateLabel,
  type NightRecap,
  type RecapChapter,
} from '@/lib/night-recap';
import { cityToTimezone } from '@/lib/tonight';
import {
  NEON,
  outlineControl,
  primaryControl,
  primaryControlText,
  recapPanel,
  TICKET_INK,
  TICKET_MUTED,
  TICKET_PAPER,
} from '@/lib/theme';

const CHAPTER: Record<RecapChapter, { tab: string; number: string }> = {
  stops: { tab: 'The stops', number: 'THE STOPS' },
  pictures: { tab: 'The pictures', number: 'THE PICTURES' },
  people: { tab: 'The people', number: 'THE PEOPLE' },
};
const CHAPTER_KEYS: RecapChapter[] = ['stops', 'pictures', 'people'];
const TAB_GAP = 6;
/** Resting angles for the scrapbook photos, by position in a row of three. */
const PHOTO_TILT = [-5, 6, -3];

function clock(iso: string, city: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: cityToTimezone(city) });
}

/** A chapter page's visibility, 1 when centred, 0 a page away — drives its Reveal. */
function usePageVisibility(progress: SharedValue<number>, i: number) {
  return useDerivedValue(() => 1 - Math.min(1, Math.abs(progress.value - i)));
}

/** A stop as a little ticket (screenshot 03). "Until" only when recorded. */
function Ticket({ stop, index, city }: { stop: NightRecap['stops'][number]; index: number; city: string }) {
  const where = [stop.neighborhood, stop.left_at ? `Until ${clock(stop.left_at, city)}` : null].filter(Boolean).join(' · ');
  return (
    <View
      className="rounded-lg px-4 py-3.5"
      style={{
        backgroundColor: TICKET_PAPER,
        boxShadow: '0 6px 18px rgba(8, 3, 20, 0.35)',
      }}
      accessible
      accessibilityLabel={`${index === 0 ? 'First stop' : 'Next stop'}, ${stop.venue_name}, ${clock(stop.arrived_at, city)}${
        stop.left_at ? ` until ${clock(stop.left_at, city)}` : ''
      }`}
    >
      <View className="flex-row justify-between pb-2 mb-2 border-b border-dashed" style={{ borderColor: '#9B849F' }}>
        <Text className="text-[11px] font-sans-medium" style={{ color: TICKET_INK }}>
          {index === 0 ? 'FIRST STOP' : 'NEXT STOP'}
        </Text>
        <Text className="text-[11px] font-sans-medium" style={{ color: TICKET_INK }}>
          {clock(stop.arrived_at, city)}
        </Text>
      </View>
      <Text className="text-2xl font-sans-semibold" style={{ color: TICKET_INK }} numberOfLines={2}>
        {stop.venue_name}
      </Text>
      {where ? (
        <Text className="text-xs font-sans mt-1" style={{ color: TICKET_MUTED }}>
          {where}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * An empty chapter's placeholder inside the story panel: a dashed card, a
 * Lucide icon, two lines, and optionally the one action that fills it.
 */
function ChapterPlaceholder({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View
      className="items-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-5 py-6"
      accessible={!action}
      accessibilityLabel={action ? undefined : `${title}. ${body}`}
    >
      <View className="w-14 h-14 rounded-[20px] items-center justify-center mb-3 bg-[#d4ff00]/10 border border-[#d4ff00]/30">
        <Icon size={26} color={NEON} strokeWidth={1.9} />
      </View>
      <Text className="text-white text-base font-sans-semibold text-center">{title}</Text>
      <Text className="text-white/60 text-sm font-sans text-center leading-5 mt-1">{body}</Text>
      {action ? (
        <PressableScale
          onPress={action.onPress}
          className={`mt-4 min-h-11 px-5 rounded-full items-center justify-center ${primaryControl}`}
        >
          <Text className={`text-[15px] font-sans-semibold ${primaryControlText}`}>{action.label}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function Title({ children, when }: { children: string; when: SharedValue<number> }) {
  return (
    <Reveal when={when} from={{ y: 10 }} delay={40}>
      <Text className="text-white text-[33px] leading-[36px] font-sans-semibold mt-3 mb-6">{children}</Text>
    </Reveal>
  );
}

function ArrowConnector({ label, when, delay }: { label: string; when: SharedValue<number>; delay: number }) {
  return (
    <Reveal when={when} delay={delay} from={{ y: -6, scale: 0.9 }}>
      <View className="flex-row items-center justify-center gap-1.5 py-3">
        <SymbolView name="arrow.down" size={11} tintColor="rgba(255,255,255,0.7)" />
        <Text className="text-white/70 text-[11px] font-sans">{label}</Text>
      </View>
    </Reveal>
  );
}

/** Tickets drop onto the table one after another and settle at an angle. */
function StopsChapter({ recap, city, when }: { recap: NightRecap; city: string; when: SharedValue<number> }) {
  if (recap.stops.length === 0) {
    return (
      <>
        <Title when={when}>{'No stops\non the map.'}</Title>
        <Reveal when={when} delay={140} from={{ y: 18, scale: 0.97 }}>
          <ChapterPlaceholder
            icon={TicketIcon}
            title="No check-ins last night"
            body="Check in when you get somewhere and each spot lands here as a ticket."
          />
        </Reveal>
      </>
    );
  }
  return (
    <>
      <Title when={when}>{recap.stops.length === 1 ? 'You picked\nyour spot.' : 'You made\nthe rounds.'}</Title>
      {recap.stops.map((stop, i) => (
        <View key={`${stop.arrived_at}-${i}`}>
          {i > 0 ? (
            <ArrowConnector
              when={when}
              delay={140 + i * 170 - 70}
              label={i === recap.stops.length - 1 ? 'one more stop' : 'next stop'}
            />
          ) : null}
          <Reveal
            when={when}
            delay={140 + i * 170}
            rotate={i % 2 === 0 ? -2 : 2}
            from={{ y: -34, scale: 1.08, rotate: i % 2 === 0 ? 4 : -4 }}
            spring={SPRING.land}
          >
            <Ticket stop={stop} index={i} city={city} />
          </Reveal>
        </View>
      ))}
    </>
  );
}

/**
 * One scrapbook photo. A tap picks it up — it straightens (its tilt is undone)
 * — and pushes the viewer; the picture then zooms into it (a
 * react-native-screen-transitions boundary, app/(recap)/_layout.tsx). Straightening first matters: the
 * transition measures the picture's layout frame, which is unrotated, so a
 * tilted photo would snap. Back here it lands straight, then re-tilts.
 */
function ScrapbookPhoto({
  photo,
  i,
  count,
  when,
}: {
  photo: RecapPicture;
  i: number;
  count: number;
  when: SharedValue<number>;
}) {
  const tilt = PHOTO_TILT[i % 3];
  const reduce = useReducedMotion();
  const straight = useSharedValue(0);
  const picked = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!picked.current) return;
      picked.current = false;
      // Let the photo land first (the shared transition), then re-tilt.
      straight.value = withDelay(reduce ? 0 : 460, withSpring(0, SPRING.land));
    }, [reduce, straight])
  );

  const untilt = useAnimatedStyle(() => ({ transform: [{ rotate: `${-tilt * straight.value}deg` }] }));

  const open = () => {
    if (picked.current) return;
    picked.current = true;
    recapActivePhotoId.value = photo.id;
    straight.value = withTiming(1, { duration: reduce ? 0 : 140 });
    // Navigate once it is upright: the zoom measures the picture when the
    // transition starts, and an upright picture is exactly its frame.
    setTimeout(() => router.push({ pathname: '/recap-photo', params: { index: String(i) } }), reduce ? 0 : 140);
  };

  return (
    <View className={`w-1/3 items-center ${i % 3 === 1 ? 'mt-4' : ''}`}>
      <Reveal when={when} delay={140 + i * 110} rotate={tilt} from={{ y: 40, scale: 0.7, rotate: 0 }} spring={SPRING.land}>
        <Animated.View style={untilt}>
          <PressableScale
            onPress={open}
            scaleTo={0.97}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open ${photo.video ? 'video' : 'picture'} ${i + 1} of ${count}`}
          >
            <Transition.Boundary group={RECAP_PHOTO_GROUP} id={photo.id} anchor="center" scaleMode="uniform">
              <Polaroid width={92} rotate={0} thumbhash={photo.thumbhash} url={photo.url} video={photo.video} boundTarget />
            </Transition.Boundary>
          </PressableScale>
        </Animated.View>
      </Reveal>
    </View>
  );
}

/**
 * Photos are dealt onto the table; a tap opens one in the viewer. They are
 * the night's photo and video posts (a video shows its poster), anything
 * added from the library, and — once the user allows it — photos from the
 * camera roll taken during their stops, which stay on the phone. "Add from
 * your library" is a small extra once there is something here; an empty
 * chapter offers the camera roll instead, never an upload form.
 */
function PicturesChapter({
  recap,
  when,
}: {
  recap: NightRecap;
  when: SharedValue<number>;
}) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const { pictures, access, requestAccess, canSuggest } = useRecapPictures(recap);
  const [adding, setAdding] = useState(false);
  const full = recap.photos.length >= MAX_RECAP_PHOTOS;
  const onDevice = pictures.some((p) => p.onDevice);
  const askCameraRoll = canSuggest && access === 'undetermined';

  const add = async () => {
    if (!session || adding) return;
    setAdding(true);
    try {
      const added = await addLibraryPhoto(recap.id, session.user.id);
      if (added) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await queryClient.invalidateQueries({ queryKey: [NIGHT_RECAP_KEY] });
      }
    } catch (e) {
      Alert.alert('Couldn’t add that picture', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setAdding(false);
    }
  };

  const showCameraRoll = async () => {
    const granted = await requestAccess();
    if (granted === 'all' || granted === 'limited') void Haptics.selectionAsync();
  };

  if (pictures.length === 0) {
    return (
      <>
        <Title when={when}>{'Camera roll\nconfidential.'}</Title>
        <Reveal when={when} delay={140} from={{ y: 18, scale: 0.97 }}>
          {askCameraRoll ? (
            <ChapterPlaceholder
              icon={Images}
              title="Find your photos from last night"
              body="Spotted looks only at photos you took during your stops. They stay on this phone."
              action={{ label: 'Show my photos', onPress: showCameraRoll }}
            />
          ) : canSuggest && access === 'denied' ? (
            <ChapterPlaceholder
              icon={Images}
              title="No pictures from last night"
              body="Allow photo access in Settings and the photos you took during your stops show up here."
              action={{ label: 'Open Settings', onPress: () => void Linking.openSettings() }}
            />
          ) : (
            <ChapterPlaceholder
              icon={Images}
              title="No pictures from last night"
              body="Photos and videos you post while you’re out, and photos you take during your stops, land here."
            />
          )}
        </Reveal>
      </>
    );
  }

  return (
    <>
      <Title when={when}>{'Camera roll\nconfidential.'}</Title>
      <View className="flex-row flex-wrap gap-y-4 py-2">
        {pictures.map((photo, i) => (
          <ScrapbookPhoto key={photo.id} photo={photo} i={i} count={pictures.length} when={when} />
        ))}
      </View>
      <Reveal when={when} delay={420} className="flex-row flex-wrap items-center gap-x-5 mt-3">
        {full ? null : (
          <PressableScale onPress={add} disabled={adding} className="flex-row items-center gap-2 min-h-11">
            {adding ? <ActivityIndicator size="small" color={NEON} /> : <SymbolView name="plus" size={14} tintColor={NEON} />}
            <Text className="text-[#d4ff00] text-sm font-sans-medium">Add from your library</Text>
          </PressableScale>
        )}
        {askCameraRoll ? (
          <PressableScale onPress={showCameraRoll} className="flex-row items-center gap-2 min-h-11">
            <SymbolView name="photo.on.rectangle" size={14} tintColor={NEON} />
            <Text className="text-[#d4ff00] text-sm font-sans-medium">Find more on your phone</Text>
          </PressableScale>
        ) : null}
      </Reveal>
      <Reveal when={when} delay={480}>
        <Text className="text-white/60 text-xs font-sans mt-1">
          {onDevice
            ? 'Your night, saved here. Only you. Camera-roll photos stay on this phone.'
            : 'Your night, saved here. Only you.'}
        </Text>
      </Reveal>
    </>
  );
}

/** Friends slide in one by one; each row lifts under the finger. */
function PeopleChapter({ recap, when }: { recap: NightRecap; when: SharedValue<number> }) {
  if (recap.people.length === 0) {
    return (
      <>
        <Title when={when}>{'Just you\nand the night.'}</Title>
        <Reveal when={when} delay={140} from={{ y: 18, scale: 0.97 }}>
          <ChapterPlaceholder
            icon={Users}
            title="No crossed paths"
            body="Friends who share their check-ins with you show up here when you’re at the same spot."
          />
        </Reveal>
      </>
    );
  }
  return (
    <>
      <Title when={when}>{'Look who\nwas there.'}</Title>
      {recap.people.map((person, i) => (
        <Reveal key={person.friend_id} when={when} delay={140 + i * 90} from={{ x: 28 }}>
          <PressableScale
            onPress={() => router.push({ pathname: '/crossed-paths', params: { friendId: person.friend_id } })}
            scaleTo={0.98}
            accessibilityLabel={`${person.display_name}, crossed paths at ${person.venue_name}`}
            className={`flex-row items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-white/10' : ''}`}
          >
            <View className="rounded-full border-2" style={{ borderColor: '#9273A5' }}>
              <Avatar name={person.display_name} url={person.avatar_url} size="md" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-white text-[15px] font-sans-medium" numberOfLines={1}>
                {person.display_name}
              </Text>
              <Text className="text-white/60 text-xs font-sans mt-0.5" numberOfLines={1}>
                Crossed paths at {person.venue_name}
              </Text>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.6)" />
          </PressableScale>
        </Reveal>
      ))}
      <Reveal when={when} delay={160 + recap.people.length * 90}>
        <Text className="text-white/60 text-xs font-sans mt-5">Overlapping check-ins shared with you.</Text>
      </Reveal>
    </>
  );
}

/** One chapter tab; its label brightens as its page nears the centre. */
function ChapterTab({
  label,
  i,
  progress,
  width,
  onPress,
  selected,
}: {
  label: string;
  i: number;
  progress: SharedValue<number>;
  width: number;
  onPress: () => void;
  selected: boolean;
}) {
  const text = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(progress.value - i), [0, 1], [1, 0.55], Extrapolation.CLAMP),
  }));
  return (
    <PressableScale
      onPress={onPress}
      haptic="none"
      scaleTo={0.97}
      accessibilityRole="tab"
      accessibilityLabel={label}
      style={{ width }}
      className="min-h-11 pt-2"
    >
      <View style={{ height: 3, borderRadius: 2, backgroundColor: '#584366' }} />
      <Animated.Text
        style={text}
        className="text-center text-[11px] font-sans-medium text-white mt-2"
        accessibilityState={{ selected }}
      >
        {label}
      </Animated.Text>
    </PressableScale>
  );
}

/**
 * Morning After — "Replay the night" (client brief §3; screenshots 03–06).
 * The three chapters are a real pager: swipe between them (the page follows
 * the finger, a flick carries its velocity into the spring), or tap a label
 * or Next / Back. The lime bar and the labels track the swipe continuously,
 * the panel's height morphs between chapters, and each chapter assembles as
 * it comes into view — tickets drop onto the table, photos are dealt,
 * friends slide in. Nothing advances on its own. Photos fly into the viewer
 * (/recap-photo), zooming out of their Polaroids. All of it honours Reduce
 * Motion. Private: the data comes only from get_night_recap().
 */
export default function MorningAfter() {
  const recapQuery = useNightRecap();
  const recap = recapQuery.data ?? null;
  // Warm the picture links and camera-roll scan before the chapter is reached
  useRecapPictures(recap);
  const { city } = useNightMode();
  const reduce = useReducedMotion();
  const { width: winW } = useWindowDimensions();
  const W = winW - 32;
  const tabW = (W - TAB_GAP * 2) / 3;
  const chapters = useMemo(() => (recap ? recapChapters(recap) : []), [recap]);
  const count = Math.max(1, chapters.length);

  // `?chapter=pictures` opens straight on a chapter (links, notifications).
  const { chapter: startAt } = useLocalSearchParams<{ chapter?: string }>();
  const initial = Math.max(0, CHAPTER_KEYS.indexOf((startAt ?? '') as RecapChapter));
  const [index, setIndex] = useState(initial);
  const progress = useSharedValue(initial);
  const fromGesture = useRef(false);

  useEffect(() => {
    const i = CHAPTER_KEYS.indexOf((startAt ?? '') as RecapChapter);
    if (i >= 0) setIndex(i);
  }, [startAt]);

  // Taps (labels, Next / Back, links) spring the pager; a swipe already did.
  useEffect(() => {
    if (fromGesture.current) {
      fromGesture.current = false;
      return;
    }
    progress.value = reduce ? index : withSpring(index, SPRING.page);
  }, [index, progress, reduce]);

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(count - 1, i));
      if (next !== index) void Haptics.selectionAsync();
      setIndex(next);
    },
    [count, index]
  );

  const settleFromSwipe = (i: number) => {
    if (i !== index) void Haptics.selectionAsync();
    fromGesture.current = i !== index;
    setIndex(i);
  };

  const startProgress = useSharedValue(0);
  const swipe = usePanGesture({
    // Horizontal only, so the page still scrolls vertically.
    activeOffsetX: [-12, 12],
    failOffsetY: [-14, 14],
    onBegin: () => {
      'worklet';
      startProgress.value = progress.value;
    },
    onUpdate: (e) => {
      'worklet';
      const raw = startProgress.value - e.translationX / W;
      const max = count - 1;
      // Rubber band past the first and last chapter.
      progress.value = raw < 0 ? raw / 3 : raw > max ? max + (raw - max) / 3 : raw;
    },
    onDeactivate: (e) => {
      'worklet';
      const from = Math.round(startProgress.value);
      const projected = progress.value - (e.velocityX / W) * 0.2;
      const target = Math.min(count - 1, Math.max(0, Math.min(from + 1, Math.max(from - 1, Math.round(projected)))));
      progress.value = withSpring(target, { ...SPRING.page, velocity: -e.velocityX / W });
      scheduleOnRN(settleFromSwipe, target);
    },
  });

  // Each page reports its height; the panel morphs between them as you swipe.
  const [heights, setHeights] = useState<number[]>([0, 0, 0]);
  const heightsSV = useSharedValue<number[]>([0, 0, 0]);
  useEffect(() => {
    heightsSV.value = heights;
  }, [heights, heightsSV]);
  const onPageLayout = (i: number, h: number) =>
    setHeights((prev) => (Math.abs(prev[i] - h) < 1 ? prev : prev.map((v, j) => (j === i ? h : v))));
  const panelStyle = useAnimatedStyle(() => {
    const hs = heightsSV.value;
    if (hs.some((h) => h === 0)) return {};
    return { height: interpolate(progress.value, [0, 1, 2], hs, Extrapolation.CLAMP) };
  });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -progress.value * W }] }));
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * (tabW + TAB_GAP) }] }));

  const v0 = usePageVisibility(progress, 0);
  const v1 = usePageVisibility(progress, 1);
  const v2 = usePageVisibility(progress, 2);
  const visibility = [v0, v1, v2];

  const sameCrew = () =>
    router.push({
      pathname: '/create-plan',
      params: {
        withPeople: JSON.stringify(
          (recap?.people ?? []).map((p) => ({ id: p.friend_id, display_name: p.display_name, avatar_url: p.avatar_url }))
        ),
      },
    });

  const last = index === count - 1;
  const nextLabel = last ? (recap && recap.people.length > 0 ? 'Same crew, new plan' : 'Make the next plan') : 'Next';
  const nudge = useNudge(4, 2600);

  return (
    <View className="flex-1 bg-[#110a24]">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerClassName="px-4 pt-safe-offset-2 pb-safe-offset-6">
        <PressableScale
          onPress={() => router.back()}
          haptic="none"
          accessibilityLabel="Back"
          className="flex-row items-center gap-2 self-start min-h-11 mb-1"
        >
          <SymbolView name="arrow.left" size={14} tintColor="rgba(255,255,255,0.7)" />
          <Text className="text-white/70 text-sm font-sans">Back</Text>
        </PressableScale>

        {recapQuery.isLoading ? (
          <View className="py-24 items-center">
            <ActivityIndicator color={NEON} />
          </View>
        ) : recapQuery.isError ? (
          <ErrorState title="Couldn’t load your recap" onRetry={() => recapQuery.refetch()} />
        ) : !recap || chapters.length === 0 ? (
          <Animated.View entering={FadeInDown.springify().damping(18)} className="mt-6">
            <DayPlaceholder
              icons={[Sunrise, TicketIcon, Images]}
              title="Nothing to replay yet"
              body="Morning After shows the spots you checked into, your pictures and the friends you crossed paths with — after a night out."
              action={{ label: 'Make a plan', icon: CalendarPlus, onPress: () => router.push('/create-plan') }}
            />
          </Animated.View>
        ) : (
          <>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-[15px] font-sans-medium" accessibilityRole="header">
                Morning After
              </Text>
              <Text className="text-white/60 text-[11px] font-sans-medium">
                {recapDateLabel(recap.night_date)} · ONLY YOU
              </Text>
            </View>

            {/* Tabs: three quiet bars and one lime bar that rides the swipe */}
            <View className="mb-4" accessibilityRole="tablist">
              <View className="flex-row" style={{ gap: TAB_GAP }}>
                {chapters.map((c, i) => (
                  <ChapterTab
                    key={c}
                    label={CHAPTER[c].tab}
                    i={i}
                    progress={progress}
                    width={tabW}
                    selected={i === index}
                    onPress={() => goTo(i)}
                  />
                ))}
              </View>
              <Animated.View
                pointerEvents="none"
                style={[
                  { position: 'absolute', top: 8, left: 0, width: tabW, height: 3, borderRadius: 2, backgroundColor: NEON },
                  indicator,
                ]}
              />
            </View>

            {/* The story panel: a swipeable pager whose height follows the page */}
            <Reveal from={{ y: 22, scale: 0.98 }} delay={60}>
              <GestureDetector gesture={swipe}>
                <Animated.View
                  className={`rounded-[20px] overflow-hidden min-h-105 ${recapPanel}`}
                  style={panelStyle}
                  accessibilityLiveRegion="polite"
                >
                  <Animated.View style={[{ flexDirection: 'row', width: W * count, alignItems: 'flex-start' }, rowStyle]}>
                    {chapters.map((c, i) => (
                      <View
                        key={c}
                        style={{ width: W }}
                        className="px-4 py-5 min-h-105"
                        onLayout={(e) => onPageLayout(i, e.nativeEvent.layout.height)}
                        accessibilityElementsHidden={i !== index}
                        importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
                      >
                        <Reveal when={visibility[i]} from={{ y: 6 }}>
                          <Text className="text-white/75 text-[11px] font-sans-medium tracking-[1.5px]">
                            {String(i + 1).padStart(2, '0')} / {CHAPTER[c].number}
                          </Text>
                        </Reveal>
                        {c === 'stops' ? (
                          <StopsChapter recap={recap} city={city} when={visibility[i]} />
                        ) : c === 'pictures' ? (
                          <PicturesChapter recap={recap} when={visibility[i]} />
                        ) : (
                          <PeopleChapter recap={recap} when={visibility[i]} />
                        )}
                      </View>
                    ))}
                  </Animated.View>
                </Animated.View>
              </GestureDetector>
            </Reveal>

            <Reveal from={{ y: 16 }} delay={160} className="flex-row gap-2.5 mt-4">
              {index > 0 ? (
                <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)}>
                  <PressableScale
                    onPress={() => goTo(index - 1)}
                    haptic="none"
                    accessibilityLabel="Previous chapter"
                    className={`w-14 min-h-12 rounded-full items-center justify-center ${outlineControl}`}
                  >
                    <SymbolView name="arrow.left" size={16} tintColor="#ffffff" />
                  </PressableScale>
                </Animated.View>
              ) : null}
              <PressableScale
                onPress={last ? sameCrew : () => goTo(index + 1)}
                haptic={last ? 'medium' : 'none'}
                accessibilityLabel={nextLabel}
                className={`flex-1 min-h-12 rounded-full flex-row items-center justify-center gap-2 ${primaryControl}`}
              >
                <Animated.Text
                  key={nextLabel}
                  entering={FadeIn.duration(200)}
                  className={`text-[15px] font-sans-semibold ${primaryControlText}`}
                >
                  {nextLabel}
                </Animated.Text>
                <Animated.View style={nudge}>
                  <SymbolView name="arrow.right" size={15} tintColor="#1a0f2e" weight="semibold" />
                </Animated.View>
              </PressableScale>
            </Reveal>
          </>
        )}
      </ScrollView>

    </View>
  );
}
