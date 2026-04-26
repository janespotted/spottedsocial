import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import spottedLogo from '@/assets/spotted-s-logo.png';

interface InviterInfo {
  display_name: string;
  avatar_url: string | null;
}

type AuthStep = 'phone' | 'verify' | 'setup';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('invite');

  // Store invite code in localStorage for processing after verification
  useEffect(() => {
    if (inviteCode) {
      localStorage.setItem('pending_invite_code', inviteCode);
    }
  }, [inviteCode]);

  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('+1');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devPassword, setDevPassword] = useState('');
  const navigate = useNavigate();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const devFormRef = useRef<HTMLFormElement>(null);

  // Handle iOS keyboard push
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const showListener = Keyboard.addListener('keyboardDidShow', () => {
      const active = document.activeElement as HTMLElement | null;
      if (active && scrollRef.current) {
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    const hideListener = Keyboard.addListener('keyboardDidHide', () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    return () => {
      showListener.then(h => h.remove());
      hideListener.then(h => h.remove());
    };
  }, []);

  // Scroll dev login form into view when shown
  useEffect(() => {
    if (showDevLogin && devFormRef.current) {
      setTimeout(() => {
        devFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [showDevLogin]);

  // Fetch inviter info if invite code exists
  useEffect(() => {
    if (inviteCode) {
      fetchInviterInfo();
    }
  }, [inviteCode]);

  const fetchInviterInfo = async () => {
    try {
      const { data: invite } = await supabase
        .from('invite_codes')
        .select('user_id')
        .eq('code', inviteCode)
        .maybeSingle();

      if (invite) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', invite.user_id)
          .single();

        if (profile) {
          setInviter(profile);
        }
      }
    } catch (error) {
      console.error('Error fetching inviter:', error);
    }
  };

  const formatPhoneForDisplay = (value: string) => {
    // Only allow digits and leading +
    return value.replace(/[^\d+]/g, '');
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.length < 10) {
      setError('Please enter a valid phone number with country code (e.g. +1234567890)');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: cleaned });
      if (error) {
        if (error.message.includes('Invalid phone')) {
          setError('Invalid phone number. Please include country code (e.g. +1 for US).');
        } else {
          setError(error.message);
        }
        return;
      }
      setStep('verify');
      toast.success('Verification code sent!');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow single digits
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);
    setError(null);

    // Auto-advance to next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5 && newDigits.every(d => d !== '')) {
      handleVerifyOtp(newDigits.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 0) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length && i < 6; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);

    // Focus the next empty input or the last one
    const nextEmpty = newDigits.findIndex(d => d === '');
    otpRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();

    // Auto-submit if all filled
    if (newDigits.every(d => d !== '')) {
      handleVerifyOtp(newDigits.join(''));
    }
  };

  const handleVerifyOtp = async (token?: string) => {
    const code = token || otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code');
      return;
    }

    setError(null);
    setLoading(true);
    const cleaned = phone.replace(/[^\d+]/g, '');

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: cleaned,
        token: code,
        type: 'sms',
      });

      if (error) {
        if (error.message.includes('expired')) {
          setError('Code expired. Please request a new one.');
        } else if (error.message.includes('invalid') || error.message.includes('Invalid')) {
          setError('Invalid code. Please check and try again.');
        } else {
          setError(error.message);
        }
        return;
      }

      // Check if user has an existing profile
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, display_name, username')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile?.display_name && profile?.username) {
          toast.success('Welcome back to Spotted!');
          navigate('/');
        } else {
          setStep('setup');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Please enter your name.');
      return;
    }

    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername) {
      setError('Please choose a username.');
      return;
    }

    if (!/^[a-z0-9_]{3,20}$/.test(trimmedUsername)) {
      setError('Username must be 3-20 characters: letters, numbers, and underscores only.');
      return;
    }

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      // Check username availability
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', trimmedUsername)
        .maybeSingle();

      if (existing) {
        setError('That username is already taken. Try another one.');
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Session expired. Please sign in again.');
        setStep('phone');
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: displayName.trim(),
          username: trimmedUsername,
        });

      if (error) {
        setError(error.message);
        return;
      }

      toast.success('Welcome to Spotted!');
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setOtpDigits(['', '', '', '', '', '']);
    setError(null);
    setLoading(true);

    const cleaned = phone.replace(/[^\d+]/g, '');
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: cleaned });
      if (error) {
        setError(error.message);
        return;
      }
      toast.success('New code sent!');
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: devEmail,
        password: devPassword,
      });
      if (error) {
        setError(error.message);
        return;
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const getDescription = () => {
    if (step === 'phone') {
      return inviteCode
        ? 'Enter your phone number to connect with your friend!'
        : 'See where your friends are tonight.';
    }
    if (step === 'verify') {
      return `We sent a code to ${phone}`;
    }
    return 'Set up your profile to get started.';
  };

  return (
    <div className="relative flex items-center justify-center p-4 bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118]" style={{ height: '100dvh', overflow: 'hidden' }}>
      <div ref={scrollRef} className="w-full overflow-y-auto" style={{ maxHeight: '100dvh' }}>
      {/* Animated floating orbs for ambient depth */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute top-1/4 -right-32 w-80 h-80 bg-accent/15 rounded-full blur-3xl animate-float-slow-reverse" />
        <div className="absolute -bottom-32 left-1/4 w-72 h-72 bg-primary/15 rounded-full blur-3xl animate-float-slow" />
      </div>

      <Card className="relative z-10 w-full max-w-[430px] mx-auto border-0 bg-transparent shadow-none animate-fade-in">
        <CardHeader className="space-y-5 text-center pt-8 pb-6">
          {/* Back button on verify/setup steps */}
          {step !== 'phone' && (
            <button
              onClick={() => {
                if (step === 'setup') return; // Can't go back from setup (already authenticated)
                setStep('phone');
                setOtpDigits(['', '', '', '', '', '']);
                setError(null);
              }}
              className={`absolute left-6 top-12 text-muted-foreground hover:text-foreground transition-colors ${step === 'setup' ? 'hidden' : ''}`}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          {/* Logo with glow effect */}
          <div className="flex justify-center mb-4">
            <img
              src={spottedLogo}
              alt="Spotted"
              className="w-16 h-16 object-contain drop-shadow-[0_0_15px_rgba(212,255,0,0.5)]"
            />
          </div>

          <h1 className="text-4xl font-light tracking-[0.25em] text-foreground">
            Spotted
          </h1>

          {/* Inviter Badge */}
          {inviter && step === 'phone' && (
            <div className="flex items-center justify-center gap-2 bg-primary/20 border border-primary/40 rounded-full px-4 py-2 mx-auto">
              <Avatar className="h-6 w-6 border border-primary/60">
                <AvatarImage src={inviter.avatar_url || undefined} />
                <AvatarFallback className="bg-card text-foreground text-xs">
                  {inviter.display_name?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-foreground/80 text-sm">
                Invited by {inviter.display_name}
              </span>
            </div>
          )}

          <p className="text-base text-muted-foreground">
            {getDescription()}
          </p>
        </CardHeader>

        <CardContent className="space-y-6 px-6 pb-8">
          {step === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(formatPhoneForDisplay(e.target.value))}
                required
                autoFocus
                className="h-12 border-white/20 focus:border-primary focus:shadow-[0_0_15px_hsl(var(--primary)/0.3)] bg-card/50 text-foreground rounded-xl transition-all text-lg tracking-wide"
              />

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-[#7c3aed] hover:bg-[#7c3aed]/90 shadow-[0_0_20px_rgba(124,58,237,0.5)] hover:shadow-[0_0_30px_rgba(124,58,237,0.7)] transition-all text-primary-foreground font-semibold rounded-xl"
                disabled={loading}
              >
                {loading ? 'Sending code...' : 'Continue'}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By continuing, you agree to our{' '}
                <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {' '}and{' '}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              </p>
            </form>
          )}

          {step === 'verify' && (
            <div className="space-y-4">
              {/* OTP Input Grid */}
              <div className="flex justify-center gap-2">
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
                    className="w-12 h-14 text-center text-2xl font-semibold rounded-xl border border-border/60 bg-card/50 text-foreground focus:border-primary focus:shadow-[0_0_15px_hsl(var(--primary)/0.3)] focus:outline-none transition-all"
                  />
                ))}
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Button
                onClick={() => handleVerifyOtp()}
                className="w-full h-12 bg-primary hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.5)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.7)] transition-all text-primary-foreground font-semibold rounded-xl"
                disabled={loading || otpDigits.some(d => d === '')}
              >
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground hover:bg-primary/10"
                onClick={handleResendCode}
                disabled={loading}
              >
                Didn't get the code? Resend
              </Button>
            </div>
          )}

          {step === 'setup' && (
            <form onSubmit={handleProfileSetup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-foreground text-sm font-medium">Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  autoFocus
                  maxLength={50}
                  className="h-11 border-border/60 focus:border-primary focus:shadow-[0_0_15px_hsl(var(--primary)/0.3)] bg-card/50 text-foreground rounded-xl transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-foreground text-sm font-medium">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  required
                  maxLength={20}
                  className="h-11 border-border/60 focus:border-primary focus:shadow-[0_0_15px_hsl(var(--primary)/0.3)] bg-card/50 text-foreground rounded-xl transition-all"
                />
                <p className="text-xs text-muted-foreground">3-20 characters: letters, numbers, underscores</p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border/60 accent-primary"
                />
                <span className="text-xs text-muted-foreground">
                  I agree to the{' '}
                  <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                </span>
              </label>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-primary hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.5)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.7)] transition-all text-primary-foreground font-semibold rounded-xl"
                disabled={loading || !agreedToTerms}
              >
                {loading ? 'Creating profile...' : 'Get Started'}
              </Button>
            </form>
          )}
        </CardContent>

        {/* Business Portal Link */}
        {step !== 'setup' && (
          <div className="text-center pb-6">
            <Link
              to="/business/auth"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Own a venue?{' '}
              <span className="text-primary hover:underline">Sign in for Business</span>
            </Link>
          </div>
        )}

        {/* Dev login */}
        <div className="flex flex-col items-center pb-4">
          {showDevLogin && (
            <form
              ref={devFormRef}
              onSubmit={handleDevLogin}
              className="w-full space-y-2 px-6 pb-2"
            >
              <Input
                type="email"
                placeholder="Email"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                required
                className="h-9 text-sm border-white/20 bg-white/5 text-foreground rounded-lg"
              />
              <Input
                type="password"
                placeholder="Password"
                value={devPassword}
                onChange={(e) => setDevPassword(e.target.value)}
                required
                className="h-9 text-sm border-white/20 bg-white/5 text-foreground rounded-lg"
              />
              {error && showDevLogin && (
                <p className="text-xs text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                size="sm"
                className="w-full h-8 text-xs rounded-lg"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Dev Sign In'}
              </Button>
            </form>
          )}
          <button
            onClick={() => setShowDevLogin(!showDevLogin)}
            className="text-white/30 text-sm leading-none py-4 px-6 tracking-widest"
          >
            &middot;&middot;&middot;
          </button>
        </div>
      </Card>
      </div>
    </div>
  );
}
