import { BlankStack } from 'react-native-screen-transitions/expo-router';
import Transition from 'react-native-screen-transitions';
import { photoViewerOptions, softPushInterpolator } from '@/lib/recap-transitions';

/**
 * Morning After's flow runs on react-native-screen-transitions' blank stack
 * (its Expo Router entry), so a photo can zoom out of its Polaroid into the
 * viewer and back (bounds navigation.zoom) — not the native slide from the
 * right. URLs are unchanged (/morning-after,
 * /recap-photo, /crossed-paths); the group itself is pushed by the root stack.
 */
export default function RecapLayout() {
  return (
    <BlankStack screenOptions={{ gestureEnabled: false }}>
      <BlankStack.Screen name="morning-after" />
      <BlankStack.Screen name="recap-photo" options={photoViewerOptions} />
      <BlankStack.Screen
        name="crossed-paths"
        options={{
          screenStyleInterpolator: softPushInterpolator,
          transitionSpec: { open: Transition.Specs.FlingSpec, close: Transition.Specs.FlingSpec },
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      />
    </BlankStack>
  );
}
