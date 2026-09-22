import { Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { OnboardingPanel } from '@/components/onboarding-scaffold';
import { LAVENDER, NEON, PURPLE, VIOLET_FILL } from '@/lib/theme';

/**
 * The static mock UI inside the onboarding tour. These are illustrations,
 * not live controls: nothing here reads or writes state, so a tour screen
 * can never leave a half-set preference behind. The real versions live in
 * the app (audience sheet, /check-in, the map).
 */

/**
 * A stand-in portrait. These read as photos at 30–40px but are drawn
 * locally: the real `Avatar` needs a specific person, and its DiceBear
 * urls are a network fetch — wrong for a screen that must paint instantly
 * and offline, on first launch, before any profile is loaded.
 */
const FACES = [
  { skin: '#e8b88f', hair: '#3b2417', top: '#7a4a9e' },
  { skin: '#c68a5e', hair: '#1f1410', top: '#4a6ea8' },
  { skin: '#f0c9a0', hair: '#8a5a2b', top: '#9e4a6e' },
  { skin: '#8d5a3c', hair: '#140d0a', top: '#3f7a63' },
  { skin: '#f2d2b3', hair: '#c98b3a', top: '#5a4a9e' },
];

function MockFace({ size, ring, variant = 0 }: { size: number; ring?: string; variant?: number }) {
  const f = FACES[variant % FACES.length];
  return (
    <View
      className="overflow-hidden rounded-full"
      style={{
        height: size,
        width: size,
        borderWidth: ring ? Math.max(2, size * 0.07) : 0,
        borderColor: ring,
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 40 40">
        {/* Backdrop, shoulders, head, hair — a head-and-shoulders crop with
            room around the head, so it reads as a photo rather than a
            close-up pressed against the ring */}
        <Rect x="0" y="0" width="40" height="40" fill="#2a1d3f" />
        <Ellipse cx="20" cy="43" rx="13.5" ry="11" fill={f.top} />
        <Circle cx="20" cy="19" r="8.6" fill={f.skin} />
        <Path d="M11.4 18 A8.6 8.6 0 0 1 28.6 18 L28.6 15 A8.6 8.6 0 0 0 11.4 15 Z" fill={f.hair} />
        <Path d="M11.4 18 a8.6 8.6 0 0 1 2.4-6.6 c1.7 3.3 0.9 6.6 0 9 z" fill={f.hair} />
        <Path d="M28.6 18 a8.6 8.6 0 0 0 -2.4-6.6 c-1.7 3.3 -0.9 6.6 0 9 z" fill={f.hair} />
      </Svg>
    </View>
  );
}

/** Row of overlapping faces, as on the map card and the Yap list. */
function FaceStack({ count = 4, size = 26 }: { count?: number; size?: number }) {
  return (
    <View className="flex-row">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: count - i }}>
          <MockFace size={size} ring={NEON} variant={i} />
        </View>
      ))}
    </View>
  );
}

/**
 * The venue teardrop — the same silhouette as assets/images/venue-pin.png
 * that the real map uses, drawn as a vector so it can take either the lime
 * or the violet tint.
 */
function VenuePin({ size = 26, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size * 1.18} viewBox="0 0 24 28">
      <Path
        d="M12 0C5.7 0 0.6 5.1 0.6 11.4c0 8 10.1 15.8 10.6 16.1a1.4 1.4 0 0 0 1.6 0c0.4-0.3 10.6-8.1 10.6-16.1C23.4 5.1 18.3 0 12 0z"
        fill={color}
      />
      <Ellipse cx="12" cy="10.6" rx="4.6" ry="3.7" fill="#241539" />
    </Svg>
  );
}

