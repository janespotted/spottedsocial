import { NativeTabs } from 'expo-router/unstable-native-tabs';
import profileIcon from '@/assets/images/tab-profile.png';
import { LAVENDER, MIST } from '@/lib/theme';

/**
 * Brand bible: Lavender marks the active tab; inactive tabs stay muted.
 *
 * The shapes track the original Capacitor app's lucide set
 * (`src/components/BottomNav.tsx`), which is the design of record — do not
 * substitute a "better" symbol without asking:
 * - Home `house` ← lucide `Home`
 * - Leaderboard `chart.bar.xaxis` ← lucide `BarChart3` (columns on an axis)
 * - Map `mappin.and.ellipse` ← lucide `MapPin` (pin with a ring)
 * - Chat `text.bubble` ← lucide `MessageSquare`
 *
 * Where a `.fill` counterpart exists the icon is a `{ default, selected }`
 * pair so it gains weight on selection; where SF ships none (there is no
 * `mappin.and.ellipse.fill` or `chart.bar.xaxis.fill`) the icon is a bare
 * `sf` string and shifts tint only. Do not invent a `.fill` name to make the
 * set uniform — an unavailable symbol renders blank, silently.
 *
 * Note the web conveyed the active tab with lime (#d4ff00) + a glow and no
 * shape change at all; this port uses LAVENDER per the brand bible.
 *
 * Profile is the Spotted S, as a PNG rather than the `SpottedMark` component:
 * `Icon.src` is typed `React.ReactElement` but at runtime only accepts
 * expo-router's own `VectorIcon`/promise-loader elements — anything else is
 * dropped with a console warning and the tab renders with NO icon. So the
 * mark is rasterised from the same path `SpottedMark` draws (see
 * `scripts/render-tab-icon.sh`), white on transparent at 1x/2x/3x.
 *
 * A tab-bar icon is a TEMPLATE: iOS discards the artwork's colour and re-tints
 * it with the bar's tint (MIST inactive, LAVENDER active) — only the alpha
 * channel matters, which is why the source is white. The S therefore cannot be
 * lime here; a lime S would fight the other five icons rather than look
 * premium. `renderingMode` is left at its default, already `template` because
 * `iconColor` is set.
 */
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={LAVENDER} iconColor={MIST}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(leaderboard)">
        <NativeTabs.Trigger.Icon sf="chart.bar.xaxis" />
        <NativeTabs.Trigger.Label>Leaderboard</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(map)">
        <NativeTabs.Trigger.Icon sf="mappin.and.ellipse" />
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(messages)">
        <NativeTabs.Trigger.Icon sf={{ default: 'text.bubble', selected: 'text.bubble.fill' }} />
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(profile)">
        <NativeTabs.Trigger.Icon src={profileIcon} />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
