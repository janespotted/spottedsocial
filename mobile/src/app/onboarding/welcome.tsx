import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { ensureLocationReady } from '@/lib/location-ready';
import { markTourSeen } from '@/lib/tour-seen';
import { useSession } from '@/hooks/use-session';
import { OnboardingScaffold } from '@/components/onboarding-scaffold';
import {
  CallItANightIllustration,
  CheckedInIllustration,
  FindFriendsIllustration,
  LeaderboardIllustration,
  MapIllustration,
  PrivacyRingIllustration,
  TbdStatusIllustration,
  // YapIllustration — parked with the Yap screen below.
} from '@/components/onboarding-illustrations';

/**
 * The onboarding tour (design: WhatsApp, Sept 16 2026). A guided
 * walkthrough: every screen is a still. Nothing here reads or writes a
 * preference, so the tour can never leave a half-set audience or status
 * behind, and no button promises an action it does not perform — the real
 * controls all live in the app.
 *
 * The one thing it does do is ask for location (after the privacy screen,
 * which has just explained who can see it).
 *
 * This runs AFTER the profile is complete, so the profile alone would read
 * as "onboarded"; finishing therefore records lib/tour-seen.ts, which the
 * gate also checks, before refreshing it.
 */

// 7 while Yap is parked; 8 with the Yap screen restored.
const TOTAL = 7;

export default function OnboardingTourScreen() {
  const { session, refreshOnboardingStatus } = useSession();
  const [step, setStep] = useState(1);
  const [finishing, setFinishing] = useState(false);
  const advancing = useRef(false);
  const [pending, setPending] = useState(false);

  /**
   * Ask for When In Use right after the privacy screen, which just
   * explained who can see the user's location — the OS prompt lands with
   * context rather than cold. The "Always" upgrade is a separate, explained
   * step after the first check-in (lib/location-ready.ts). Denial is fine:
   * the app degrades gracefully and the check-in sheet re-checks. Never
   * wait forever on the native prompt.
   */
  const askForLocation = async () => {
    try {
      await Promise.race([
        ensureLocationReady().then(() => BackgroundGeolocation.requestPermission()),
        new Promise((resolve) => setTimeout(resolve, 10000)),
      ]);
    } catch {
      /* denied or unavailable — continue */
    }
  };

  const finish = async () => {
    if (!session || finishing) return;
    setFinishing(true);
    // Record the tour BEFORE refreshing: the gate reads this flag, so
    // refreshing first would re-check, still see the tour unseen, and keep
    // the user here.
    await markTourSeen(session.user.id);
    // Gate in the root layout swaps to (tabs) once status refreshes
    await refreshOnboardingStatus();
  };

  const advance = async () => {
    if (advancing.current) return;
    advancing.current = true; setPending(true);
    try {
      if (step === 3) await askForLocation();
      if (step >= TOTAL) await finish();
      else setStep(s => Math.min(TOTAL, s + 1));
    } catch {
      setFinishing(false);
      Alert.alert('Could not finish setup', 'Your progress is saved. Please try again.');
    } finally { advancing.current = false; setPending(false); }
  };

  const frame = (
    props: Omit<React.ComponentProps<typeof OnboardingScaffold>, 'step' | 'total' | 'onContinue'> & {
      /** Defaults to advancing; screen 8 overrides it to finish instead. */
      onContinue?: () => void;
    }
  ) => (
    <OnboardingScaffold
      {...props}
      step={step}
      total={TOTAL}
      disabled={pending}
      onContinue={advance}
    />
  );

  return (
    <View className="flex-1">
      {step === 1 &&
        frame({
          title: 'Know who’s out.\nKnow where to go.',
          subtitle:
            'See where friends and mutuals are out, and find your next spot.',
          // The map card is flex-1 and takes the whole slot.
          fills: true,
          children: <MapIllustration />,
        })}

      {step === 2 &&
        frame({
          title: 'You’re out.\nYou’re Spotted.',
          subtitle: 'Choose Yes to check into the nearest bar. Change your spot anytime.',
          children: <CheckedInIllustration />,
        })}

      {step === 3 &&
        frame({
          title: 'Choose your\nprivacy ring.',
          subtitle: 'Pick who can see your location tonight.',
          children: <PrivacyRingIllustration />,
        })}

      {step === 4 &&
        frame({
          title: 'Still deciding?',
          subtitle:
            'Share your TBD status with your chosen ring. Your location stays hidden.',
          footnote: 'Update your status anytime.',
          children: <TbdStatusIllustration />,
        })}

      {step === 5 &&
        frame({
          title: 'Call it a night.',
          subtitle:
            'Stop sharing your location anytime. If you forget, it automatically turns off at 5 AM.',
          children: <CallItANightIllustration />,
        })}

      {/* The Yap tour screen is parked with the rest of Yap (client change,
          Sept 2026). Restore it as step 6, bump the two below it and set
          TOTAL back to 8:

      {step === 6 &&
        frame({
          title: 'Meet Yap.',
          subtitle:
            'Chat anonymously at the venue you’re checked into. Read conversations at other spots.',
          children: <YapIllustration />,
        })}
      */}

      {step === 6 &&
        frame({
          title: 'Find tonight’s\ntop spots.',
          subtitle:
            'Explore your city’s venues, with activity from people whose sharing includes you. Catalog order fills in when there is no shared activity.',
          children: <LeaderboardIllustration />,
        })}

      {step === 7 &&
        frame({
          title: 'Better with\nyour people.',
          subtitle: 'Add your friends to see who’s out. Invite your circle to join you.',
          footnote: 'Your night starts with your circle.',
          // The tour is a walkthrough, so the last button just ends it — it
          // must not promise an action this still does not perform ("Find
          // my friends" did). Adding friends happens in the app afterwards,
          // which is also why there is no "I'll do this later" escape here:
          // there is nothing to defer.
          continueLabel: finishing ? 'Setting up...' : 'Get started',
          onContinue: finish,
          children: <FindFriendsIllustration />,
        })}
    </View>
  );
}
