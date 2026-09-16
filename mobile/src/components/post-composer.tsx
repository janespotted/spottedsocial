import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from '@/components/styled';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { supabase } from '@/lib/supabase';
import { getPostExpiry, invalidateFeed } from '@/lib/posts';
import { validatePostText, validateVenueName } from '@/lib/validation';
import { savePostAudience, type Audience } from '@/lib/audience';
import { getCityLabel } from '@/lib/city-neighborhoods';
import { getActiveCity } from '@/lib/tonight';
import { useSession } from '@/hooks/use-session';
import { AudienceRow } from '@/components/audience-row';
import type { CapturedMedia } from '@/lib/post-media';

const NEON = '#d4ff00';
const INK = '#110a24';
const GLASS_BG = 'rgba(255,255,255,0.05)';
const GLASS_BORDER = 'rgba(255,255,255,0.12)';

const CAPTION_MAX = 500;

interface VenueSuggestion {
  id: string;
  name: string;
}

/** Everything the user has typed or chosen; owned by the route so Retake keeps it. */
export interface PostDraft {
  caption: string;
  venueName: string;
  venueId: string | null;
  visibility: Audience;
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <View
      className={`rounded-2xl ${className}`}
      style={{ backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER }}
    >
      {children}
    </View>
  );
}

/**
 * Preview + caption + venue + audience + Share. The second half of the
 * camera-first flow: media (or a text-only post) is already decided when
 * this renders. Retake hands control back to the camera without losing the
 * draft.
 */
