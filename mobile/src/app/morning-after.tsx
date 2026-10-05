import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/avatar';
import { CalendarPlus, Images, Sunrise, Ticket as TicketIcon, Users, type LucideIcon } from 'lucide-react-native';
import { DayPlaceholder } from '@/components/day-placeholder';
import { ErrorState } from '@/components/empty-state';
import { Polaroid } from '@/components/recap-cover';
import { useNightMode } from '@/hooks/use-night-mode';
import { useNightRecap, useRecapPhotoUrls } from '@/hooks/use-night-recap';
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

function clock(iso: string, city: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: cityToTimezone(city) });
}

/** A stop as a little ticket (screenshot 03). "Until" only when recorded. */
function Ticket({ stop, index, city }: { stop: NightRecap['stops'][number]; index: number; city: string }) {
  const where = [stop.neighborhood, stop.left_at ? `Until ${clock(stop.left_at, city)}` : null].filter(Boolean).join(' · ');
  return (
    <View
      className="rounded-lg px-4 py-3.5"
      style={{ backgroundColor: TICKET_PAPER, transform: [{ rotate: index % 2 === 0 ? '-2deg' : '2deg' }] }}
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

/** An empty chapter's placeholder inside the story panel: a dashed card, a Lucide icon, two lines. */
function ChapterPlaceholder({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <View
      className="items-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-5 py-6"
      accessible
      accessibilityLabel={`${title}. ${body}`}
    >
      <View className="w-14 h-14 rounded-[20px] items-center justify-center mb-3 bg-[#d4ff00]/10 border border-[#d4ff00]/30">
        <Icon size={26} color={NEON} strokeWidth={1.9} />
      </View>
      <Text className="text-white text-base font-sans-semibold text-center">{title}</Text>
      <Text className="text-white/60 text-sm font-sans text-center leading-5 mt-1">{body}</Text>
    </View>
  );
}

function StopsChapter({ recap, city }: { recap: NightRecap; city: string }) {
  const one = recap.stops.length === 1;
  if (recap.stops.length === 0) {
    return (
      <>
        <Text className="text-white text-[33px] leading-[36px] font-sans-semibold mt-3 mb-6">{'No stops\non the map.'}</Text>
        <ChapterPlaceholder
          icon={TicketIcon}
          title="No check-ins last night"
          body="Check in when you get somewhere and each spot lands here as a ticket."
        />
      </>
    );
  }
  return (
    <>
      <Text className="text-white text-[33px] leading-[36px] font-sans-semibold mt-3 mb-6">
        {one ? 'You picked\nyour spot.' : 'You made\nthe rounds.'}
      </Text>
      {recap.stops.map((stop, i) => (
        <View key={`${stop.arrived_at}-${i}`}>
          {i > 0 ? (
            <View className="flex-row items-center justify-center gap-1.5 py-3">
              <SymbolView name="arrow.down" size={11} tintColor="rgba(255,255,255,0.7)" />
              <Text className="text-white/70 text-[11px] font-sans">
                {i === recap.stops.length - 1 ? 'one more stop' : 'next stop'}
              </Text>
            </View>
          ) : null}
          <Ticket stop={stop} index={i} city={city} />
        </View>
      ))}
    </>
  );
}

function PicturesChapter({ recap }: { recap: NightRecap }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const urls = useRecapPhotoUrls(recap);
  const [adding, setAdding] = useState(false);
  const full = recap.photos.length >= MAX_RECAP_PHOTOS;

  const add = async () => {
    if (!session || adding) return;
    setAdding(true);
    try {
      const added = await addLibraryPhoto(recap.id, session.user.id);
      if (added) await queryClient.invalidateQueries({ queryKey: [NIGHT_RECAP_KEY] });
    } catch (e) {
      Alert.alert('Couldn’t add that picture', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <Text className="text-white text-[33px] leading-[36px] font-sans-semibold mt-3 mb-5">{'Camera roll\nconfidential.'}</Text>
      {recap.photos.length === 0 ? (
        // Empty frames, as in the mockup — tapping one adds a picture.
        <View className="flex-row py-2">
          {[-5, 6, -3].map((rotate, i) => (
            <Pressable
              key={rotate}
              onPress={add}
              disabled={adding}
              accessibilityRole="button"
              accessibilityLabel="Add a picture from your library"
              className="w-1/3 items-center"
            >
              <Polaroid
                width={92}
                rotate={rotate}
                icon="photo.badge.plus"
                tint="rgba(255,255,255,0.7)"
                className={`opacity-80 ${i === 1 ? 'mt-4' : ''}`}
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-y-4 py-2">
          {recap.photos.map((photo, i) => (
            <Pressable
              key={photo.id}
              onPress={() => router.push({ pathname: '/recap-photo', params: { index: String(i) } })}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Open picture ${i + 1} of ${recap.photos.length}`}
              className="w-1/3 items-center"
            >
              <Polaroid
                width={92}
                rotate={[-5, 6, -3][i % 3]}
                photo={photo}
                url={urls.data?.get(photo.storage_key)}
                className={i % 3 === 1 ? 'mt-4' : ''}
              />
            </Pressable>
          ))}
        </View>
      )}
      {full ? null : (
        <Pressable
          onPress={add}
          disabled={adding}
          accessibilityRole="button"
          className="flex-row items-center gap-2 min-h-11 mt-3 self-start active:opacity-70"
        >
          {adding ? <ActivityIndicator size="small" color={NEON} /> : <SymbolView name="plus" size={14} tintColor={NEON} />}
          <Text className="text-[#d4ff00] text-sm font-sans-medium">Add from your library</Text>
        </Pressable>
      )}
      <Text className="text-white/60 text-xs font-sans mt-1">
        {recap.photos.length === 0
          ? 'No pictures from last night yet. Add yours — only you can see them.'
          : 'Your night, saved here. Only you.'}
      </Text>
    </>
  );
}

function PeopleChapter({ recap }: { recap: NightRecap }) {
  if (recap.people.length === 0) {
    return (
      <>
        <Text className="text-white text-[33px] leading-[36px] font-sans-semibold mt-3 mb-6">{'Just you\nand the night.'}</Text>
        <ChapterPlaceholder
          icon={Users}
          title="No crossed paths"
          body="Friends who share their check-ins with you show up here when you’re at the same spot."
        />
      </>
    );
  }
  return (
    <>
      <Text className="text-white text-[33px] leading-[36px] font-sans-semibold mt-3 mb-4">{'Look who\nwas there.'}</Text>
      {recap.people.map((person, i) => (
        <Pressable
          key={person.friend_id}
          onPress={() => router.push({ pathname: '/crossed-paths', params: { friendId: person.friend_id } })}
          accessibilityRole="button"
          accessibilityLabel={`${person.display_name}, crossed paths at ${person.venue_name}`}
          className={`flex-row items-center gap-3 py-3.5 active:opacity-70 ${i > 0 ? 'border-t border-white/10' : ''}`}
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
        </Pressable>
      ))}
      <Text className="text-white/60 text-xs font-sans mt-5">Overlapping check-ins shared with you.</Text>
    </>
  );
}

/**
 * Morning After — "Replay the night" (client brief §3; screenshots 03–05).
 * Three chapters the user moves through by tapping the labels or Next /
 * Back; nothing advances on its own. All three always show, as in the
 * mockup: an empty one (no check-ins, no photos, no crossed paths) shows a
 * placeholder instead of sample content, and a night with no activity at
 * all gets an honest empty state.
 * Private: the data comes only from get_night_recap(), the owner's own.
 */
export default function MorningAfter() {
  const recapQuery = useNightRecap();
  const recap = recapQuery.data ?? null;
  const { city } = useNightMode();
  const chapters = useMemo(() => (recap ? recapChapters(recap) : []), [recap]);
  // `?chapter=pictures` opens straight on a chapter (links, notifications).
  const { chapter: startAt } = useLocalSearchParams<{ chapter?: string }>();
  const [index, setIndex] = useState(() => Math.max(0, (['stops', 'pictures', 'people'] as string[]).indexOf(startAt ?? '')));
  useEffect(() => {
    const i = (['stops', 'pictures', 'people'] as string[]).indexOf(startAt ?? '');
    if (i >= 0) setIndex(i);
  }, [startAt]);
  useEffect(() => {
    if (index >= chapters.length && chapters.length > 0) setIndex(chapters.length - 1);
  }, [chapters.length, index]);
  const chapter = chapters[index];
  const last = index === chapters.length - 1;

  const sameCrew = () =>
    router.push({
      pathname: '/create-plan',
      params: {
        withPeople: JSON.stringify(
          (recap?.people ?? []).map((p) => ({ id: p.friend_id, display_name: p.display_name, avatar_url: p.avatar_url }))
        ),
      },
    });

  return (
    <View className="flex-1 bg-[#110a24]">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerClassName="px-4 pt-safe-offset-2 pb-safe-offset-6">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          className="flex-row items-center gap-2 self-start min-h-11 mb-1 active:opacity-70"
        >
          <SymbolView name="arrow.left" size={14} tintColor="rgba(255,255,255,0.7)" />
          <Text className="text-white/70 text-sm font-sans">Back</Text>
        </Pressable>

        {recapQuery.isLoading ? (
          <View className="py-24 items-center">
            <ActivityIndicator color={NEON} />
          </View>
        ) : recapQuery.isError ? (
          <ErrorState title="Couldn’t load your recap" onRetry={() => recapQuery.refetch()} />
        ) : !recap || chapters.length === 0 ? (
          <View className="mt-6">
            <DayPlaceholder
              icons={[Sunrise, TicketIcon, Images]}
              title="Nothing to replay yet"
              body="Morning After shows the spots you checked into, your pictures and the friends you crossed paths with — after a night out."
              action={{ label: 'Make a plan', icon: CalendarPlus, onPress: () => router.push('/create-plan') }}
            />
          </View>
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

            <View className="flex-row gap-1.5 mb-4" accessibilityRole="tablist">
              {chapters.map((c, i) => {
                const selected = i === index;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setIndex(i)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    className="flex-1 min-h-11 pt-2"
                    style={{ borderTopWidth: 3, borderTopColor: selected ? NEON : '#584366' }}
                  >
                    <Text className={`text-center text-[11px] font-sans-medium ${selected ? 'text-white' : 'text-white/60'}`}>
                      {CHAPTER[c].tab}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className={`rounded-[20px] px-4 py-5 min-h-[420px] ${recapPanel}`} accessibilityLiveRegion="polite">
              <Text className="text-white/75 text-[11px] font-sans-medium tracking-[1.5px]">
                {String(index + 1).padStart(2, '0')} / {CHAPTER[chapter].number}
              </Text>
              {chapter === 'stops' ? (
                <StopsChapter recap={recap} city={city} />
              ) : chapter === 'pictures' ? (
                <PicturesChapter recap={recap} />
              ) : (
                <PeopleChapter recap={recap} />
              )}
            </View>

            <View className="flex-row gap-2.5 mt-4">
              {index > 0 ? (
                <Pressable
                  onPress={() => setIndex(index - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous chapter"
                  className={`w-14 min-h-12 rounded-full items-center justify-center ${outlineControl}`}
                >
                  <SymbolView name="arrow.left" size={16} tintColor="#ffffff" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={last ? sameCrew : () => setIndex(index + 1)}
                accessibilityRole="button"
                className={`flex-1 min-h-12 rounded-full flex-row items-center justify-center gap-2 active:opacity-85 ${primaryControl}`}
              >
                <Text className={`text-[15px] font-sans-semibold ${primaryControlText}`}>
                  {last ? (recap.people.length > 0 ? 'Same crew, new plan' : 'Make the next plan') : 'Next'}
                </Text>
                <SymbolView name="arrow.right" size={15} tintColor="#1a0f2e" weight="semibold" />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
