import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { loginSchema, signupSchema } from '@/lib/auth-validation';

interface InviterInfo {
  display_name: string;
  avatar_url: string | null;
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('invite');
  
  const [isLogin, setIsLogin] = useState(!inviteCode); // Default to signup if invite code present
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const navigate = useNavigate();

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

  const processInviteCode = async (newUserId: string) => {
    if (!inviteCode) return;

    try {
      const { data, error } = await supabase.rpc('process_invite_code', {
        invite_code: inviteCode,
        new_user_id: newUserId,
      });

      if (error) {
        console.error('Error processing invite:', error);
        return;
      }

      // Type assertion since RPC returns Json type
      const result = data as { success: boolean; inviter_name?: string } | null;
      if (result?.success && result.inviter_name) {
        toast.success(`You're now friends with ${result.inviter_name}! 🎉`);
      }
    } catch (error) {
      console.error('Error processing invite code:', error);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        // Validate login inputs
        const validatedData = loginSchema.parse({ email, password });

        const { error } = await supabase.auth.signInWithPassword({
          email: validatedData.email,
          password: validatedData.password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Invalid email or password');
          }
          throw error;
        }

        toast.success('Welcome back!');
        navigate('/');
      } else {
        // Validate signup inputs
        const validatedData = signupSchema.parse({
          email,
          password,
          displayName,
          username,
          agreedToTerms,
        });

        const redirectUrl = `${window.location.origin}/`;
        const { error, data } = await supabase.auth.signUp({
          email: validatedData.email,
          password: validatedData.password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              display_name: validatedData.displayName,
              username: validatedData.username,
            },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            throw new Error('This email is already registered. Please log in instead.');
          }
          throw error;
        }

        // Process invite code if signup was successful and we have a session
        if (data?.user && data.session && inviteCode) {
          await processInviteCode(data.user.id);
        }

        // Check if email confirmation is required
        if (data?.user && !data.session) {
          toast.success('Account created! Please check your email to confirm.');
        } else {
          toast.success('Welcome to Spotted!');
          navigate('/');
        }
      }
    } catch (error: any) {
      if (error.errors) {
        // Zod validation errors
        const firstError = error.errors[0];
        toast.error(firstError.message);
      } else {
        toast.error(error.message || (isLogin ? 'Login failed' : 'Signup failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      <Card className="w-full max-w-[430px] mx-auto border-2 border-[#a855f7]/40 shadow-[0_0_30px_rgba(168,85,247,0.4)] bg-[#0a0118] rounded-3xl">
        <CardHeader className="space-y-2 text-center pt-8">
          <CardTitle className="text-5xl font-light tracking-[0.3em] text-white">
            Spotted
          </CardTitle>
          
          {/* Inviter Badge */}
          {inviter && !isLogin && (
            <div className="flex items-center justify-center gap-2 bg-[#a855f7]/20 border border-[#a855f7]/40 rounded-full px-4 py-2 mx-auto">
              <Avatar className="h-6 w-6 border border-[#a855f7]/60">
                <AvatarImage src={inviter.avatar_url || undefined} />
                <AvatarFallback className="bg-[#1a0f2e] text-white text-xs">
                  {inviter.display_name?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-white/80 text-sm">
                Invited by {inviter.display_name}
              </span>
            </div>
          )}
          
          <CardDescription className="text-base text-white/60">
            {isLogin 
              ? 'Welcome back! Sign in to see who\'s out tonight.' 
              : inviteCode 
                ? 'Sign up to connect with your friend!'
                : 'Join Spotted to see where your friends are tonight.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-white">Display Name</Label>
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required={!isLogin}
                    className="border-[#a855f7]/40 focus:border-[#a855f7] focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] bg-[#1a0f2e] text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-white">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="@username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={!isLogin}
                    className="border-[#a855f7]/40 focus:border-[#a855f7] focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] bg-[#1a0f2e] text-white"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-[#a855f7]/40 focus:border-[#a855f7] focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] bg-[#1a0f2e] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="border-[#a855f7]/40 focus:border-[#a855f7] focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] bg-[#1a0f2e] text-white"
              />
            </div>
            
            {isLogin && (
              <div className="text-right">
                <Link 
                  to="/reset-password" 
                  className="text-sm text-[#a855f7] hover:text-[#a855f7]/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            {!isLogin && (
              <div className="flex items-start space-x-3 py-2">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  className="border-[#a855f7]/40 data-[state=checked]:bg-[#a855f7] data-[state=checked]:border-[#a855f7] mt-0.5"
                />
                <label htmlFor="terms" className="text-sm text-white/80 leading-tight cursor-pointer">
                  I agree to the{' '}
                  <Link to="/terms" className="text-[#a855f7] hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="text-[#a855f7] hover:underline">
                    Privacy Policy
                  </Link>
                </label>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-[#a855f7] hover:bg-[#a855f7]/90 shadow-[0_0_15px_rgba(168,85,247,0.6)] hover:shadow-[0_0_25px_rgba(168,85,247,0.8)] transition-all text-white font-semibold"
              disabled={loading}
            >
              {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Sign Up'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-white/80 hover:text-white hover:bg-[#a855f7]/20"
              onClick={() => {
                setIsLogin(!isLogin);
                setAgreedToTerms(false);
              }}
            >
              {isLogin ? 'Don\'t have an account? Sign up' : 'Already have an account? Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
