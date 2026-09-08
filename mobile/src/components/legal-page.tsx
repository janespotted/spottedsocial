import {Pressable, ScrollView, Text, View} from 'react-native';
import {router} from 'expo-router';
import {SymbolView} from 'expo-symbols';

export interface LegalSection {
  heading: string;
  body?: string;
  bullets?: string[];
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
}

/** Shared Terms/Privacy layout — mirrors the web app's legal pages. */
export function LegalPage({title, lastUpdated, sections}: LegalPageProps) {
  return (
    <View
      className='flex-1'
      style={{
        experimental_backgroundImage: 'linear-gradient(to bottom, #2d1b4e, #0a0118)',
      }}
    >
      <View className='bg-[#1a0f2e]/95 border-b border-[#a855f7]/20'>
        <View className='flex-row items-center gap-4 p-6 pt-5'>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <SymbolView name='arrow.left' size={22} tintColor='rgba(255,255,255,0.6)' />
          </Pressable>
          <Text className='text-xl font-sans-semibold text-white'>{title}</Text>
        </View>
      </View>

      <ScrollView
        className='flex-1'
        contentContainerClassName='px-4 py-6 pb-safe-offset-6'
      >
        <Text className='text-white/60 text-sm font-sans mb-6'>
          Last updated: {lastUpdated}
        </Text>

        {sections.map((s) => (
          <View key={s.heading} className='mb-6'>
            <Text className='text-lg font-sans-semibold text-white mb-3'>
              {s.heading}
            </Text>
            {s.body ? (
              <Text className='text-white/80 text-sm font-sans leading-relaxed mb-2'>
                {s.body}
              </Text>
            ) : null}
            {s.bullets?.map((b) => (
              <Text key={b} className='text-white/80 text-sm font-sans leading-relaxed'>
                {'•'} {b}
              </Text>
            ))}
          </View>
        ))}

        <Pressable
          onPress={() => router.back()}
          className='w-full h-10 rounded-md items-center justify-center bg-[#a855f7] active:bg-[#a855f7]/90 mt-6'
        >
          <Text className='text-white font-sans-semibold'>Close</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
