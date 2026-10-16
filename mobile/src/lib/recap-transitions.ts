import { interpolate, makeMutable } from 'react-native-reanimated';
import Transition, { NAVIGATION_MASK_ELEMENT_STYLE_ID, type ScreenStyleInterpolator, type ScreenTransitionConfig } from 'react-native-screen-transitions';
import { INK } from '@/lib/theme';

/**
 * Morning After's screen transitions (react-native-screen-transitions,
 * app/(recap)/_layout.tsx), built the way the library's Expo Router starter
 * builds its media zoom: the replay's Polaroid pictures and the viewer's
 * photos are `Transition.Boundary`s in one group, and the viewer route runs
 * `bounds(...).navigation.zoom()` — the photo grows out of its Polaroid into
 * the viewer and back.
 */
export const RECAP_PHOTO_GROUP = 'recap';

/**
 * The photo the zoom resolves against: set when a Polaroid is tapped and
 * updated as the viewer pages, so closing returns to the Polaroid of the
 * photo on screen (the library's recommended pattern for paged galleries).
 */
export const recapActivePhotoId = makeMutable<string | null>(null);

export const unmaskedPhotoInterpolator: ScreenStyleInterpolator = ({ layouts }) => {
  'worklet';
  // Recovery and direct links may be the first route in this nested stack.
  // Their progress need not animate from 0 to 1; content must always be visible.
  return {
    content: { style: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] } },
    [NAVIGATION_MASK_ELEMENT_STYLE_ID]: { style: { width: layouts.screen.width, height: layouts.screen.height } },
  };
};

const photoViewerInterpolator: ScreenStyleInterpolator = (props) => {
  'worklet';
  const id = recapActivePhotoId.value;
  if (!id) return unmaskedPhotoInterpolator(props);
  const photoBounds = props.bounds({ group: RECAP_PHOTO_GROUP, id });
  if (!photoBounds.link()?.source?.bounds) return unmaskedPhotoInterpolator(props);
  return photoBounds.navigation.zoom({
    target: 'bound',
    backdropColor: INK,
    backdropOpacity: 0.6,
    backgroundScale: 0.96,
  });
};

/**
 * The viewer: zoom from the Polaroid, drag down (or up) to put it back —
 * the library owns that gesture; the viewer itself keeps sideways paging
 * and pinch / double-tap zoom.
 */
export const photoViewerOptions: ScreenTransitionConfig = {
  navigationMaskEnabled: true,
  gestureEnabled: true,
  gestureDirection: ['vertical', 'vertical-inverted'],
  transitionSpec: Transition.Specs.Zoom,
  screenStyleInterpolator: photoViewerInterpolator,
};

/** Plain pushed pages in the replay flow (crossed paths): a soft fade-up. */
export const softPushInterpolator: ScreenStyleInterpolator = ({ progress, focused }) => {
  'worklet';
  if (!focused) return { content: { style: { opacity: interpolate(progress, [1, 2], [1, 0.6], 'clamp') } } };
  return {
    content: {
      style: {
        opacity: interpolate(progress, [0, 1], [0, 1], 'clamp'),
        transform: [{ translateY: interpolate(progress, [0, 1], [24, 0], 'clamp') }],
      },
    },
  };
};
