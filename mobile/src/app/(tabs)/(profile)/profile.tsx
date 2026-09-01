import { ScrollView, Text, View } from 'react-native';
import { Button, Card, Skeleton } from 'heroui-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/avatar';
import { useSession } from '@/hooks/use-session';

export default function ProfileScreen() {
  const { session } = useSession();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, username, avatar_url, bio, home_city')
        .eq('id', session!.user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="p-4 gap-4"
    >
      <View className="items-center gap-2 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-24 rounded-full" />
            <Skeleton className="h-5 w-40 rounded-md mt-2" />
            <Skeleton className="h-3.5 w-24 rounded-md" />
          </>
        ) : (
          <>
            <Avatar
              name={profile?.display_name ?? '?'}
              url={profile?.avatar_url ?? null}
              size="lg"
            />
            <Text selectable className="text-foreground text-2xl font-bold mt-1">
              {profile?.display_name}
            </Text>
            {profile?.username ? (
              <Text selectable className="text-muted text-base">
                @{profile.username}
              </Text>
            ) : null}
            {profile?.bio ? (
              <Text className="text-accent-soft text-base text-center px-6">{profile.bio}</Text>
            ) : null}
            {profile?.home_city ? (
              <Text className="text-muted-dark text-sm uppercase tracking-wide">
                {profile.home_city}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <Card className="bg-surface border-0 p-2">
        <Card.Body>
          <Button variant="danger-soft" onPress={() => supabase.auth.signOut()}>
            <Button.Label>Sign out</Button.Label>
          </Button>
        </Card.Body>
      </Card>
    </ScrollView>
  );
}
