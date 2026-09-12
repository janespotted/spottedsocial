import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useCSSVariable } from 'uniwind';
import { useTabBarHidden } from '@/lib/tab-bar';

export default function TabsLayout() {
  const [accent, muted] = useCSSVariable(['--color-accent', '--color-muted']) as [
    string,
    string,
  ];
  const hidden = useTabBarHidden();

  return (
    <NativeTabs hidden={hidden} tintColor={accent} iconColor={muted}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf="house.fill" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(leaderboard)">
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
        <NativeTabs.Trigger.Label>Leaderboard</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(map)">
        <NativeTabs.Trigger.Icon sf="mappin.and.ellipse" />
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(messages)">
        <NativeTabs.Trigger.Icon sf="message.fill" />
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(profile)">
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
