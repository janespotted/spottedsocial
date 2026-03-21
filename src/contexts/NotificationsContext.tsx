import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { logEvent } from '@/lib/event-logger';
import { isFromTonight } from '@/lib/time-context';

interface Notification {
  id: string;
  sender_id: string;
  receiver_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender_profile?: {
    display_name: string;
    avatar_url: string | null;
  };
  // Extra fields for DM banners
  thread_id?: string;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  latestNotification: Notification | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissLatest: () => void;
  showBanner: (notification: Notification) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);
  const { user } = useAuth();
  const markedAllReadRef = useRef(false);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (!user) return;

    // Fetch existing notifications
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      if (data && data.length > 0) {
        // Batch fetch all sender profiles in ONE query using safe RPC
        const senderIds = [...new Set(data.map(n => n.sender_id).filter(Boolean))];
        
        const { data: profiles } = await supabase.rpc('get_profiles_safe');

        // Create lookup map for O(1) access - filter to only senders we need
        const profileMap = new Map(
          profiles?.filter(p => senderIds.includes(p.id)).map(p => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url?.includes('dicebear.com') ? null : p.avatar_url }]) || []
        );

        // Attach profiles and filter to tonight only (5am boundary)
        const notificationsWithProfiles = data
          .filter(notification => isFromTonight(notification.created_at))
          .map(notification => ({
            ...notification,
            sender_profile: profileMap.get(notification.sender_id) || undefined
          }));

        // If markAllAsRead was called before fetch completed, ensure all are marked read
        if (markedAllReadRef.current) {
          setNotifications(notificationsWithProfiles.map(n => ({ ...n, is_read: true })));
        } else {
          setNotifications(notificationsWithProfiles);
        }
      } else if (data) {
        setNotifications([]);
      }
    };

    fetchNotifications();

    // Subscribe to realtime notification updates
    const notifChannel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `receiver_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('New notification received (realtime):', payload);
          
          // Fetch sender profile using safe RPC (bypasses RLS)
          const { data: profileData } = await supabase.rpc('get_profile_safe', { 
            target_user_id: payload.new.sender_id 
          });
          const profile = profileData?.[0];

          console.log('Sender profile fetched:', profile);

          const newNotification = {
            ...payload.new,
            sender_profile: profile ? { display_name: profile.display_name, avatar_url: profile.avatar_url?.includes('dicebear.com') ? null : profile.avatar_url } : undefined
          } as Notification;

          console.log('Setting latest notification:', newNotification);

          // Log invite received for relevant types
          if (['meetup_request', 'venue_invite'].includes(newNotification.type)) {
            logEvent('invite_received', {
              type: newNotification.type,
              sender_id: newNotification.sender_id,
              sender_name: profile?.display_name,
            });
          }

          // Reset the markedAllRead flag since a new notification arrived
          markedAllReadRef.current = false;
          setNotifications(prev => [newNotification, ...prev]);
          setLatestNotification(newNotification);
        }
      )
      .subscribe();

    // Subscribe to DM messages for banner notifications
    const dmChannel = supabase
      .channel('dm-banner-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
        },
        async (payload) => {
          const newMsg = payload.new as { id: string; sender_id: string; text: string; created_at: string; thread_id: string };
          
          // Ignore own messages
          if (newMsg.sender_id === user.id) return;

          // Check if user is a member of this thread
          const { data: membership } = await supabase
            .from('dm_thread_members')
            .select('id')
            .eq('thread_id', newMsg.thread_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!membership) return;

          // Fetch sender profile using safe RPC
          const { data: profileData } = await supabase.rpc('get_profile_safe', { 
            target_user_id: newMsg.sender_id 
          });
          const profile = profileData?.[0];

          const preview = newMsg.text.length > 50 ? newMsg.text.slice(0, 50) + '...' : newMsg.text;

          const syntheticNotification: Notification = {
            id: `dm-${newMsg.id}`,
            sender_id: newMsg.sender_id,
            receiver_id: user.id,
            type: 'dm_message',
            message: preview,
            is_read: false,
            created_at: newMsg.created_at || new Date().toISOString(),
            sender_profile: profile ? { display_name: profile.display_name, avatar_url: profile.avatar_url?.includes('dicebear.com') ? null : profile.avatar_url } : undefined,
            thread_id: newMsg.thread_id,
          };

          setLatestNotification(syntheticNotification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(dmChannel);
    };
  }, [user]);

  const markAsRead = async (notificationId: string) => {
    // Skip for synthetic DM notifications
    if (notificationId.startsWith('dm-')) return;
    
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as read:', error);
      return;
    }

    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
  };

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    // Set ref so any in-flight fetch also marks notifications as read
    markedAllReadRef.current = true;

    // Update local state immediately (optimistic) so badge clears instantly
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('receiver_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, [user]);

  const dismissLatest = () => {
    setLatestNotification(null);
  };

  const showBanner = (notification: Notification) => {
    setLatestNotification(notification);
  };

  return (
    <NotificationsContext.Provider
        value={{
          notifications,
          unreadCount,
          latestNotification,
          markAsRead,
          markAllAsRead,
          dismissLatest,
          showBanner,
        }}
      >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
