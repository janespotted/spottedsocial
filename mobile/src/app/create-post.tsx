import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from '@/components/styled';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { supabase } from '@/lib/supabase';
import { getPostExpiry, invalidateFeed } from '@/lib/posts';
import { validatePostText, validateVenueName } from '@/lib/validation';
import { useSession } from '@/hooks/use-session';

const NEON = '#d4ff00';

interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  fileExt: string;
}

interface VenueSuggestion {
  id: string;
  name: string;
}

type PostVisibility = 'close_friends' | 'all_friends' | 'mutual_friends';

/** Same audience tiers as the web PostCaptionScreen. */
const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: SFSymbol; description: string }[] = [
  { value: 'close_friends', label: 'Close Friends', icon: 'heart.fill', description: 'Only your closest friends' },
  { value: 'all_friends', label: 'All Friends', icon: 'person.2.fill', description: "Everyone you're friends with" },
  { value: 'mutual_friends', label: 'Mutual Friends', icon: 'person.3.fill', description: 'Friends + their friends' },
];

async function pickMedia(source: 'library' | 'camera'): Promise<PickedMedia | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images', 'videos'],
    quality: 0.8,
    videoMaxDuration: 14, // matches the native camera's hold-to-record cap
    allowsEditing: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  const isVideo = asset.type === 'video';
  const mimeType = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
  return {
    uri: asset.uri,
    type: isVideo ? 'video' : 'image',
    mimeType,
    fileExt: isVideo ? 'mp4' : mimeType === 'image/png' ? 'png' : 'jpg',
  };
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />;
}