/** 01 — the map: friends out, two venue pins. */
export function MapIllustration() {
  return (
    <View
      className="flex-1 rounded-3xl border border-white/10 overflow-hidden"
      style={{ backgroundColor: '#1b1330' }}
    >
      <MapStreets />

      {/* Friends-out pill, floating over the map like the real one */}
      <View className="absolute left-3 right-3 top-3 flex-row items-center justify-between rounded-full border border-white/10 bg-[#241a3d]/90 py-1.5 pl-1.5 pr-3">
        <FaceStack />
        <View className="flex-row items-center gap-1">
          <Text className="text-[12px] text-white/85 font-sans">4 friends are out</Text>
          <SymbolView name="chevron.right" size={10} tintColor="rgba(255,255,255,0.5)" />
        </View>
      </View>

      {/* Friends on the map — lime ring = out, white ring = mutual */}
      <View className="absolute" style={{ top: '26%', left: '8%' }}>
        <MockFace size={36} ring={NEON} variant={0} />
      </View>
      <View className="absolute" style={{ top: '24%', right: '12%' }}>
        <MockFace size={36} ring="rgba(255,255,255,0.55)" variant={1} />
      </View>
      <View className="absolute" style={{ top: '64%', left: '13%' }}>
        <MockFace size={36} ring="rgba(255,255,255,0.55)" variant={3} />
      </View>

      <View className="absolute flex-row items-center gap-1.5" style={{ top: '42%', left: '22%' }}>
        <VenuePin size={24} color={NEON} />
        <View>
          <Text className="text-[12px] text-white font-sans-medium">The Violet Room</Text>
          <Text className="text-[10px] text-white/50 font-sans">West Village</Text>
        </View>
      </View>
      <View className="absolute flex-row items-center gap-1.5" style={{ top: '55%', left: '44%' }}>
        <VenuePin size={24} color={PURPLE} />
        <View>
          <Text className="text-[12px] text-white font-sans-medium">Good Company</Text>
          <Text className="text-[10px] text-white/50 font-sans">East Village</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The street layer. Drawn as a vector rather than a grid of Views: a plain
 * grid reads as graph paper (or worse, as table rules), while blocks, a
 * couple of diagonals and a park read as a city at a glance.
 */
function MapStreets() {
  const road = 'rgba(255,255,255,0.032)';
  const wide = 'rgba(255,255,255,0.045)';
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 108"
      // Streets should fill the card whatever its height; a city grid has
      // no "correct" aspect, so stretching it is invisible and cropping
      // would leave bare corners.
      preserveAspectRatio="none"
      style={{ position: 'absolute' }}
    >
      <Rect x="0" y="0" width="100" height="108" fill="#1b1330" />
      {/* Park block */}
      <Rect x="62" y="74" width="30" height="22" rx="3" fill="rgba(120,220,140,0.05)" />
      {/* Avenues */}
      <Path d="M18 0 V108" stroke={road} strokeWidth="1.6" />
      <Path d="M44 0 V108" stroke={wide} strokeWidth="2.4" />
      <Path d="M74 0 V108" stroke={road} strokeWidth="1.6" />
      {/* Streets */}
      <Path d="M0 22 H100" stroke={road} strokeWidth="1.4" />
      <Path d="M0 46 H100" stroke={wide} strokeWidth="2.2" />
      <Path d="M0 70 H100" stroke={road} strokeWidth="1.4" />
      <Path d="M0 94 H100" stroke={road} strokeWidth="1.4" />
      {/* Diagonals — the thing that stops it reading as graph paper */}
      <Path d="M-4 84 L58 14" stroke={wide} strokeWidth="2" />
      <Path d="M56 108 L104 56" stroke={road} strokeWidth="1.4" />
    </Svg>
  );
}

/** Yes / TBD / No pill row. `selected` highlights one; none by default. */
function StatusPills({ selected }: { selected?: 'yes' | 'tbd' | 'no' }) {
  const items = [
    { key: 'yes' as const, label: 'Yes' },
    { key: 'tbd' as const, label: 'TBD' },
    { key: 'no' as const, label: 'No' },
  ];
  return (
    <View className="flex-row gap-2">
      {items.map((item) => {
        const on = selected === item.key;
        // Yes is the lime affirmative; TBD selected is the violet fill
        const bg = on ? (item.key === 'yes' ? NEON : VIOLET_FILL) : 'rgba(255,255,255,0.05)';
        const fg = on ? (item.key === 'yes' ? '#1a0f2e' : '#ffffff') : 'rgba(255,255,255,0.75)';
        return (
          <View
            key={item.key}
            // The chosen pill hugs its label; the rest share the remaining
            // width, as in the design — not three equal thirds. Height is a
            // style, not a class: these are fixed-size mock controls, so the
            // label must not stretch them.
            className={`rounded-full items-center justify-center border px-5 ${on ? '' : 'flex-1'}`}
            style={{
              height: 46,
              backgroundColor: bg,
              borderColor: on ? 'transparent' : 'rgba(255,255,255,0.14)',
            }}
          >
            <Text
              className="text-[16px] font-sans-medium"
              style={{ color: fg }}
              maxFontSizeMultiplier={1.1}
            >
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** 02 — "Are you out?" with Yes chosen and a check-in. */
export function CheckedInIllustration() {
  return (
    <OnboardingPanel>
      <Text className="text-[18px] font-sans-semibold text-white text-center mb-5">
        Are you out?
      </Text>
      <StatusPills selected="yes" />

      <View className="h-px bg-white/10 my-5" />

      <View className="flex-row items-center gap-3.5">
        <View
          className="h-11 w-11 rounded-full items-center justify-center"
          style={{ backgroundColor: 'rgba(168,85,247,0.2)' }}
        >
          <VenuePin size={20} color={PURPLE} />
        </View>
        <View className="flex-1">
          <Text className="text-[13px] text-white/55 font-sans">Checked in at</Text>
          <Text className="text-[17px] text-white font-sans-semibold mt-0.5">The Violet Room</Text>
        </View>
        <SymbolView name="chevron.right" size={14} tintColor="rgba(255,255,255,0.4)" />
      </View>

      <Text className="text-[14px] text-white/60 font-sans underline mt-3 ml-15">Change spot</Text>

      <View className="h-px bg-white/10 my-5" />

      <Text className="text-[14px] text-white/45 font-sans text-center">At a private party?</Text>
    </OnboardingPanel>
  );
}

/** 03 — concentric rings with the three audience tiers below. */
export function PrivacyRingIllustration() {
  const tiers = [
    { label: 'Close Friends', sub: 'Only your selected inner circle', on: true },
    { label: 'Friends', sub: "Everyone you're friends with", on: false },
    { label: 'Friends + Mutual Friends', sub: 'Your friends and mutuals', on: false },
  ];
  return (
    <View>
      <View className="items-center justify-center" style={{ height: 150 }}>
        <View
          className="absolute rounded-full"
          style={{ height: 150, width: 150, backgroundColor: 'rgba(128,64,170,0.18)' }}
        />
        <View
          className="absolute rounded-full"
          style={{ height: 108, width: 108, backgroundColor: 'rgba(128,64,170,0.38)' }}
        />
        <View
          className="absolute rounded-full"
          style={{ height: 74, width: 74, backgroundColor: 'rgba(168,85,247,0.55)' }}
        />
        <MockFace size={58} />
      </View>

      <View className="gap-2.5 mt-5">
        {tiers.map((tier) => (
          <View
            key={tier.label}
            className="flex-row items-center gap-3 rounded-2xl border px-4 py-3"
            style={{
              borderColor: tier.on ? 'rgba(168,85,247,0.7)' : 'rgba(255,255,255,0.1)',
              backgroundColor: tier.on ? 'rgba(128,64,170,0.35)' : 'rgba(255,255,255,0.04)',
            }}
          >
            <View
              className="h-[22px] w-[22px] rounded-full border-2 items-center justify-center"
              style={{ borderColor: tier.on ? '#ffffff' : 'rgba(168,85,247,0.8)' }}
            >
              {tier.on ? <View className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
            </View>
            <View className="flex-1">
              <Text className="text-[15px] text-white font-sans-medium">{tier.label}</Text>
              <Text className="text-[12px] text-white/55 font-sans mt-0.5">{tier.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 04 — TBD selected, with the visibility and location-sharing rows. */
export function TbdStatusIllustration() {
  return (
    <OnboardingPanel>
      <Text className="text-[17px] font-sans-semibold text-white text-center mb-4">
        Are you out?
      </Text>
      <StatusPills selected="tbd" />

      <View className="h-px bg-white/10 my-4" />

      <View className="flex-row items-center gap-3">
        <MockFace size={38} />
        <Text className="flex-1 text-[15px] text-white font-sans-medium">Maya</Text>
        <View
          className="px-4 py-1.5 rounded-full"
          style={{ backgroundColor: VIOLET_FILL }}
        >
          <Text className="text-[13px] text-white font-sans-medium">TBD</Text>
        </View>
      </View>

      <View className="h-px bg-white/10 my-4" />

      <View className="flex-row items-center">
        <Text className="flex-1 text-[15px] text-white/75 font-sans">Visible to</Text>
        <Text className="text-[15px] text-white font-sans-medium">Close Friends</Text>
        <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.4)" />
      </View>

      <View className="h-px bg-white/10 my-4" />

      <View className="flex-row items-center">
        <Text className="flex-1 text-[15px] text-white/75 font-sans">Location sharing</Text>
        <Text className="text-[15px] text-white font-sans-medium">Off</Text>
        <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.4)" />
      </View>
    </OnboardingPanel>
  );
}

/** 05 — moon, the sharing toggle off, and the 5 AM note. */
export function CallItANightIllustration() {
  return (
    <View>
      {/* An outline crescent in Active Lavender, as drawn. A filled
          moon.fill in saturated PURPLE reads as a heavy blob at this size —
          PURPLE is the accent for icons and outlines, not a fill. */}
      <View className="items-center mb-8">
        <SymbolView name="moon" size={76} tintColor={LAVENDER} />
      </View>

      <OnboardingPanel>
        <View className="flex-row items-center">
          <Text className="flex-1 text-[15px] text-white font-sans">Location sharing</Text>
          {/* Off-state switch */}
          <View
            className="h-[30px] w-[50px] rounded-full justify-center px-[3px]"
            style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
          >
            <View className="h-6 w-6 rounded-full bg-white" />
          </View>
        </View>

        <View className="h-px bg-white/10 my-4" />

        <View className="flex-row items-center gap-3">
          <SymbolView name="checkmark.circle.fill" size={22} tintColor={PURPLE} />
          <Text className="text-[15px] text-white/75 font-sans">Automatically off at 5 AM</Text>
        </View>
      </OnboardingPanel>
    </View>
  );
}

/** 06 — the Yap venue chat. */
export function YapIllustration() {
  const messages = [
    { when: '2m', body: 'Upstairs is the spot.' },
    { when: 'now', body: 'The music is so good tonight.' },
  ];
  return (
    <View>
      <View className="flex-row rounded-full bg-white/6 p-1">
        <View className="flex-1 min-h-8.5 rounded-full items-center justify-center" style={{ backgroundColor: VIOLET_FILL }}>
          <Text className="text-[14px] text-white font-sans-medium">Your venue</Text>
        </View>
        <View className="flex-1 min-h-8.5 rounded-full items-center justify-center">
          <Text className="text-[14px] text-white/60 font-sans">Other spots</Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2.5 mt-5">
        <SymbolView name="bubble.left" size={20} tintColor="rgba(255,255,255,0.9)" />
        <Text className="text-[16px] text-white font-sans-medium">The Violet Room</Text>
      </View>

      <View className="gap-3.5 mt-4">
        {messages.map((m) => (
          <View key={m.when} className="flex-row items-start gap-3">
            <View
              className="h-8 w-8 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(168,85,247,0.22)' }}
            >
              <SymbolView name="person.fill" size={15} tintColor={PURPLE} />
            </View>
            <View className="flex-1">
              <Text className="text-[12px] text-white/50 font-sans">Anonymous · {m.when}</Text>
              <Text className="text-[14px] text-white font-sans mt-0.5">{m.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="flex-row items-center gap-3 rounded-2xl border border-white/12 bg-white/4 px-4 py-3 mt-5">
        <Text className="flex-1 text-[14px] text-white/35 font-sans">Post anonymously...</Text>
        <SymbolView name="paperplane.fill" size={18} tintColor={PURPLE} />
      </View>

      <View className="flex-row items-center gap-3 mt-5">
        <SymbolView name="clock" size={20} tintColor="rgba(255,255,255,0.55)" />
        <Text className="flex-1 text-[13px] text-white/55 font-sans">
          All newsfeed posts and Yaps are deleted at 5 AM.
        </Text>
      </View>
    </View>
  );
}

/** 07 — tonight's leaderboard. */
export function LeaderboardIllustration() {
  const spots = [
    { rank: 1, name: 'The Violet Room', hood: 'West Village' },
    { rank: 2, name: 'After Hours', hood: 'Lower East Side' },
    { rank: 3, name: 'Good Company', hood: 'East Village' },
  ];
  return (
    <OnboardingPanel>
      <Text className="text-[16px] text-white font-sans-semibold">Tonight in NYC</Text>
      <Text className="text-[12px] text-white/50 font-sans mt-0.5">Total Spotted check-ins</Text>

      <View className="gap-2.5 mt-4">
        {spots.map((spot) => {
          const lead = spot.rank === 1;
          return (
            <View
              key={spot.rank}
              className="flex-row items-center gap-4 rounded-2xl px-4 py-3"
              style={{
                backgroundColor: lead ? 'rgba(212,255,0,0.10)' : 'rgba(255,255,255,0.04)',
                borderLeftWidth: lead ? 3 : 0,
                borderLeftColor: NEON,
              }}
            >
              <Text
                className="text-[20px] font-sans-semibold w-5"
                style={{ color: lead ? NEON : 'rgba(255,255,255,0.65)' }}
              >
                {spot.rank}
              </Text>
              <View className="flex-1">
                <Text className="text-[15px] text-white font-sans-medium">{spot.name}</Text>
                <Text className="text-[12px] text-white/50 font-sans mt-0.5">{spot.hood}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </OnboardingPanel>
  );
}

/**
 * 08 — the friend search, as a still. Like every other screen in the tour
 * this is a picture, not a working control: nothing here queries profiles
 * or sends a request. Adding friends for real happens in the app, which
 * the final button hands the user over to.
 */
export function FindFriendsIllustration() {
  const people = [
    { name: 'Sophie', variant: 2 },
    { name: 'Alex', variant: 1 },
    { name: 'Jordan', variant: 3 },
  ];
  return (
    <OnboardingPanel>
      <View className="flex-row items-center gap-3 rounded-2xl border border-white/12 bg-white/6 px-4 py-3">
        <SymbolView name="magnifyingglass" size={17} tintColor="rgba(255,255,255,0.5)" />
        <Text className="flex-1 text-[15px] text-white/35 font-sans">Search friends</Text>
      </View>

      <View className="gap-4 mt-5">
        {people.map((person) => (
          <View key={person.name} className="flex-row items-center gap-3.5">
            <MockFace size={42} variant={person.variant} />
            <Text className="flex-1 text-[16px] text-white font-sans-medium">{person.name}</Text>
            <View className="min-h-8 px-6 py-1.5 rounded-full border border-white/25 items-center justify-center">
              <Text className="text-[14px] text-white font-sans-medium">Add</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="flex-row items-center gap-3 border-t border-white/10 pt-4 mt-5">
        <SymbolView name="link" size={18} tintColor="rgba(255,255,255,0.7)" />
        <Text className="flex-1 text-[15px] text-white/80 font-sans">Invite a friend</Text>
        <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.4)" />
      </View>
    </OnboardingPanel>
  );
}
