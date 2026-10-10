import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, AppState, Keyboard, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Contacts from 'expo-contacts/legacy';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useSession } from '@/hooks/use-session';
import { LaunchButton, LaunchShell } from '@/components/launch-shell';
import { PhoneVerifyForm } from '@/components/phone-verify-form';
import { launchRpc, launchStage, nominationPhone, type LaunchState } from '@/lib/launch';
import { supabase } from '@/lib/supabase';
import { formatE164 } from '@/lib/country-codes';
import { INK, MIST, NEON } from '@/lib/theme';

export default function LaunchOnboarding() {
  const { session, launch, refreshOnboardingStatus } = useSession();
  const [state, setState] = useState<LaunchState | null>(launch);
  const appleName = typeof session?.user.user_metadata?.full_name === 'string' ? session.user.user_metadata.full_name : '';
  const [name, setName] = useState<string>((launch?.profileSaved ? launch.profile?.name : '') || appleName);
  useEffect(() => { if (appleName) setName(current => current || appleName); }, [appleName]);
  const [username, setUsername] = useState(launch?.profileSaved ? launch.profile?.username || '' : '');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState(launch?.nominations.length === 2 ? 0 : launch?.nominations.length === 1 ? 2 : 1);
  const [phone, setPhone] = useState('');
  const [verifyPhone, setVerifyPhone] = useState(false);
  const usernameInput = useRef<TextInput>(null);
  useEffect(() => { if (launch) setState(launch); }, [launch]);
  const stage = state ? launchStage(state) : 'waiting';
  async function perform(work: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  const refresh = () => perform(async () => { const next = await launchRpc('get_launch_state'); setState(next); if (next.complete) await refreshOnboardingStatus(); });
  useEffect(() => {
    if (stage !== 'waiting') return;
    const sub = AppState.addEventListener('change', value => { if (value === 'active') refresh(); });
    return () => sub.remove();
  }, [stage]);
  const errorView = error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-red-300 text-sm leading-5 mt-4 mb-4">{error}</Text> : null;

  if (stage === 'waiting') return <LaunchShell key="waiting" title="Your night is coming." subtitle="Spotted is opening New York in small waves. Your place opens when your invitation is activated.">
    <View className="rounded-3xl bg-white/5 border border-white/10 p-6 mb-8 gap-3">
      <SymbolView name="sparkles" tintColor={NEON} size={28} />
      <Text className="text-white text-lg font-sans-medium">A little anticipation.</Text>
      <Text style={{ color: MIST }} className="text-base leading-6">Once you’re in, make your profile and nominate two new people for a future wave. Both nominations are required.</Text>
    </View>
    {!state?.hasPhone ? <>
      <Text className="text-sm text-white/70 leading-5 mb-4">Invited by phone? Verify that number to claim your place. You can also contact us for help with your Apple account.</Text>
      {verifyPhone ? <PhoneVerifyForm onVerified={() => { setVerifyPhone(false); refresh(); }} /> : <Pressable onPress={() => setVerifyPhone(true)} className="py-4"><Text style={{ color: NEON }}>Claim a phone invitation</Text></Pressable>}
    </> : null}
    {errorView}
    <LaunchButton label={busy ? 'Checking…' : 'Check my invitation'} disabled={busy} onPress={refresh} />
    <Pressable className="py-5" onPress={() => void Linking.openURL('mailto:support@spotted.app')}><Text className="text-white/70 text-center">Contact Spotted</Text></Pressable>
    <Pressable className="py-4" onPress={() => void supabase.auth.signOut()}><Text className="text-white/60 text-center">Use another account</Text></Pressable>
  </LaunchShell>;

  if (stage === 'profile') return <LaunchShell key="profile" step={1} title="Make an entrance." subtitle="Your name, your handle. Then choose two people who should be here next.">
    <Text className="text-sm text-white/65 mb-2">Your name</Text>
    <TextInput accessibilityLabel="Your name" value={name} onChangeText={setName} maxLength={50} textContentType="name" returnKeyType="next" onSubmitEditing={() => usernameInput.current?.focus()} className="text-white text-2xl font-sans-light border-b border-white/20 pb-3 mb-7" placeholder="First and last name" placeholderTextColor={MIST} />
    <Text className="text-sm text-white/65 mb-2">Username</Text>
    <View className="flex-row items-center border-b border-white/20 mb-3"><Text className="text-white/55 text-2xl pb-3">@</Text>
      <TextInput ref={usernameInput} accessibilityLabel="Username" value={username} onChangeText={v => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ''))} autoCapitalize="none" autoCorrect={false} maxLength={20} returnKeyType="done" className="flex-1 text-white text-2xl font-sans-light pb-3 pl-2" placeholder="yourname" placeholderTextColor={MIST} />
    </View>
    <Text className="text-white/55 text-xs mb-8">3–20 letters, numbers, periods or underscores.</Text>
    <View className="flex-row items-start gap-3 mb-5">
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Agree to the terms and privacy policy" accessibilityState={{ checked: terms }} onPress={() => setTerms(!terms)} className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/25" style={terms ? { backgroundColor: NEON } : undefined}>{terms ? <SymbolView name="checkmark" tintColor={INK} size={20} /> : null}</Pressable>
      <Text className="flex-1 text-white/65 text-sm leading-6">I agree to the <Text className="underline text-white" onPress={() => router.push('/terms')}>Terms</Text> and <Text className="underline text-white" onPress={() => router.push('/privacy')}>Privacy Policy</Text>.</Text>
    </View>
    {errorView}
    <View className="mt-auto pt-7"><LaunchButton label={busy ? 'Saving…' : 'Continue'} disabled={busy || !name.trim() || !/^[a-z0-9_.]{3,20}$/.test(username) || !terms} onPress={() => void perform(async () => {
      const next = await launchRpc('save_launch_profile', { p_name: name.trim(), p_username: username, p_terms: terms });
      Keyboard.dismiss(); setState(next); void Haptics.selectionAsync();
    })} /></View>
  </LaunchShell>;

  const choices = state?.nominations || [];
  const pickContact = () => perform(async () => {
    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return;
    const numbers = [...new Set((contact.phoneNumbers || []).map(p => p.number).filter((p): p is string => !!p))];
    if (!numbers.length) throw new Error('This contact has no phone number. Choose another person or enter one below.');
    if (numbers.length === 1) { setPhone(numbers[0]); return; }
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title: 'Choose their number', options: [...numbers, 'Cancel'], cancelButtonIndex: numbers.length }, i => { if (numbers[i]) setPhone(numbers[i]); });
    else Alert.alert('Choose their number', undefined, [...numbers.slice(0, 2).map(number => ({ text: number, onPress: () => setPhone(number) })), { text: 'Cancel', style: 'cancel' }]);
  });
  return <LaunchShell key="nominate" step={2} title="Who’s next?" subtitle="Choose two new people for a future wave. Your kind of people.">
    <View className="gap-3 mb-6">
      {[1, 2].map(n => {
        const choice = choices.find(c => c.slot === n);
        return <Pressable key={n} disabled={busy} onPress={() => { setSlot(n); setPhone(choice?.phone || ''); setError(null); }} accessibilityRole="button" accessibilityLabel={`Nominee ${n}${choice ? `, ${choice.phone}, change` : ', choose a person'}`} accessibilityState={{ selected: slot === n }} className="rounded-2xl border p-4 flex-row items-center gap-4" style={{ borderColor: slot === n ? NEON : 'rgba(255,255,255,0.15)', backgroundColor: choice ? 'rgba(212,255,0,0.06)' : 'rgba(255,255,255,0.03)' }}>
          <Text className="text-xl font-sans-light" style={{ color: choice ? NEON : MIST }}>0{n}</Text>
          <View className="flex-1"><Text className="text-white text-base font-sans-medium">{choice ? formatE164(choice.phone) : 'Someone worth knowing'}</Text><Text className="text-white/60 text-xs mt-1">{choice ? 'Saved for a future wave · tap to change' : 'Select a contact or add a number'}</Text></View>
          <SymbolView name={choice ? 'checkmark' : 'plus'} tintColor={choice ? NEON : MIST} size={18} />
        </Pressable>;
      })}
    </View>
    {slot > 0 ? <View className="rounded-2xl bg-white/5 p-5 mb-5">
      <Text className="text-white/70 text-sm mb-3">Nominee {slot}</Text>
      <Pressable disabled={busy} onPress={pickContact} accessibilityRole="button" className="min-h-11 flex-row items-center gap-3 mb-3"><SymbolView name="person.crop.circle.badge.plus" tintColor={NEON} size={22} /><Text style={{ color: NEON }} className="text-base font-sans-medium">Choose from contacts</Text></Pressable>
      <TextInput accessibilityLabel={`Phone number for nominee ${slot}`} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Or enter a phone number" placeholderTextColor={MIST} maxLength={30} className="text-white text-lg border-b border-white/20 py-3" />
      <Text className="text-white/55 text-xs leading-5 mt-2 mb-4">US numbers or +country code. Only the number you confirm is shared with Spotted.</Text>
      <Pressable accessibilityRole="button" disabled={busy || !nominationPhone(phone)} onPress={() => void perform(async () => {
        const next = await launchRpc('save_launch_nomination', { p_slot: slot, p_phone: nominationPhone(phone) });
        setState(next); setPhone(''); setSlot(next.nominations.length === 2 ? 0 : next.nominations.some(c => c.slot === 1) ? 2 : 1); Keyboard.dismiss(); void Haptics.selectionAsync();
      })} className="min-h-11 items-center justify-center rounded-xl border border-white/25 disabled:opacity-35"><Text className="text-white font-sans-medium">{busy ? 'Saving…' : `Confirm nominee ${slot}`}</Text></Pressable>
      {choices.length === 2 ? <Pressable className="min-h-11 items-center justify-center mt-2" onPress={() => { setSlot(0); setPhone(''); setError(null); }}><Text className="text-white/65">Keep saved choices</Text></Pressable> : null}
    </View> : null}
    <Text className="text-white/65 text-sm leading-5">Two nominations are required. Your people join the list for a future wave. No message is sent now.</Text>
    {errorView}
    <View className="mt-auto pt-7"><LaunchButton label={busy ? 'Saving…' : choices.length === 2 ? 'Let’s go' : `${choices.length} of 2 chosen`} disabled={busy || choices.length !== 2 || slot !== 0} onPress={() => void perform(async () => {
      await launchRpc('complete_launch_onboarding'); Keyboard.dismiss(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await refreshOnboardingStatus();
    })} /></View>
  </LaunchShell>;
}
