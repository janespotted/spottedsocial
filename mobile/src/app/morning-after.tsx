import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';
import { nightStartAt, getActiveCity } from '@/lib/tonight';
import { resolvePostImageUrls } from '@/lib/posts';
import { INK_LIGHT, NEON, primaryControl, primaryControlText } from '@/lib/theme';

type RecapPost = { id: string; text: string; image_url: string | null; media_type: string | null; venue_name: string | null };

/** A private recap. Never queries other people's historical locations. */
export default function MorningAfter() {
  const { session } = useSession();
  const query = useQuery({
    queryKey: ['morning-after', session?.user.id], enabled: !!session,
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase.from('profiles').select('city').eq('id', session!.user.id).single();
      if (profileError) throw profileError;
      const city = profile?.city ?? getActiveCity();
      const end = nightStartAt(new Date(), city);
      const start = nightStartAt(new Date(end.getTime() - 1), city);
      const [visits, posts] = await Promise.all([
        supabase.from('checkins').select('id,venue_name,started_at').eq('user_id',session!.user.id)
          .gte('started_at',start.toISOString()).lt('started_at',end.toISOString()).order('started_at'),
        supabase.rpc('get_morning_after_user_posts', {p_user_id:session!.user.id,p_window_start:start.toISOString(),p_window_end:end.toISOString()}),
      ]);
      if(visits.error) throw visits.error;
      if(posts.error) throw posts.error;
      const ownPosts = (posts.data ?? []) as RecapPost[];
      const urls = await resolvePostImageUrls(ownPosts.map(p=>p.image_url));
      return {visits:visits.data ?? [],posts:ownPosts.map(p=>({...p,image_url:p.image_url?urls.get(p.image_url)??null:null}))};
    },
  });
  return <View className="flex-1 bg-background">
    <Stack.Screen options={{title:'Morning After',headerShown:true,headerStyle:{backgroundColor:INK_LIGHT},headerTintColor:'#fff'}} />
    <ScrollView contentContainerStyle={{padding:20,paddingBottom:60}}>
      <Text className="text-[#d4ff00] text-sm font-sans-semibold">LAST NIGHT, YOUR WAY</Text>
      <Text className="text-white text-3xl font-sans-semibold mt-2 mb-6">Morning After ☀️</Text>
      {query.isLoading ? <ActivityIndicator color={NEON} /> : query.isError ?
        <Pressable onPress={()=>query.refetch()}><Text className="text-white">Couldn't load your recap. Tap to retry.</Text></Pressable> : <>
        <Text className="text-white text-lg font-sans-semibold mb-3">Your stops</Text>
        {query.data?.visits.length ? query.data.visits.map(v=><View key={v.id} className="bg-surface rounded-2xl p-4 mb-2"><Text className="text-white font-sans">{v.venue_name || 'Out with friends'}</Text></View>) : <Text className="text-white/55 mb-4">No saved stops from last night.</Text>}
        <Text className="text-white text-lg font-sans-semibold mt-5 mb-3">Your posts</Text>
        {query.data?.posts.length ? query.data.posts.map(p=><View key={p.id} className="bg-surface rounded-2xl p-4 mb-3">
          {p.image_url && p.media_type !== 'video' ? <Image source={{uri:p.image_url}} style={{width:'100%',aspectRatio:1,borderRadius:12}} contentFit="cover" /> : null}
          <Text className="text-white font-sans mt-2">{p.text || p.venue_name || 'A moment from last night'}</Text>
        </View>) : <Text className="text-white/55">No saved posts available from last night.</Text>}
      </>}
      <Pressable className={`rounded-full p-4 mt-7 ${primaryControl}`} onPress={()=>router.push('/messages?tab=plans')}><Text className={`text-center font-sans-semibold ${primaryControlText}`}>Make your next plan</Text></Pressable>
    </ScrollView>
  </View>;
}
