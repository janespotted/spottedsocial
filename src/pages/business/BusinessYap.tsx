import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BusinessLayout } from '@/components/business/BusinessLayout';
import { VenueSelector } from '@/components/business/VenueSelector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Send, Pin, Trash2, Building2, Loader2 } from 'lucide-react';

interface VenueYapMessage {
  id: string;
  text: string;
  is_pinned: boolean;
  created_at: string;
  expires_at: string | null;
}

export default function BusinessYap() {
  const { user } = useAuth();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VenueYapMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [duration, setDuration] = useState<'1h' | '2h' | '4h' | 'none'>('none');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    async function fetchMessages() {
      if (!selectedVenueId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('venue_yap_messages')
          .select('*')
          .eq('venue_id', selectedVenueId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        setMessages(data || []);
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, [selectedVenueId]);

  const calculateExpiresAt = (): string | null => {
    const durations: Record<string, number> = { '1h': 1, '2h': 2, '4h': 4 };
    const hours = durations[duration];
    if (!hours) return null;
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  };

  const handlePost = async () => {
    if (!user || !selectedVenueId || !newMessage.trim()) return;

    // Check pin cap before posting
    if (isPinned) {
      const currentPinned = messages.filter((m) => m.is_pinned).length;
      if (currentPinned >= 3) {
        toast.error('You can only pin up to 3 messages at a time. Unpin one first.');
        return;
      }
    }

    setPosting(true);
    try {
      const { data, error } = await supabase
        .from('venue_yap_messages')
        .insert({
          venue_id: selectedVenueId,
          posted_by: user.id,
          text: newMessage.trim(),
          is_pinned: isPinned,
          display_as: 'venue',
          expires_at: calculateExpiresAt(),
        })
        .select()
        .single();

      if (error) throw error;

      setMessages([data, ...messages]);
      setNewMessage('');
      setIsPinned(false);
      setDuration('none');
      toast.success('Message posted to Yap board!');
    } catch (err) {
      console.error('Error posting message:', err);
      toast.error('Failed to post message');
    } finally {
      setPosting(false);
    }
  };

  const handleTogglePin = async (message: VenueYapMessage) => {
    // If trying to pin, check cap
    if (!message.is_pinned) {
      const currentPinned = messages.filter((m) => m.is_pinned).length;
      if (currentPinned >= 3) {
        toast.error('You can only pin up to 3 messages at a time. Unpin one first.');
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('venue_yap_messages')
        .update({ is_pinned: !message.is_pinned })
        .eq('id', message.id);

      if (error) throw error;

      setMessages(messages.map(m =>
        m.id === message.id ? { ...m, is_pinned: !m.is_pinned } : m
      ));
      toast.success(message.is_pinned ? 'Unpinned message' : 'Pinned message');
    } catch (err) {
      console.error('Error toggling pin:', err);
      toast.error('Failed to update message');
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('venue_yap_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;

      setMessages(messages.filter(m => m.id !== messageId));
      toast.success('Message deleted');
    } catch (err) {
      console.error('Error deleting message:', err);
      toast.error('Failed to delete message');
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatExpiryRemaining = (expiresAt: string) => {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return 'Expired';
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const mins = Math.floor((remaining % (60 * 60 * 1000)) / 60000);
    if (hours > 0) return `Expires in ${hours}h ${mins}m`;
    return `Expires in ${mins}m`;
  };

  return (
    <BusinessLayout title="Yap Board">
      {/* Venue Selector */}
      <div className="mb-6">
        <VenueSelector
          selectedVenueId={selectedVenueId}
          onVenueChange={setSelectedVenueId}
        />
      </div>

      {selectedVenueId ? (
        <div className="space-y-4">
          {/* Compose */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Post as Your Venue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="What's happening at your venue tonight?"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/40 min-h-[80px]"
                  maxLength={280}
                />
                <span className="absolute bottom-2 right-3 text-xs text-white/40">
                  {newMessage.length}/280
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isPinned}
                    onCheckedChange={setIsPinned}
                    className="data-[state=checked]:bg-primary"
                  />
                  <span className="text-white/60 text-sm flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    Pin message
                  </span>
                </div>

                <Button
                  onClick={handlePost}
                  disabled={posting || !newMessage.trim()}
                  className="bg-primary hover:bg-primary/80"
                >
                  {posting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Post
                    </>
                  )}
                </Button>
              </div>

              {/* Duration Picker */}
              <div className="flex flex-wrap gap-2">
                {([
                  { value: '1h', label: '1 hour' },
                  { value: '2h', label: '2 hours' },
                  { value: '4h', label: '4 hours' },
                  { value: 'none', label: 'Until I remove it' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDuration(opt.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      duration === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-white/10 text-white/60 hover:bg-white/15'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Messages List */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm">
                Your Messages ({messages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <p className="text-white/50 text-sm text-center py-6">
                  No messages yet. Post your first update!
                </p>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className="p-3 rounded-lg bg-white/5 border border-white/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          {message.is_pinned && (
                            <Badge className="bg-yellow-500/20 text-yellow-400 text-xs mb-2">
                              <Pin className="h-3 w-3 mr-1" />
                              Pinned
                            </Badge>
                          )}
                          <p className="text-white text-sm">{message.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-white/40 text-xs">
                              {formatTime(message.created_at)}
                            </span>
                            {message.expires_at && (
                              <span className="text-white/40 text-xs">
                                · {formatExpiryRemaining(message.expires_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleTogglePin(message)}
                            className={`h-8 w-8 ${
                              message.is_pinned
                                ? 'text-yellow-400 hover:text-yellow-300'
                                : 'text-white/40 hover:text-white'
                            }`}
                          >
                            <Pin className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete message</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this message? This can't be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(message.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-12 text-center">
            <p className="text-white/60">Select a venue to manage your Yap board</p>
          </CardContent>
        </Card>
      )}
    </BusinessLayout>
  );
}
