import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { triggerPushNotification } from '@/lib/push-notifications';

const YAP_NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between yap banners

/**
 * Subscribes to realtime yap_messages at the user's current venue/private party.
 * When a new yap from another user is detected, it shows a banner
 * and creates an activity center entry.
 */
export function useYapNotifications() {
  const { user } = useAuth();
  const { showBanner } = useNotifications();
  const lastNotifiedRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const setup = async () => {
      // Get user's current venue from night_statuses
      const { data: nightStatus } = await supabase
        .from('night_statuses')
        .select('venue_name, venue_id, is_private_party, party_neighborhood, status')
        .eq('user_id', user.id)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cancelled || !nightStatus || nightStatus.status !== 'out') return;

      const venueName = nightStatus.is_private_party
        ? null // private parties don't filter by venue_name
        : nightStatus.venue_name;

      if (!venueName && !nightStatus.is_private_party) return;

      // Clean up previous channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      // Subscribe to yap_messages for this venue
      const filterValue = nightStatus.is_private_party
        ? `is_private_party=eq.true`
        : `venue_name=eq.${venueName}`;

      const channel = supabase
        .channel(`yap-at-venue-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'yap_messages',
            filter: filterValue,
          },
          async (payload) => {
            const newYap = payload.new as any;

            // Don't notify for own yaps
            if (newYap.user_id === user.id) return;

            // Throttle notifications
            const now = Date.now();
            if (now - lastNotifiedRef.current < YAP_NOTIFICATION_COOLDOWN_MS) return;
            lastNotifiedRef.current = now;



            const locationLabel = nightStatus.is_private_party
              ? `your private party${nightStatus.party_neighborhood ? ` (${nightStatus.party_neighborhood})` : ''}`
              : venueName;

            const yapPreview = newYap.text
              ? (newYap.text.length > 40 ? newYap.text.slice(0, 40) + '…' : newYap.text)
              : '📸 shared media';

            // Show banner immediately (anonymous — no username)
            showBanner({
              id: `yap-${newYap.id}`,
              sender_id: newYap.user_id,
              receiver_id: user.id,
              type: 'venue_yap',
              message: `💬 New yap at ${locationLabel}: "${yapPreview}"`,
              is_read: false,
              created_at: new Date().toISOString(),
            });

            // Also create a notification in DB for the activity center
            try {
              const yapMessage = `💬 New yap at ${locationLabel}: "${yapPreview}"`;
              const { data: notifData } = await supabase.rpc('create_notification', {
                p_receiver_id: user.id,
                p_type: 'venue_yap',
                p_message: yapMessage,
              });
              
              const notif = Array.isArray(notifData) ? notifData[0] : notifData;
              if (notif) {
                triggerPushNotification({
                  id: notif.id,
                  receiver_id: user.id,
                  sender_id: newYap.user_id,
                  type: 'venue_yap',
                  message: yapMessage,
                });
              }
            } catch (err) {
              // Non-critical — banner already shown
              console.error('Failed to create yap activity entry:', err);
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    };

    setup();

    // Re-check venue every 2 minutes in case user moves
    const interval = setInterval(setup, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, showBanner]);
}
