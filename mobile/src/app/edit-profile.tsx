import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { NEON } from '@/lib/theme';

const USERNAME_REGEX = /^[a-z0-9_.]{3,20}$/;

/** Edit profile — native form sheet. Port of the web EditProfile page. */
export default function EditProfileSheet() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setDisplayName(data.display_name ?? '');
        setUsername(data.username ?? '');
        setOriginalUsername(data.username ?? '');
        setAvatarUrl(data.avatar_url ?? null);
      });
  }, [userId]);

  const checkUsername = (value: string) => {
    const normalized = value.toLowerCase().trim();
    setUsername(normalized);
    setUsernameError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (normalized === originalUsername) return;
    if (!USERNAME_REGEX.test(normalized)) {
      setUsernameError('3–20 chars: lowercase letters, numbers, _ or .');
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalized)
        .neq('id', userId!)
        .maybeSingle();
      if (data) setUsernameError('That username is taken');
    }, 400);
  };

  const pickAvatar = async () => {
    if (!userId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setUploadingAvatar(true);
    try {
      const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const body = await fetch(asset.uri).then((r) => r.arrayBuffer());
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust — same path is reused on every change
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
      setAvatarUrl(publicUrl);
      queryClient.invalidateQueries({ queryKey: ['profile-page'] });
    } catch {
      /* upload failed — keep prior avatar */
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    if (!userId || saving || usernameError) return;
    const name = displayName.trim();
    const handle = username.trim();
    if (!name || !USERNAME_REGEX.test(handle)) {
      if (!USERNAME_REGEX.test(handle)) {
        setUsernameError('3–20 chars: lowercase letters, numbers, _ or .');
      }
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name, username: handle })
        .eq('id', userId);
      if (error) {
        setUsernameError('Could not save — username may be taken');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['profile-page'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="pt-6 pb-10 px-5 gap-5">
      <Text className="text-white text-lg font-sans-semibold">Edit Profile</Text>

      {/* Avatar */}
      <View className="items-center">
        <Pressable onPress={pickAvatar} disabled={uploadingAvatar} className="active:opacity-80">
          <View className="rounded-full border-2 border-[#d4ff00]/30 p-0.5">
            <Avatar name={displayName || 'U'} url={avatarUrl} size="lg" />
          </View>
          <View
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full items-center justify-center border-2 border-[#1a0f2e]"
            style={{ backgroundColor: NEON }}
          >
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color="#1a0f2e" />
            ) : (
              <SymbolView name="camera.fill" size={12} tintColor="#1a0f2e" />
            )}
          </View>
        </Pressable>
      </View>

      {/* Display name */}
      <View className="gap-1.5">
        <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
          Display Name
        </Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={50}
          placeholder="Your name"
          placeholderTextColorClassName="accent-white/30"
          className="rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white text-[15px] font-sans"
        />
      </View>

      {/* Username */}
      <View className="gap-1.5">
        <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
          Username
        </Text>
        <TextInput
          value={username}
          onChangeText={checkUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          placeholder="username"
          placeholderTextColorClassName="accent-white/30"
          className={`rounded-xl bg-white/5 border px-4 py-3 text-white text-[15px] font-sans ${
            usernameError ? 'border-red-500/60' : 'border-white/15'
          }`}
        />
        {usernameError ? (
          <Text className="text-red-400 text-xs font-sans">{usernameError}</Text>
        ) : null}
      </View>

      <Pressable
        onPress={save}
        disabled={saving || !!usernameError || !displayName.trim()}
        className="rounded-full py-3.5 items-center active:opacity-90 disabled:opacity-30"
        style={{ backgroundColor: NEON }}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#1a0f2e" />
        ) : (
          <Text className="text-[#1a0f2e] text-base font-sans-semibold">Save</Text>
        )}
      </Pressable>
    </View>
  );
}
