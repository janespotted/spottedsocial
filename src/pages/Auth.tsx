import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { ArrowLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import spottedLogo from '@/assets/spotted-s-logo.png';

interface InviterInfo {
  display_name: string;
  avatar_url: string | null;
}

type AuthStep = 'phone' | 'verify' | 'name' | 'username';

const RESERVED_USERNAMES = new Set([
  'admin', 'support', 'spotted', 'anthropic', 'help', 'official',
  'mod', 'moderator', 'system', 'staff', 'team', 'root', 'api',
]);

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i <= current ? 'w-6 bg-[#d4ff00]' : 'w-1.5 bg-white/20'
          }`}
        />
      ))}
    </div>
  );
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('invite');

  useEffect(() => {
    if (inviteCode) {
      localStorage.setItem('pending_invite_code', inviteCode);
    }
  }, [inviteCode]);

  const [step, setStep] = useState<AuthStep>('phone');
  const [direction, setDirection] = useState(1);
  const [phone, setPhone] = useState('+1');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviter, setInviter] = useState<InviterInfo | null>(null);

  // Name + username state
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Dev login
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devPassword, setDevPassword] = useState('');

  const navigate = useNavigate();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const devFormRef = useRef<HTMLFormElement>(null);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Keyboard handling for iOS — native resize handles viewport,
  // this just ensures the focused field is visible
  useEffect(() => {
    const handleFocus = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    };
    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, []);

  // Dev login scroll
  useEffect(() => {
    if (showDevLogin && devFormRef.current) {
      setTimeout(() => devFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
    }
  }, [showDevLogin]);

  // Fetch inviter info
  useEffect(() => {
    if (inviteCode) fetchInviterInfo();
  }, [inviteCode]);

  // Auto-focus name input when entering name step
  useEffect(() => {
    if (step === 'name') setTimeout(() => nameInputRef.current?.focus(), 400);
    if (step === 'username') setTimeout(() => usernameInputRef.current?.focus(), 400);
  }, [step]);

  const fetchInviterInfo = async () => {
    try {
      const { data: invite } = await supabase
        .from('invite_codes').select('user_id').eq('code', inviteCode).maybeSingle();
      if (invite) {
        const { data: profile } = await supabase
          .from('profiles').select('display_name, avatar_url').eq('id', invite.user_id).single();
        if (profile) setInviter(profile);
      }
    } catch (e) { console.error('Error fetching inviter:', e); }
  };

  const goTo = (next: AuthStep) => {
    const order: AuthStep[] = ['phone', 'verify', 'name', 'username'];
    setDirection(order.indexOf(next) > order.indexOf(step) ? 1 : -1);
    setError(null);
    setStep(next);
  };

  // ── Phone ──
  const formatPhoneForDisplay = (value: string) => value.replace(/[^\d+]/g, '');

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.length < 10) { setError('please enter a valid phone number'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: cleaned });
      if (error) { setError(error.message.includes('Invalid phone') ? 'invalid phone number' : error.message); return; }
      goTo('verify');
      toast.success('code sent');
    } catch (err: any) { setError(err.message || 'failed to send code'); }
    finally { setLoading(false); }
  };

  // ── OTP ──
  const handleOtpChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);
    setError(null);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (value && index === 5 && newDigits.every(d => d !== '')) handleVerifyOtp(newDigits.join(''));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted.length) return;
    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length && i < 6; i++) newDigits[i] = pasted[i];
    setOtpDigits(newDigits);
    const nextEmpty = newDigits.findIndex(d => d === '');
    otpRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
    if (newDigits.every(d => d !== '')) handleVerifyOtp(newDigits.join(''));
  };

  const handleVerifyOtp = async (token?: string) => {
    const code = token || otpDigits.join('');
    if (code.length !== 6) { setError('enter the full 6-digit code'); return; }
    setError(null);
    setLoading(true);
    const cleaned = phone.replace(/[^\d+]/g, '');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ phone: cleaned, token: code, type: 'sms' });
      if (error) {
        if (error.message.includes('expired')) setError('code expired — request a new one');
        else if (error.message.toLowerCase().includes('invalid')) setError('invalid code');
        else setError(error.message);
        return;
      }
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles').select('id, display_name, username').eq('id', data.user.id).maybeSingle();
        if (profile?.display_name && profile?.username) {
          toast.success('welcome back');
          navigate('/');
        } else {
          goTo('name');
        }
      }
    } catch (err: any) { setError(err.message || 'verification failed'); }
    finally { setLoading(false); }
  };

  const handleResendCode = async () => {
    setOtpDigits(['', '', '', '', '', '']);
    setError(null);
    setLoading(true);
    const cleaned = phone.replace(/[^\d+]/g, '');
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: cleaned });
      if (error) { setError(error.message); return; }
      toast.success('new code sent');
    } catch (err: any) { setError(err.message || 'failed to resend'); }
    finally { setLoading(false); }
  };

  // ── Name ──
  const handleNameContinue = () => {
    if (!displayName.trim()) return;
    goTo('username');
  };

  // ── Username ──
  const usernameRegex = /^[a-z0-9_.]{3,20}$/;

  const checkUsernameAvailability = useCallback(async (value: string) => {
    if (!usernameRegex.test(value)) {
      setUsernameAvailable(null);
      setUsernameError('use lowercase letters, numbers, _ or .');
      setSuggestions([]);
      return;
    }
    if (RESERVED_USERNAMES.has(value)) {
      setUsernameAvailable(false);
      setUsernameError("that one's reserved");
      setSuggestions([]);
      return;
    }
    setUsernameChecking(true);
    try {
      const { data } = await supabase
        .from('profiles').select('id').eq('username', value).maybeSingle();
      if (data) {
        setUsernameAvailable(false);
        setUsernameError("that one's taken");
        // Generate suggestions
        const alts = [`${value}2`, `${value}_`, `${value}${Math.floor(Math.random() * 99)}`];
        const { data: taken } = await supabase
          .from('profiles').select('username').in('username', alts);
        const takenSet = new Set(taken?.map(t => t.username) || []);
        setSuggestions(alts.filter(a => !takenSet.has(a)).slice(0, 3));
      } else {
        setUsernameAvailable(true);
        setUsernameError(null);
        setSuggestions([]);
      }
    } catch { setUsernameAvailable(null); }
    finally { setUsernameChecking(false); }
  }, []);

  const handleUsernameChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
    setUsername(cleaned);
    setUsernameAvailable(null);
    setUsernameError(null);
    setSuggestions([]);

    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    if (cleaned.length >= 3) {
      usernameDebounceRef.current = setTimeout(() => checkUsernameAvailability(cleaned), 500);
    } else if (cleaned.length > 0) {
      setUsernameError('at least 3 characters');
    }
  };

  const handleCreateProfile = async () => {
    if (!usernameAvailable || !agreedToTerms) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('session expired'); goTo('phone'); setLoading(false); return; }
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: displayName.trim(),
        username: username.trim(),
      });
      if (error) { setError(error.message); return; }
      toast.success('welcome to spotted');
      navigate('/');
    } catch (err: any) { setError(err.message || 'failed to create profile'); }
    finally { setLoading(false); }
  };

  // ── Dev login ──
  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      localStorage.removeItem('demo_mode');
      const { error } = await supabase.auth.signInWithPassword({ email: devEmail, password: devPassword });
      if (error) { setError(error.message); return; }
      navigate('/');
    } catch (err: any) { setError(err.message || 'login failed'); }
    finally { setLoading(false); }
  };

  // ── Step index for progress dots ──
  const stepIndex = { phone: 0, verify: 1, name: 2, username: 3 }[step];
  const isOnboarding = step === 'name' || step === 'username';

  return (
    <div className="relative flex flex-col bg-[#110a24]" style={{ height: '100dvh', overflow: 'hidden' }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ maxHeight: '100dvh' }}>

        {/* Floating orbs — auth screens only */}
        {!isOnboarding && (
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-float-slow" />
            <div className="absolute top-1/4 -right-32 w-80 h-80 bg-accent/15 rounded-full blur-3xl animate-float-slow-reverse" />
            <div className="absolute -bottom-32 left-1/4 w-72 h-72 bg-primary/15 rounded-full blur-3xl animate-float-slow" />
          </div>
        )}

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative z-10 w-full max-w-[430px] mx-auto px-6"
          >

            {/* ─── PHONE STEP ─── */}
            {step === 'phone' && (
              <div className="flex flex-col items-center justify-center min-h-[85vh]">
                <img src={spottedLogo} alt="Spotted" className="w-16 h-16 object-contain mb-4 drop-shadow-[0_0_15px_rgba(212,255,0,0.5)]" />
                <h1 className="text-4xl font-light tracking-[0.25em] text-white mb-2">Spotted</h1>

                {inviter && (
                  <div className="flex items-center justify-center gap-2 bg-primary/20 border border-primary/40 rounded-full px-4 py-2 mb-4">
                    <Avatar className="h-6 w-6 border border-primary/60">
                      <AvatarImage src={inviter.avatar_url || undefined} />
                      <AvatarFallback className="bg-card text-foreground text-xs">{inviter.display_name?.[0] || 'U'}</AvatarFallback>
                    </Avatar>
                    <span className="text-foreground/80 text-sm">invited by {inviter.display_name}</span>
                  </div>
                )}

                <p className="text-base text-white/50 mb-8">
                  {inviteCode ? 'enter your number to connect with your friend' : 'see where your friends are tonight'}
                </p>

                <form onSubmit={handleSendOtp} className="w-full space-y-5">
                  <Input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneForDisplay(e.target.value))}
                    required
                    autoFocus
                    className="h-12 border-white/20 focus:border-[#d4ff00]/50 bg-white/5 text-white rounded-xl text-lg tracking-wide"
                  />
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button type="submit" className="w-full h-12 bg-[#d4ff00] text-black font-semibold rounded-2xl hover:bg-[#d4ff00]/90" disabled={loading}>
                    {loading ? 'sending...' : 'continue'}
                  </Button>
                  <p className="text-xs text-center text-white/40">
                    by continuing, you agree to our{' '}
                    <Link to="/terms" className="text-white/60 underline">terms</Link> and{' '}
                    <Link to="/privacy" className="text-white/60 underline">privacy policy</Link>
                  </p>
                </form>

                {/* Business + dev login */}
                <div className="mt-8 text-center">
                  <Link to="/business/auth" className="text-sm text-white/40 hover:text-white/60 transition-colors">
                    own a venue? <span className="underline">sign in for business</span>
                  </Link>
                </div>
                <div className="mt-4">
                  <button onClick={() => setShowDevLogin(true)} className="text-white/20 text-sm py-4 px-6 tracking-widest">&middot;&middot;&middot;</button>
                </div>
              </div>
            )}

            {/* ─── VERIFY STEP ─── */}
            {step === 'verify' && (
              <div className="flex flex-col items-center pt-[max(env(safe-area-inset-top),40px)]">
                <button onClick={() => goTo('phone')} className="absolute left-0 top-[max(env(safe-area-inset-top),40px)] text-white/60 hover:text-white p-2">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <img src={spottedLogo} alt="Spotted" className="w-12 h-12 object-contain mb-4" />
                <h2 className="text-2xl font-light text-white mb-2">enter your code</h2>
                <p className="text-sm text-white/50 mb-8">we sent it to {phone}</p>

                <div className="flex justify-center gap-2 mb-6">
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      autoFocus={i === 0}
                      className="w-12 h-14 text-center text-2xl font-semibold rounded-xl border border-white/15 bg-white/5 text-white focus:border-[#d4ff00]/50 focus:outline-none transition-all"
                    />
                  ))}
                </div>

                {error && <p className="text-sm text-red-400 text-center mb-4">{error}</p>}

                <Button
                  onClick={() => handleVerifyOtp()}
                  className="w-full h-12 bg-[#d4ff00] text-black font-semibold rounded-2xl hover:bg-[#d4ff00]/90"
                  disabled={loading || otpDigits.some(d => d === '')}
                >
                  {loading ? 'verifying...' : 'verify'}
                </Button>

                <button onClick={handleResendCode} disabled={loading} className="mt-4 text-sm text-white/40 hover:text-white/60 transition-colors">
                  didn't get it? resend
                </button>
              </div>
            )}

            {/* ─── NAME STEP ─── */}
            {step === 'name' && (
              <div className="flex flex-col pt-[max(env(safe-area-inset-top),20px)]">
                <ProgressDots current={2} total={4} />

                <div className="mt-12 mb-10">
                  <h2 className="text-[28px] font-light text-white leading-tight">what should we call you?</h2>
                  <p className="text-sm text-white/40 mt-2">this is how you'll show up to friends</p>
                </div>

                <input
                  ref={nameInputRef}
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="your name"
                  maxLength={50}
                  className="w-full bg-transparent text-white text-[28px] font-light placeholder:text-white/20 border-b border-white/15 focus:border-[#d4ff00]/50 pb-3 outline-none transition-colors"
                />

                <div className="mt-auto pt-12">
                  <Button
                    onClick={handleNameContinue}
                    className="w-full h-12 bg-[#d4ff00] text-black font-semibold rounded-2xl hover:bg-[#d4ff00]/90 disabled:opacity-30"
                    disabled={!displayName.trim()}
                  >
                    continue
                  </Button>
                </div>
              </div>
            )}

            {/* ─── USERNAME STEP ─── */}
            {step === 'username' && (
              <div className="flex flex-col pt-[max(env(safe-area-inset-top),20px)]">
                <button onClick={() => goTo('name')} className="absolute left-0 top-[max(env(safe-area-inset-top),20px)] text-white/60 hover:text-white p-2">
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <ProgressDots current={3} total={4} />

                <div className="mt-12 mb-10">
                  <h2 className="text-[28px] font-light text-white leading-tight">pick a username</h2>
                  <p className="text-sm text-white/40 mt-2">lowercase letters, numbers, underscores, and periods. 3-20 characters.</p>
                </div>

                <div className="relative">
                  <span className="absolute left-0 top-0 text-[28px] font-light text-white/30 pb-3">@</span>
                  <input
                    ref={usernameInputRef}
                    type="text"
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="username"
                    maxLength={20}
                    className="w-full bg-transparent text-white text-[28px] font-light placeholder:text-white/20 border-b border-white/15 focus:border-[#d4ff00]/50 pb-3 pl-8 outline-none transition-colors"
                  />
                  {/* Availability indicator */}
                  {username.length >= 3 && (
                    <div className="absolute right-0 top-2">
                      {usernameChecking ? (
                        <div className="w-5 h-5 border-2 border-white/20 border-t-[#d4ff00] rounded-full animate-spin" />
                      ) : usernameAvailable === true ? (
                        <Check className="w-5 h-5 text-[#22c55e]" />
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Validation feedback */}
                {usernameError && (
                  <p className="text-sm text-white/40 mt-2">{usernameError}</p>
                )}

                {/* Suggestions */}
                {suggestions.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    {suggestions.map(s => (
                      <button
                        key={s}
                        onClick={() => { setUsername(s); checkUsernameAvailability(s); }}
                        className="px-3 py-1.5 rounded-full border border-white/15 text-sm text-white/60 hover:bg-white/5 transition-colors"
                      >
                        @{s}
                      </button>
                    ))}
                  </div>
                )}

                {/* Terms */}
                <label className="flex items-start gap-3 mt-8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded accent-[#d4ff00]"
                  />
                  <span className="text-xs text-white/40">
                    i agree to the{' '}
                    <Link to="/terms" className="text-white/60 underline">terms of service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="text-white/60 underline">privacy policy</Link>
                  </span>
                </label>

                {error && <p className="text-sm text-red-400 mt-4">{error}</p>}

                <div className="mt-auto pt-8">
                  <Button
                    onClick={handleCreateProfile}
                    className="w-full h-12 bg-[#d4ff00] text-black font-semibold rounded-2xl hover:bg-[#d4ff00]/90 disabled:opacity-30"
                    disabled={loading || !usernameAvailable || !agreedToTerms}
                  >
                    {loading ? 'creating...' : 'get started'}
                  </Button>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dev login overlay */}
      {showDevLogin && (
        <div className="fixed top-20 left-4 right-4 bg-black/90 rounded-2xl p-6 z-50">
          <button onClick={() => { setShowDevLogin(false); setError(null); }} className="absolute top-4 right-4 text-white/60 hover:text-white text-lg">&times;</button>
          <form ref={devFormRef} onSubmit={handleDevLogin} className="space-y-3">
            <Input type="email" placeholder="Email" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} required className="h-10 text-sm border-white/20 bg-white/10 text-foreground rounded-lg" />
            <Input type="password" placeholder="Password" value={devPassword} onChange={(e) => setDevPassword(e.target.value)} required className="h-10 text-sm border-white/20 bg-white/10 text-foreground rounded-lg" />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" size="sm" className="w-full h-9 text-sm rounded-lg" disabled={loading}>{loading ? 'signing in...' : 'dev sign in'}</Button>
          </form>
        </div>
      )}
    </div>
  );
}
