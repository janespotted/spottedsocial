import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/lib/supabase";
import { fetchProfilesSafe } from "@/lib/profiles";
import { INK_LIGHT, MIST, primaryControl, primaryControlText } from "@/lib/theme";

type RequestRow = {
  id: string;
  host_id: string;
  guest_id: string;
  kind: "invite" | "address";
  state: string;
};
export default function Party() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>();
  const { session } = useSession();
  const me = session?.user.id;
  const owner = me === hostId;
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const db = supabase as any;
  const query = useQuery({
    queryKey: ["party-details", hostId, me],
    refetchInterval: 15_000,
    enabled: !!me && !!hostId,
    queryFn: async () => {
      const [status, requests, approved, people] = await Promise.all([
        db.from("night_statuses").select(
          "id,status,is_private_party,expires_at",
        ).eq("user_id", hostId).maybeSingle(),
        db.from("party_requests").select("*").eq("host_id", hostId).gt(
          "expires_at",
          new Date().toISOString(),
        ),
        db.rpc("approved_party_address", { p_host: hostId }),
        fetchProfilesSafe(),
      ]);
      if (status.error || requests.error || approved.error) {
        throw status.error || requests.error || approved.error;
      }
      const active = status.data?.status === "out" &&
        status.data?.is_private_party &&
        Date.parse(status.data.expires_at) > Date.now();
      const rows = (requests.data ?? []).filter((r: any) =>
        r.status_id === status.data?.id &&
        r.expires_at === status.data?.expires_at
      ) as RequestRow[];
      const [sent, received] = owner
        ? await Promise.all([
          db.from("friendships").select("friend_id").eq("user_id", me).eq(
            "status",
            "accepted",
          ),
          db.from("friendships").select("user_id").eq("friend_id", me).eq(
            "status",
            "accepted",
          ),
        ])
        : [{ data: [] }, { data: [] }];
      const ids = new Set([
        ...(sent.data ?? []).map((r: any) => r.friend_id),
        ...(received.data ?? []).map((r: any) => r.user_id),
      ]);
      return {
        active,
        requests: rows,
        address: approved.data as string | null,
        people,
        friends: people.filter((p) => ids.has(p.id) && !p.is_demo),
      };
    },
  });
  const act = async (work: () => Promise<any>) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await work();
      if (error) throw error;
      await query.refetch();
    } catch (e) {
      Alert.alert(
        "Could not complete action",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const request = (guest: string, kind: string) =>
    act(() =>
      db.rpc("party_request", { p_host: hostId, p_guest: guest, p_kind: kind })
    );
  const respond = (id: string, accept: boolean) =>
    act(() => db.rpc("respond_party_request", { p_id: id, p_accept: accept }));
  const button = (label: string, onPress: () => void) => (
    <Pressable
      disabled={busy}
      onPress={onPress}
      className={`rounded-xl p-3 my-1 ${primaryControl}`}
    >
      <Text className={`font-sans-semibold ${primaryControlText}`}>{label}</Text>
    </Pressable>
  );
  const name = (id: string) =>
    query.data?.people.find((p) => p.id === id)?.display_name ?? "A friend";
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 12 }}
    >
      <Stack.Screen
        options={{
          title: "Private party",
          headerShown: true,
          headerTintColor: "#fff",
          headerStyle: { backgroundColor: INK_LIGHT },
        }}
      />
      {query.isError
        ? button("Retry loading party", () => {
          query.refetch();
        })
        : query.isLoading
        ? <Text className="text-white">Loading…</Text>
        : !query.data?.active
        ? (
          <Text className="text-white">
            This party has ended or is no longer shared with you.
          </Text>
        )
        : (
          <>
            <Text className="text-white text-xl font-sans-semibold">
              {owner ? "Your private party" : `${name(hostId)}'s party`}
            </Text>
            <Text className="text-white/70 font-sans">
              Invitations don't share an address. The host approves address
              requests separately. Access ends when the party ends.
            </Text>
            {query.data.address
              ? (
                <View className="bg-surface rounded-xl p-4">
                  <Text selectable className="text-white">
                    {query.data.address}
                  </Text>
                </View>
              )
              : null}
            {owner
              ? (
                <>
                  <TextInput
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Save or update the party address"
                    placeholderTextColor={MIST}
                    className="text-white bg-surface rounded-xl p-4"
                  />
                  {button("Save address", () => {
                    if (address.trim()) {
                      void act(() =>
                        db.from("night_statuses").update({
                          party_address: address.trim(),
                        }).eq("user_id", me).eq("is_private_party", true)
                      );
                    }
                  })}
                  <Text className="text-white font-sans-semibold mt-3">
                    Invite a friend
                  </Text>
                  {query.data.friends.map((f) => (
                    <View key={f.id}>
                      {button(
                        `Invite ${f.display_name}`,
                        () => request(f.id, "invite"),
                      )}
                    </View>
                  ))}
                </>
              )
              : !query.data.requests.some((r) =>
                  r.guest_id === me && r.kind === "address"
                )
              ? button("Request address", () => request(me!, "address"))
              : null}
            <Text className="text-white font-sans-semibold mt-3">
              Invitations & requests
            </Text>
            {query.data.requests.map((r) => (
              <View key={r.id} className="bg-surface rounded-xl p-4">
                <Text className="text-white">
                  {name(r.guest_id)} ·{" "}
                  {r.kind === "invite" ? "Invitation" : "Address request"} ·
                  {" "}
                  {r.state}
                </Text>
                {r.state === "pending" &&
                    ((owner && r.kind === "address") ||
                      (!owner && r.kind === "invite"))
                  ? (
                    <>
                      {button(
                        r.kind === "address"
                          ? "Approve address sharing"
                          : "Accept invitation",
                        () => respond(r.id, true),
                      )}
                      {button("Decline", () =>
                        respond(r.id, false))}
                    </>
                  )
                  : null}
              </View>
            ))}
          </>
        )}
    </ScrollView>
  );
}
