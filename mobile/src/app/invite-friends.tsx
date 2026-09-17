import { useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { useQuery } from '@tanstack/react-query';
import { fetchOrCreateInviteCode, getInviteUrl, regenerateInviteCode } from '@/lib/invites';
import { useSession } from '@/hooks/use-session';
import { NEON, PURPLE } from '@/lib/theme';

/**
 * Invite friends — native form sheet. Port of the web InviteFriendsSection +
 * QRCodeModal: invite link, QR code, share, regenerate, joined count.
 */
export default function InviteFriendsSheet() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [regenerating, setRegenerating] = useState(false);

  const { data: invite, isLoading, refetch } = useQuery({
    queryKey: ['invite-code', userId],
    enabled: !!session,
    queryFn: () => fetchOrCreateInviteCode(userId!),
  });

  const inviteUrl = invite ? getInviteUrl(invite.code) : null;

  const share = async () => {
    if (!inviteUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: `Hey! Join me on Spotted to see where friends are going out tonight 🎉 ${inviteUrl}`,
    });
  };

  const regenerate = async () => {
    if (!userId || regenerating) return;
    setRegenerating(true);
    try {
      await regenerateInviteCode(userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <View className="pt-6 pb-10 px-5 gap-5 items-center">
      <View className="flex-row items-center gap-3 self-stretch">
        <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: PURPLE }}>
          <SymbolView name="link" size={20} tintColor="#ffffff" />
        </View>
        <View className="flex-1">
          <Text className="text-white text-lg font-sans-semibold">Invite Friends</Text>
          <Text className="text-white/60 text-sm font-sans">
            Share your link to add friends instantly
          </Text>
        </View>
      </View>

      {isLoading || !inviteUrl ? (
        <View className="py-16">
          <ActivityIndicator color={NEON} />
        </View>
      ) : (
        <>
          {/* QR code — scan to open the invite link */}
          <View className="p-4 rounded-2xl bg-white">
            <QRCode value={inviteUrl} size={180} backgroundColor="#ffffff" color="#1a0f2e" />
          </View>

          {/* Link display */}
          <View className="self-stretch rounded-xl bg-[#1a0f2e] border border-[#a855f7]/40 px-3 py-3">
            <Text className="text-white/80 text-xs font-sans text-center" numberOfLines={1}>
              {inviteUrl}
            </Text>
          </View>

          {/* Actions */}
          <View className="flex-row gap-2 self-stretch">
            <Pressable
              onPress={share}
              className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-full active:opacity-90"
              style={{ backgroundColor: PURPLE, boxShadow: '0 0 15px rgba(168,85,247,0.4)' }}
            >
              <SymbolView name="square.and.arrow.up" size={16} tintColor="#ffffff" />
              <Text className="text-white text-sm font-sans-semibold">Share Link</Text>
            </Pressable>
            <Pressable
              onPress={regenerate}
              disabled={regenerating}
              className="w-12 items-center justify-center rounded-full border border-[#a855f7]/40 active:bg-[#a855f7]/20 disabled:opacity-40"
            >
              {regenerating ? (
                <ActivityIndicator size="small" color={PURPLE} />
              ) : (
                <SymbolView name="arrow.clockwise" size={16} tintColor="#ffffff" />
              )}
            </Pressable>
          </View>

          {invite && invite.uses_count > 0 ? (
            <View className="flex-row items-center gap-2">
              <SymbolView name="person.2" size={14} tintColor="rgba(255,255,255,0.6)" />
              <Text className="text-white/60 text-sm font-sans">
                {invite.uses_count} friend{invite.uses_count !== 1 ? 's' : ''} joined via your link
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
