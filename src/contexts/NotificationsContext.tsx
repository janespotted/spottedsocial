import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
        // Batch fetch all sender profiles in ONE query (fixes N+1)
        const senderIds = [...new Set(data.map(n => n.sender_id).filter(Boolean))];
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', senderIds);

        // Create lookup map for O(1) access
        const profileMap = new Map(
          profiles?.map(p => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]) || []
        );

        // Attach profiles and filter to tonight only (5am boundary)
        const notificationsWithProfiles = data
          .filter(notification => isFromTonight(notification.created_at))
          .map(notification => ({
            ...notification,
            sender_profile: profileMap.get(notification.sender_id) || undefined
          }));

        setNotifications(notificationsWithProfiles);
      } else if (data) {
        setNotifications([]);
      }
    };

    fetchNotifications();

    // Subscribe to realtime updates
    const channel = supabase
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
          
          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', payload.new.sender_id)
            .single();

          console.log('Sender profile fetched:', profile);

          const newNotification = {
            ...payload.new,
            sender_profile: profile || undefined
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

          setNotifications(prev => [newNotification, ...prev]);
          setLatestNotification(newNotification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (notificationId: string) => {
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

  const markAllAsRead = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('receiver_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      return;
    }

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

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
