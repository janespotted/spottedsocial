import { useRef } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";

type Scope = "all" | "close" | "none";
export default function NotificationSettings() {
  const { session } = useSession();
  const db = supabase as any;
  const saving = useRef(false);
  const query = useQuery({
    queryKey: ["notification-preferences", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await db.from("notification_preferences").select(
        "out_scope,moves_scope",
      ).eq("user_id", session!.user.id).maybeSingle();
      if (error) throw error;
      return data ?? { out_scope: "all", moves_scope: "close" };
    },
  });
  const save = async (key: string, value: Scope) => {
    if (!session || saving.current || !query.data) return;
    saving.current = true;
    try {
      const { error } = await db.from("notification_preferences").upsert({
        user_id: session.user.id,
        ...query.data,
        [key]: value,
      }, { onConflict: "user_id" });
      if (error) throw error;
      await query.refetch();
    } catch {
      Alert.alert("Could not save", "Please try again.");
    } finally {
      saving.current = false;
    }
  };
  return (
    <ScrollView
      className="flex-1 bg-[#1A1229]"
      contentContainerStyle={{ padding: 20, gap: 20 }}
    >
      <Stack.Screen
        options={{
          title: "Friend activity alerts",
          headerShown: true,
          headerTintColor: "#F8F5F0",
          headerStyle: { backgroundColor: "#1A1229" },
        }}
      />
      <Text className="text-white/70 font-sans">
        These settings never expand who can see a friend's status. Their sharing
        audience always applies.
      </Text>
      {query.isError
        ? (
          <Pressable onPress={() => query.refetch()}>
            <Text className="text-white">
              Couldn't load preferences. Tap to retry.
            </Text>
          </Pressable>
        )
        : null}
      {(["out_scope", "moves_scope"] as const).map((key) => (
        <View key={key} className="gap-3">
          <Text className="text-white text-xl font-sans-semibold">
            {key === "out_scope"
              ? "Who's out or making plans"
              : "Friends changing bars"}
          </Text>
          {([["all", "All eligible friends & mutuals"], [
            "close",
            "Close friends only",
          ], ["none", "Off"]] as const).map(([value, label]) => (
            <Pressable
              key={value}
              disabled={!query.data}
              onPress={() => save(key, value)}
              className="rounded-2xl p-4"
              style={{
                backgroundColor: query.data?.[key] === value
                  ? "#C4F000"
                  : "#302142",
              }}
            >
              <Text
                style={{
                  color: query.data?.[key] === value ? "#1A1229" : "#F8F5F0",
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Text className="text-white/60 font-sans">
        One first-out and one TBD alert per friend each night. Bar changes are
        limited to three per friend per night, at least 30 minutes apart. Direct
        messages and invitations are unaffected.
      </Text>
    </ScrollView>
  );
}