/** Create-post composer — modal from the feed. Port of the web camera→caption flow. */
export default function CreatePostScreen() {
  const { session } = useSession();
  const { width } = useWindowDimensions();
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>('all_friends');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If checked in right now, pre-fill the venue (port of the web
  // fetchActiveCheckInOrCaptureLocation, minus raw GPS capture).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase
      .from('night_statuses')
      .select('venue_id, venue_name')
      .eq('user_id', session.user.id)
      .eq('status', 'out')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.venue_name) return;
        setVenueName(data.venue_name);
        setVenueId(data.venue_id ?? null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const chooseVisibility = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Who can see this post?',
        options: [...VISIBILITY_OPTIONS.map((o) => `${o.label} — ${o.description}`), 'Cancel'],
        cancelButtonIndex: VISIBILITY_OPTIONS.length,
      },
      (index) => {
        const opt = VISIBILITY_OPTIONS[index];
        if (opt) setVisibility(opt.value);
      }
    );
  };

  // Venue autocomplete against the venues table (mirrors the web composer)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = venueName.trim();
    if (term.length < 2 || venueId) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name')
        .ilike('name', `%${term}%`)
        .limit(4);
      setSuggestions(data ?? []);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [venueName, venueId]);

  const choose = async (source: 'library' | 'camera') => {
    const picked = await pickMedia(source);
    if (picked) setMedia(picked);
  };

  const share = async () => {
    if (!session || posting) return;
    const textCheck = validatePostText(caption);
    const venueCheck = validateVenueName(venueName);
    if (!textCheck.success || !venueCheck.success) {
      setError(textCheck.error ?? venueCheck.error ?? 'invalid post');
      return;
    }
    const text = textCheck.data!;
    if (!text && !media) {
      setError('add a photo or write something');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      let imagePath: string | null = null;
      if (media) {
        imagePath = `${session.user.id}/${Date.now()}.${media.fileExt}`;
        const body = await fetch(media.uri).then((r) => r.arrayBuffer());
        const { error: uploadErr } = await supabase.storage
          .from('post-images')
          .upload(imagePath, body, { contentType: media.mimeType, upsert: true });
        if (uploadErr) throw uploadErr;
      }
      const { error: insertErr } = await supabase.from('posts').insert({
        user_id: session.user.id,
        text,
        image_url: imagePath,
        media_type: media?.type ?? null,
        venue_name: venueCheck.data || null,
        venue_id: venueId,
        expires_at: getPostExpiry(),
        visibility,
      });
      if (insertErr) throw insertErr;
      invalidateFeed();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to share post');
      setPosting(false);
    }
  };

  const previewHeight = Math.min(width * 1.25, 380);

  return (
    <View className="flex-1 bg-[#110a24]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-4 border-b border-white/10">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="xmark" size={18} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
        <Text className="text-white text-base font-sans-semibold">New Post</Text>
        <Pressable onPress={share} disabled={posting} hitSlop={8}>
          {posting ? (
            <ActivityIndicator size="small" color={NEON} />
          ) : (
            <Text className="text-base font-sans-semibold" style={{ color: NEON }}>
              Share
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerClassName="p-4 gap-4 pb-safe-offset-6"
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        {/* Media picker / preview */}
        {media ? (
          <View className="rounded-2xl overflow-hidden" style={{ height: previewHeight }}>
            {media.type === 'video' ? (
              <VideoPreview uri={media.uri} />
            ) : (
              <Image source={{ uri: media.uri }} className="w-full h-full" contentFit="cover" />
            )}
            <Pressable
              onPress={() => setMedia(null)}
              hitSlop={8}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 items-center justify-center"
            >
              <SymbolView name="xmark" size={14} tintColor="#ffffff" />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-3">
            {(
              [
                { source: 'camera', icon: 'camera.fill', label: 'Camera' },
                { source: 'library', icon: 'photo.on.rectangle', label: 'Library' },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.source}
                onPress={() => choose(opt.source)}
                className="flex-1 h-28 rounded-2xl bg-white/5 border border-white/15 items-center justify-center gap-2 active:bg-white/10"
              >
                <SymbolView name={opt.icon} size={26} tintColor={NEON} />
                <Text className="text-white/70 text-sm font-sans">{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Caption */}
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="What's the vibe tonight?"
          placeholderTextColorClassName="accent-white/30"
          multiline
          maxLength={500}
          className="min-h-24 rounded-2xl bg-white/5 border border-white/15 px-4 py-3 text-white text-[16px] font-sans"
        />

        {/* Venue */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2 rounded-2xl bg-white/5 border border-white/15 px-4">
            <SymbolView name="mappin" size={16} tintColor={NEON} />
            <TextInput
              value={venueName}
              onChangeText={(t) => {
                setVenueName(t);
                setVenueId(null);
              }}
              placeholder="Add a venue (optional)"
              placeholderTextColorClassName="accent-white/30"
              className="flex-1 h-12 py-0 text-white text-[15px] font-sans"
            />
          </View>
          {suggestions.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => {
                setVenueName(v.name);
                setVenueId(v.id);
                setSuggestions([]);
              }}
              className="px-4 py-2.5 rounded-xl bg-white/5 active:bg-white/10"
            >
              <Text className="text-white/80 text-sm font-sans">{v.name}</Text>
            </Pressable>
          ))}
        </View>

        {/* Audience */}
        <Pressable
          onPress={chooseVisibility}
          className="flex-row items-center gap-2 rounded-2xl bg-white/5 border border-white/15 px-4 h-12 active:bg-white/10"
        >
          <SymbolView
            name={VISIBILITY_OPTIONS.find((o) => o.value === visibility)!.icon}
            size={16}
            tintColor={NEON}
          />
          <Text className="flex-1 text-white text-[15px] font-sans">
            {VISIBILITY_OPTIONS.find((o) => o.value === visibility)!.label}
          </Text>
          <SymbolView name="chevron.up.chevron.down" size={14} tintColor="rgba(255,255,255,0.4)" />
        </Pressable>

        {error ? (
          <Text selectable className="text-sm text-red-400 font-sans">
            {error}
          </Text>
        ) : null}

        <Text className="text-xs text-white/30 font-sans">
          Posts disappear at 5am — fun for the night, gone by sunrise.
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}
