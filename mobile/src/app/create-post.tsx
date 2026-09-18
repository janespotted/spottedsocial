import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { DEFAULT_AUDIENCE, loadPostAudience } from '@/lib/audience';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import type { CapturedMedia } from '@/lib/post-media';
import type { PublishedPost } from '@/lib/publish-post';
import { SpottedCamera } from '@/components/spotted-camera';
import { PostComposer, type PostDraft } from '@/components/post-composer';
import { PostShared } from '@/components/post-shared';

type Mode = 'camera' | 'compose' | 'shared';

/**
 * Camera → capture/select → preview + caption → share (client feedback §4).
 *
 * One full-screen route with two modes so the draft (caption, venue,
 * audience) survives Retake: the camera never knows about the form, and the
 * form never loses what was typed when the media is replaced.
 */
export default function CreatePostScreen() {
  useDismissKeyboardOnLeave();
  const { data: ownNight } = useOwnNightStatus();
  const [mode, setMode] = useState<Mode>('camera');
  const [media, setMedia] = useState<CapturedMedia | null>(null);
  const [published, setPublished] = useState<PublishedPost | null>(null);
  const [draft, setDraft] = useState<PostDraft>({
    caption: '',
    venueName: '',
    venueId: null,
    visibility: DEFAULT_AUDIENCE,
    taggedFriends: [],
  });
  const [venuePrefilled, setVenuePrefilled] = useState(false);

  const patchDraft = (patch: Partial<PostDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // Remembered post audience (separate from the live-status audience)
  useEffect(() => {
    let cancelled = false;
    loadPostAudience().then((saved) => {
      if (!cancelled) patchDraft({ visibility: saved });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Suggest the current check-in venue once; the user can change or clear it
  useEffect(() => {
    if (venuePrefilled) return;
    const s = ownNight?.status;
    if (s?.status === 'out' && s.venue_name) {
      patchDraft({ venueName: s.venue_name, venueId: s.venue_id ?? null });
      setVenuePrefilled(true);
    }
  }, [ownNight, venuePrefilled]);

  const hasDraft = !!media || draft.caption.trim().length > 0;

  const capture = (m: CapturedMedia) => {
    setMedia(m);
    setMode('compose');
  };

  // Closing the camera: back to the draft if there is one, else dismiss
  const closeCamera = () => {
    if (hasDraft) setMode('compose');
    else router.back();
  };

  // Closing the composer: never discard typed work without asking
  const closeComposer = () => {
    if (!hasDraft) {
      router.back();
      return;
    }
    Alert.alert('Discard this post?', 'Your photo and caption will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const shared = (post: PublishedPost) => {
    setPublished(post);
    setMode('shared');
  };

  // Dismiss, then switch tabs once the modal is gone — navigating while the
  // dismissal is in flight re-presents the destination as a modal card.
  const viewInFeed = () => {
    router.back();
    setTimeout(() => router.navigate('/'), 350);
  };

  if (mode === 'camera') {
    return (
      <SpottedCamera
        onCapture={capture}
        onClose={closeCamera}
        closeLabel={hasDraft ? 'Back to post' : 'Close'}
        onTextPost={() => setMode('compose')}
      />
    );
  }

  if (mode === 'shared' && published) {
    return <PostShared post={published} onViewFeed={viewInFeed} onDone={() => router.back()} />;
  }

  return (
    <PostComposer
      media={media}
      draft={draft}
      onDraftChange={patchDraft}
      onRetake={() => setMode('camera')}
      onClose={closeComposer}
      onShared={shared}
    />
  );
}