export function PostComposer({
  media,
  draft,
  onDraftChange,
  onRetake,
  onClose,
  onShared,
}: {
  media: CapturedMedia | null;
  draft: PostDraft;
  onDraftChange: (patch: Partial<PostDraft>) => void;
  onRetake: () => void;
  onClose: () => void;
  onShared: () => void;
}) {
  const { session } = useSession();
  const { width } = useWindowDimensions();
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { caption, venueName, venueId, visibility } = draft;

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

  const canShare = !posting && (!!media || caption.trim().length > 0);

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
      setError('Add a photo or write something first.');
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
      savePostAudience(visibility);
      invalidateFeed();
      onShared();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't share your post.");
      setPosting(false);
    }
  };

  const previewHeight = Math.min(width * 1.3, 460);
  const cityLabel = getCityLabel(getActiveCity() ?? 'nyc');

  return (
    <View className="flex-1 bg-linear-to-b from-[#34215c] via-[#1d1240] to-[#110a24]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-safe-offset-2 pb-3">
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Close"
          className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
          style={{ backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER }}
        >
          <SymbolView name="xmark" size={16} tintColor="#ffffff" />
        </Pressable>
        <View className="items-center">
          <Text className="text-white text-base font-sans-semibold">New post</Text>
          <Text className="text-white/40 text-[11px] font-sans">Gone at 5:00 AM {cityLabel}</Text>
        </View>
        <Pressable
          onPress={share}
          disabled={!canShare}
          hitSlop={6}
          accessibilityLabel="Share post"
          className="h-10 px-5 rounded-full items-center justify-center active:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: NEON, boxShadow: canShare ? '0 6px 20px rgba(212,255,0,0.3)' : undefined }}
        >
          {posting ? (
            <ActivityIndicator size="small" color={INK} />
          ) : (
            <Text className="text-[#110a24] text-sm font-sans-semibold">Share</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 pt-1 gap-4 pb-safe-offset-8"
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        {/* Media hero */}
        {media ? (
          <View
            className="rounded-3xl overflow-hidden bg-black"
            style={{ height: previewHeight, boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}
          >
            {media.type === 'video' ? (
              <VideoPreview uri={media.uri} />
            ) : (
              <Image source={{ uri: media.uri }} className="w-full h-full" contentFit="cover" />
            )}
            <View
              pointerEvents="none"
              className="absolute left-0 right-0 bottom-0 h-28 bg-linear-to-t from-black/70 to-transparent"
            />
            <View className="absolute left-3 right-3 bottom-3 flex-row items-center justify-between">
              <Pressable
                onPress={onRetake}
                disabled={posting}
                accessibilityLabel="Retake"
                className="flex-row items-center gap-2 pl-3 pr-4 py-2.5 rounded-full active:opacity-80"
                style={{ backgroundColor: 'rgba(17,10,36,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
              >
                <SymbolView name="arrow.counterclockwise" size={14} tintColor="#ffffff" />
                <Text className="text-white text-sm font-sans-semibold">Retake</Text>
              </Pressable>
              <View
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
              >
                <SymbolView
                  name={media.type === 'video' ? 'video.fill' : 'camera.fill'}
                  size={11}
                  tintColor="rgba(255,255,255,0.8)"
                />
                <Text className="text-white/80 text-[11px] font-sans-semibold uppercase tracking-wider">
                  {media.type}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={onRetake}
            className="h-28 rounded-3xl items-center justify-center gap-1.5 active:opacity-80"
            style={{ backgroundColor: GLASS_BG, borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)', borderStyle: 'dashed' }}
          >
            <SymbolView name="camera.fill" size={22} tintColor={NEON} />
            <Text className="text-white/70 text-sm font-sans-medium">Add a photo or video</Text>
          </Pressable>
        )}

        {/* Caption */}
        <Card className="px-4 pt-3 pb-2">
          <TextInput
            value={caption}
            onChangeText={(t) => onDraftChange({ caption: t })}
            placeholder="What's the vibe tonight?"
            placeholderTextColorClassName="accent-white/30"
            multiline
            maxLength={CAPTION_MAX}
            className="min-h-20 text-white text-[16px] font-sans leading-6"
            style={{ textAlignVertical: 'top' }}
          />
          <Text className="text-white/25 text-[11px] font-sans text-right">
            {caption.length}/{CAPTION_MAX}
          </Text>
        </Card>

        {/* Venue */}
        <Card>
          <View className="flex-row items-center gap-3 px-4">
            <SymbolView name="mappin.and.ellipse" size={16} tintColor={NEON} />
            <TextInput
              value={venueName}
              onChangeText={(t) => onDraftChange({ venueName: t, venueId: null })}
              placeholder="Tag a venue (optional)"
              placeholderTextColorClassName="accent-white/30"
              className="flex-1 h-13 py-0 text-white text-[15px] font-sans"
            />
            {venueName ? (
              <Pressable
                onPress={() => onDraftChange({ venueName: '', venueId: null })}
                hitSlop={8}
                accessibilityLabel="Remove venue"
              >
                <SymbolView name="xmark.circle.fill" size={18} tintColor="rgba(255,255,255,0.35)" />
              </Pressable>
            ) : null}
          </View>
          {suggestions.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 px-4 pb-3">
              {suggestions.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => {
                    onDraftChange({ venueName: v.name, venueId: v.id });
                    setSuggestions([]);
                  }}
                  className="px-3 py-1.5 rounded-full active:opacity-80"
                  style={{ backgroundColor: 'rgba(168,85,247,0.18)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)' }}
                >
                  <Text className="text-white text-xs font-sans-medium">{v.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text className="text-white/35 text-[11px] font-sans px-4 pb-3">
            Tagging a venue here doesn&apos;t change where you&apos;re checked in.
          </Text>
        </Card>

        {/* Audience — same names and selector as live statuses, separate preference */}
        <AudienceRow value={visibility} onChange={(a) => onDraftChange({ visibility: a })} context="post" />

        {error ? (
          <View
            className="flex-row items-start gap-2 rounded-xl px-3 py-2.5"
            style={{ backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' }}
          >
            <SymbolView name="exclamationmark.triangle" size={14} tintColor="#fbbf24" />
            <Text selectable className="text-amber-200/90 text-xs font-sans flex-1">
              {error}
            </Text>
          </View>
        ) : null}

        <View className="flex-row items-center gap-2 px-1">
          <SymbolView name="moon.stars" size={13} tintColor="rgba(255,255,255,0.5)" />
          <Text className="text-white/55 text-xs font-sans flex-1">
            Posts disappear at 5:00 AM {cityLabel} time — fun for the night, gone by sunrise.
          </Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
