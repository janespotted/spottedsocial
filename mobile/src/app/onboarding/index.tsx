import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, AppState, Keyboard, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Contacts from 'expo-contacts/legacy';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useSession } from '@/hooks/use-session';
import { ContactsDiscovery } from '../contacts-sync';
import { LaunchButton, LaunchShell } from '@/components/launch-shell';
import { LaunchIntroduction } from '@/components/launch-introduction';
import { PhoneVerifyForm } from '@/components/phone-verify-form';
import { launchRpc, launchStage, nominationPhone, type LaunchState } from '@/lib/launch';
import { nomineeName, readNomineeLabels, saveNomineeLabel, type NomineeLabels } from '@/lib/nomination-progress';
import { readLaunchDraft, saveLaunchDraft, clearLaunchDraft } from '@/lib/launch-draft';
import { readIntroStep } from '@/lib/launch-intro';
import { supabase } from '@/lib/supabase';
import { formatE164 } from '@/lib/country-codes';
import { previewLaunchState, previewLaunchAction } from '@/lib/onboarding-preview';
import { INK, MIST, NEON } from '@/lib/theme';

function LaunchOnboarding() {
  const { session } = useSession();
  return <LaunchSetup key={session?.user.id} />;
}

export default LaunchOnboarding;

export function LaunchSetup({ preview = false, onDone }: { preview?: boolean; onDone?: () => void } = {}) {
  const { session, launch, refreshOnboardingStatus } = useSession();
  useEffect(() => { if (!preview && session?.user.id) void readIntroStep(session.user.id); }, [session?.user.id]);
  const [state, setState] = useState<LaunchState | null>(() => preview ? previewLaunchState() : launch);
  const appleName = !preview && typeof session?.user.user_metadata?.full_name === 'string' ? session.user.user_metadata.full_name : '';
  const [name, setName] = useState<string>((!preview && launch?.profileSaved ? launch.profile?.name : '') || appleName);
  useEffect(() => { if (appleName) setName(current => current || appleName); }, [appleName]);
  const [username, setUsername] = useState(!preview && launch?.profileSaved ? launch.profile?.username || '' : '');
  const [terms, setTerms] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (preview || !session?.user.id) return;
    void readLaunchDraft(session.user.id).then(draft => {
      if (!active) return;
      if (draft && !launch?.profileSaved) {
        setName(current => current || draft.name); setUsername(current => current || draft.username); setTerms(current => current || draft.terms);
      }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [session?.user.id, preview]);
  useEffect(() => {
    if (preview || !draftReady || !session?.user.id || state?.profileSaved) return;
    const uid = session.user.id;
    const timer = setTimeout(() => { void saveLaunchDraft(uid, { name, username, terms }); }, 200);
    return () => clearTimeout(timer);
  }, [preview, draftReady, session?.user.id, state?.profileSaved, name, username, terms]);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Keep the opening view to two cards; show entry controls after a choice.
  const [slot, setSlot] = useState(!preview && launch?.nominations.length === 1 ? (launch.nominations[0].slot === 1 ? 2 : 1) : 0);
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [nomineeLabels, setNomineeLabels] = useState<NomineeLabels>({});
  useEffect(() => { let active = true; if (!preview && session) void readNomineeLabels(session.user.id).then(value => { if (active) setNomineeLabels(value); }); return () => { active = false; }; }, [session?.user.id]);
  const [findFriends, setFindFriends] = useState(false);
  const [verifyPhone, setVerifyPhone] = useState(false);
  const [requestName, setRequestName] = useState(appleName);
  const [invitationTexts, setInvitationTexts] = useState(false);
  const usernameInput = useRef<TextInput>(null);
  useEffect(() => { if (!preview && launch) setState(launch); }, [launch]);
  const invoke = (name: Parameters<typeof launchRpc>[0], args?: Record<string, unknown>): Promise<LaunchState> => preview ? Promise.resolve(previewLaunchAction(state!, name, args)) : launchRpc(name, args);
  const finish = async () => { if (preview) onDone?.(); else await refreshOnboardingStatus(); };
  const stage = state ? launchStage(state) : 'waiting';
  async function perform(work: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  const refresh = () => perform(async () => { const next = await invoke('get_launch_state'); setState(next); if (next.complete) await finish(); });
  useEffect(() => {
    if (stage !== 'waiting') return;
    const sub = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 30000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [stage]);
  const errorView = error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-red-300 text-sm leading-5 mt-4 mb-4">{error}</Text> : null;

  if (findFriends) return <LaunchShell preview={preview} focused title="Find your people." subtitle="See which of your contacts are on Spotted.">
    <ContactsDiscovery onboarding preview={preview} footer={step => <>
      {errorView}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void perform(finish)} className="min-h-12 items-center justify-center px-4 py-3 active:opacity-70">
        <Text className="text-white/65 text-sm font-sans-medium text-center">{busy ? 'Opening Spotted…' : step === 'results' ? 'Continue to Spotted' : 'Skip for now'}</Text>
      </Pressable>
      <View className="flex-row items-center justify-center gap-1.5 mt-4">
        <SymbolView name="lock" size={12} tintColor={MIST} />
        <Text className="text-white/60 text-xs font-sans text-center">We don’t save your contacts.</Text>
      </View>
    </>} />
  </LaunchShell>;

  if (stage === 'phone') return <LaunchShell preview={preview} key="phone" title="Your number. Your invitation." subtitle="Verify the number you were invited on to unlock your place.">
    <PhoneVerifyForm onVerified={() => { refresh(); }} />
    {errorView}
    <Text className="text-white/60 text-sm leading-5 mt-6">Apple stays connected to this account. Your verified number checks your invitation.</Text>
    <Pressable accessibilityRole="button" disabled={busy} className="py-5" onPress={() => void perform(async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; })}><Text className="text-white/70 text-center">Already have an account? Sign in with your phone</Text></Pressable>
  </LaunchShell>;

  if (stage === 'waiting') return <LaunchShell preview={preview} key="waiting" title={state?.accessRequested ? "You’re on the list." : "Your night is coming."} subtitle="New York is opening in waves.">
    <View className="rounded-3xl bg-white/5 border border-white/10 p-6 mb-6 gap-3">
      <SymbolView name={state?.accessRequested ? "checkmark.circle" : "sparkles"} tintColor={NEON} size={28} />
      <Text style={{ color: MIST }} className="text-base leading-6">{state?.accessRequested ? 'Your request is saved. Come back here when your invitation opens.' : 'Request your place in the next circle.'}</Text>
    </View>
    {!state?.hasPhone ? <>
      <Text className="text-sm text-white/70 leading-5 mb-4">Verify your number to check your invitation.</Text>
      {verifyPhone ? <PhoneVerifyForm onVerified={() => { setVerifyPhone(false); void refresh(); }} /> : <LaunchButton label="Verify my number" onPress={() => setVerifyPhone(true)} />}
    </> : !state.accessRequested ? <>
      <TextInput accessibilityLabel="Your name for the invitation list" value={requestName} onChangeText={setRequestName} maxLength={80} textContentType="name" placeholder="Your name" placeholderTextColor={MIST} className="text-white text-xl border-b border-white/20 pb-3 mb-6" />
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Text me when my invitation opens" accessibilityState={{ checked: invitationTexts }} onPress={() => setInvitationTexts(!invitationTexts)} className="flex-row items-center gap-3 min-h-12 mb-5">
        <View className="h-6 w-6 rounded-md border border-white/30 items-center justify-center" style={invitationTexts ? { backgroundColor: NEON } : undefined}>{invitationTexts ? <SymbolView name="checkmark" tintColor={INK} size={16} /> : null}</View>
        <Text className="flex-1 text-white/65 text-sm leading-5">Text me when my invitation opens.</Text>
      </Pressable>
      <LaunchButton label={busy ? 'Saving…' : 'Request access'} disabled={busy || !requestName.trim()} onPress={() => void perform(async () => {
        const next = await invoke('request_launch_access', { p_name: requestName.trim(), p_invitation_texts: invitationTexts });
        Keyboard.dismiss(); setState(next); if (next.complete) await finish();
      })} />
    </> : null}
    {errorView}
    <Pressable accessibilityRole="button" disabled={busy} className="min-h-12 items-center justify-center mt-4" onPress={() => void refresh()}><Text style={{ color: NEON }}>{busy ? 'Checking…' : 'Check my invitation'}</Text></Pressable>
    <Pressable accessibilityRole="button" className="min-h-12 items-center justify-center" onPress={() => void perform(async () => { await Linking.openURL('https://joinspottedapp.com/'); })}><Text className="text-white/70 text-center">Visit Spotted</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} className="min-h-12 items-center justify-center" onPress={() => void perform(async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; })}><Text className="text-white/60 text-center">Use another number</Text></Pressable>
  </LaunchShell>;

  if (stage === 'profile') return <LaunchShell preview={preview} key="profile" step={1} title="Make an entrance." subtitle="Your name. Your handle.">
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
      const next = await invoke('save_launch_profile', { p_name: name.trim(), p_username: username, p_terms: terms });
      Keyboard.dismiss(); setState(next); if (!preview && session) await clearLaunchDraft(session.user.id); void Haptics.selectionAsync();
    })} /></View>
  </LaunchShell>;

  const choices = state?.nominations || [];
  const pickContact = () => perform(async () => {
    if (preview) { setPhone(slot === 1 ? '+12025550101' : '+12025550102'); setContactName(slot === 1 ? 'Alex Demo' : 'Sam Demo'); return; }
    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return;
    const numbers = [...new Set((contact.phoneNumbers || []).map(p => p.number).filter((p): p is string => !!p))];
    if (!numbers.length) throw new Error('This contact has no phone number. Choose another person or enter one below.');
    const chooseNumber = (value: string) => { setPhone(value); setContactName(contact.name ?? ''); };
    if (numbers.length === 1) { chooseNumber(numbers[0]); return; }
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title: 'Choose their number', options: [...numbers, 'Cancel'], cancelButtonIndex: numbers.length }, i => { if (numbers[i]) chooseNumber(numbers[i]); });
    else Alert.alert('Choose their number', undefined, [...numbers.slice(0, 2).map(number => ({ text: number, onPress: () => chooseNumber(number) })), { text: 'Cancel', style: 'cancel' }]);
  });
  return <LaunchIntroduction userId={session?.user.id} preview={preview} enabled={!!session && stage === 'nominate'}>
  <LaunchShell preview={preview} key="nominate" step={2} title="Who’s next?" subtitle="Two new people. A future wave.">
    <View className="gap-3 mb-6">
      {[1, 2].map(n => {
        const choice = choices.find(c => c.slot === n);
        return <Pressable key={n} disabled={busy} onPress={() => { setSlot(n); setPhone(choice?.phone || ''); setContactName(choice ? nomineeName(nomineeLabels, n, choice.phone) : ''); setError(null); }} accessibilityRole="button" accessibilityLabel={`Nominee ${n}${choice ? `, ${choice.phone}, change` : ', choose a person'}`} accessibilityState={{ selected: slot === n }} className="rounded-2xl border p-4 flex-row items-center gap-4" style={{ borderColor: slot === n ? NEON : 'rgba(255,255,255,0.15)', backgroundColor: choice ? 'rgba(212,255,0,0.06)' : 'rgba(255,255,255,0.03)' }}>
          <Text className="text-xl font-sans-light" style={{ color: choice ? NEON : MIST }}>0{n}</Text>
          <View className="flex-1"><Text className="text-white text-base font-sans-medium">{choice ? nomineeName(nomineeLabels, n, choice.phone) || formatE164(choice.phone) : 'Someone worth knowing'}</Text><Text className="text-white/60 text-xs mt-1">{choice ? 'Saved for a future wave · tap to change' : 'Select a contact or add a number'}</Text></View>
          <SymbolView name={choice ? 'checkmark' : 'plus'} tintColor={choice ? NEON : MIST} size={18} />
        </Pressable>;
      })}
    </View>
    {slot > 0 ? <View className="rounded-2xl bg-white/5 p-5 mb-5">
      <Text className="text-white/70 text-sm mb-3">Nominee {slot}</Text>
      <Pressable disabled={busy} onPress={pickContact} accessibilityRole="button" className="min-h-11 flex-row items-center gap-3 mb-3"><SymbolView name="person.crop.circle.badge.plus" tintColor={NEON} size={22} /><Text style={{ color: NEON }} className="text-base font-sans-medium">Choose from contacts</Text></Pressable>
      <TextInput accessibilityLabel={`Phone number for nominee ${slot}`} value={phone} onChangeText={value => { setPhone(value); setContactName(''); }} keyboardType="phone-pad" placeholder="Or enter a phone number" placeholderTextColor={MIST} maxLength={30} className="text-white text-lg border-b border-white/20 py-3" />
      <Text className="text-white/55 text-xs leading-5 mt-2 mb-4">US numbers or +country code. Only the number you confirm is shared with Spotted.</Text>
      <Pressable accessibilityRole="button" disabled={busy || !nominationPhone(phone)} onPress={() => void perform(async () => {
        const next = await invoke('save_launch_nomination', { p_slot: slot, p_phone: nominationPhone(phone) });
        {
          const confirmedPhone = nominationPhone(phone)!;
          if (session && !preview) await saveNomineeLabel(session.user.id, slot, confirmedPhone, contactName);
          setNomineeLabels(current => ({ ...current, [slot]: { phone: confirmedPhone, name: contactName } }));
        }
        setContactName(''); setState(next); setPhone(''); setSlot(next.nominations.length === 2 ? 0 : next.nominations.some(c => c.slot === 1) ? 2 : 1); Keyboard.dismiss(); void Haptics.selectionAsync();
      })} className="min-h-11 items-center justify-center rounded-xl border border-white/25 disabled:opacity-35"><Text className="text-white font-sans-medium">{busy ? 'Saving…' : `Confirm nominee ${slot}`}</Text></Pressable>
      {choices.length === 2 ? <Pressable className="min-h-11 items-center justify-center mt-2" onPress={() => { setSlot(0); setPhone(''); setError(null); }}><Text className="text-white/65">Keep saved choices</Text></Pressable> : null}
    </View> : null}
    <Text className="text-white/65 text-sm leading-5">Both are required. No invitations sent yet.</Text>
    {errorView}
    <View className="mt-auto pt-7"><LaunchButton label={busy ? 'Saving…' : choices.length === 2 ? 'Let’s go' : `${choices.length} of 2 chosen`} disabled={busy || choices.length !== 2 || slot !== 0} onPress={() => void perform(async () => {
      await invoke('complete_launch_onboarding'); Keyboard.dismiss(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setFindFriends(true);
    })} /></View>
  </LaunchShell>
  </LaunchIntroduction>;
}
