import { View } from 'react-native';

export function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View className="flex-row items-center justify-center gap-2 py-4">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={
            i <= current ? 'h-1.5 w-6 rounded-full bg-[#d4ff00]' : 'h-1.5 w-1.5 rounded-full bg-white/20'
          }
        />
      ))}
    </View>
  );
}
